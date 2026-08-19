/**
 * engineService.js — In-memory matching engine (Singleton)
 *
 * Uses `nodejs-order-book` (v10) to match limit orders in memory.
 * Every fill is immediately persisted to Postgres via db.settleFill().
 *
 * One OrderBook instance is maintained per trading pair.
 *
 * IMPORTANT:
 * - Every mutation of an order book is serialized by a per-pair async lock.
 * - Different trading pairs can process concurrently.
 * - The same trading pair can never have two concurrent book mutations.
 * - DB settlement remains transactional.
 * - Self-trade prevention is performed while holding the pair lock.
 * - cancelOrder() uses the same pair lock.
 * - recoverFromDB() also uses the pair lock.
 */

'use strict';

const { OrderBook } = require('nodejs-order-book');
const Decimal       = require('../utils/decimal');
const db            = require('../db');
const { parsePair } = require('../utils/validation');

class EngineService {
  constructor() {
    this._books = new Map();

    /*
     * Per-pair promise queue.
     *
     * Example:
     *
     * BTC/USDT -> request A -> request B -> request C
     * ETH/USDT -> request D
     *
     * BTC/USDT requests are serialized.
     * ETH/USDT can execute independently.
     */
    this._pairLocks = new Map();
  }

  static getInstance() {
    if (!EngineService._instance) {
      EngineService._instance = new EngineService();
    }

    return EngineService._instance;
  }

  /**
   * Get or create an order book for a pair.
   */
  _getBook(pair) {
    if (!this._books.has(pair)) {
      this._books.set(pair, new OrderBook());
    }

    return this._books.get(pair);
  }

  /**
   * Execute a function exclusively for one trading pair.
   *
   * This is a lightweight async mutex implemented without another npm package.
   *
   * Important:
   * The callback may contain await statements. The next request for the
   * same pair waits until this callback completely finishes.
   *
   * Different pairs do not block each other.
   */
  async _withPairLock(pair, fn) {
    const previous = this._pairLocks.get(pair) || Promise.resolve();

    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });

    this._pairLocks.set(pair, current);

    await previous;

    try {
      return await fn();
    } finally {
      release();

      /*
       * Only delete the lock if this request is still the latest queued
       * operation for the pair.
       */
      if (this._pairLocks.get(pair) === current) {
        this._pairLocks.delete(pair);
      }
    }
  }

  /**
   * Returns all pairs that currently have an order book instance.
   */
  getPairs() {
    return [...this._books.keys()];
  }

  /**
   * Returns the current order book depth for a pair.
   *
   * NOTE:
   * Reading depth does not mutate the order book, so it does not need
   * to wait for the pair mutation queue.
   *
   * @returns {{ asks: {price,amount}[], bids: {price,amount}[] }}
   */
  getDepth(pair) {
    const book = this._getBook(pair);
    const [asks, bids] = book.depth();

    return {
      asks: (asks || []).map(([price, amount]) => ({
        price,
        amount,
      })),

      bids: (bids || []).map(([price, amount]) => ({
        price,
        amount,
      })),
    };
  }

  /**
   * Returns the best available counterparty price for a market order.
   *
   * BUY  -> lowest ask
   * SELL -> highest bid
   */
  getBestPrice(pair, side) {
    const { asks, bids } = this.getDepth(pair);

    if (side === 'buy') {
      return asks.length > 0 ? asks[0].price : null;
    }

    if (side === 'sell') {
      return bids.length > 0 ? bids[0].price : null;
    }

    return null;
  }

  /**
   * Submits a new order to the engine.
   *
   * ALL matching and settlement operations for this pair happen while
   * holding the pair lock.
   *
   * @param {object} order
   * @returns {{ executedTrades: object[], quantityLeft: number }}
   */
  async placeOrder({
    id: dbOrderId,
    userId,
    pair,
    side,
    type = 'limit',
    price,
    quantity,
    lockedAmount,
  }) {
    return this._withPairLock(pair, async () => {
      return this._placeOrderLocked({
        id: dbOrderId,
        userId,
        pair,
        side,
        type,
        price,
        quantity,
        lockedAmount,
      });
    });
  }

  /**
   * Internal placeOrder implementation.
   *
   * IMPORTANT:
   * Caller MUST already hold the pair lock.
   */
  async _placeOrderLocked({
    id: dbOrderId,
    userId,
    pair,
    side,
    type = 'limit',
    price,
    quantity,
    lockedAmount,
  }) {
    const { baseCurrency, quoteCurrency } = parsePair(pair);
    const book = this._getBook(pair);

    /*
     * ---------------------------------------------------------------
     * 1. Verify that the DB order still exists and is still open.
     * ---------------------------------------------------------------
     *
     * This closes an important race:
     *
     * Request A:
     *   inserts order
     *
     * Request B:
     *   cancels order
     *
     * Request A:
     *   reaches engine afterwards
     *
     * In that situation we must NOT put a cancelled DB order into
     * the in-memory order book.
     */
    const orderState = await db.query(
      `SELECT id, user_id, pair, side, type, price, quantity,
              remaining_quantity, status
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [dbOrderId]
    );

    if (orderState.rows.length === 0) {
      throw new Error(`Order ${dbOrderId} not found`);
    }

    const dbOrder = orderState.rows[0];

    if (!['open', 'partially_filled'].includes(dbOrder.status)) {
      throw new Error(
        `Order ${dbOrderId} is not active (status=${dbOrder.status})`
      );
    }

    /*
     * Make sure the engine receives the same user/pair/order data
     * that was stored in PostgreSQL.
     */
    if (String(dbOrder.user_id) !== String(userId)) {
      throw new Error(`Order ${dbOrderId} user mismatch`);
    }

    if (dbOrder.pair !== pair) {
      throw new Error(`Order ${dbOrderId} pair mismatch`);
    }

    /*
     * ---------------------------------------------------------------
     * 2. Self-trade prevention
     * ---------------------------------------------------------------
     *
     * Because the order book itself has no user/account information,
     * we remove any of this user's own opposite-side orders that could
     * cross the new order.
     *
     * This happens WHILE holding the pair lock.
     *
     * Therefore another same-pair order cannot enter the book between
     * the self-trade check and matching.
     */
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';

    const params = [pair, oppositeSide, userId];

    let priceClause = '';

    if (type === 'limit' && price != null) {
      const crossOp = side === 'buy' ? '<=' : '>=';

      priceClause = ` AND price ${crossOp} $4`;
      params.push(price);
    }

    const { rows: ownCrossable } = await db.query(
      `SELECT id
         FROM orders
        WHERE pair = $1
          AND side = $2
          AND user_id = $3
          AND status IN ('open', 'partially_filled')
          ${priceClause}
        ORDER BY created_at ASC`,
      params
    );

    for (const own of ownCrossable) {
      try {
        await this._cancelOrderUnsafe(own.id);
      } catch (err) {
        /*
         * Do not allow a failed self-trade cancellation to silently
         * create a self-trade.
         *
         * Stop this order instead.
         */
        throw new Error(
          `Self-trade protection failed for order ${own.id}: ${err.message}`
        );
      }
    }

    /*
     * ---------------------------------------------------------------
     * 3. Match order in memory
     * ---------------------------------------------------------------
     *
     * This is the ONLY place where the OrderBook is mutated for a new
     * order.
     *
     * The pair lock guarantees that another request cannot mutate the
     * same OrderBook simultaneously.
     */
    const result =
      type === 'market'
        ? book.market({
            side,
            id: dbOrderId,
            size: quantity,
          })
        : book.limit({
            side,
            id: dbOrderId,
            size: quantity,
            price,
          });

    if (result.err) {
      throw new Error(
        `Order book error: ${result.err.message}`
      );
    }

    /*
     * ---------------------------------------------------------------
     * 4. Extract fills
     * ---------------------------------------------------------------
     */
    const fills = this._extractFills(result, dbOrderId);

    /*
     * ---------------------------------------------------------------
     * 5. Persist fills
     * ---------------------------------------------------------------
     */
    const {
      executedTrades,
      skippedQty,
    } = await this._settleFills(fills, {
      dbOrderId,
      userId,
      pair,
      side,
      type,
      price,
      lockedAmount,
      baseCurrency,
      quoteCurrency,
      book,
    });

    /*
     * If the order book matched liquidity but we rejected that fill
     * because of self-trade/slippage, the liquidity was restored.
     *
     * Therefore that quantity remains unfilled from the taker's
     * perspective.
     */
    const quantityLeft =
      (result.quantityLeft || 0) + skippedQty;

    return {
      executedTrades,
      quantityLeft,
    };
  }

  /**
   * Extract fill information from order-book result.
   */
  _extractFills(result, dbOrderId) {
    const fills = [];

    for (const doneOrder of result.done || []) {
      if (doneOrder.id === dbOrderId) {
        continue;
      }

      fills.push({
        matchOrderId: doneOrder.id,
        fillPrice: doneOrder.price,
        fillQty: doneOrder.size,
      });
    }

    if (
      result.partial &&
      result.partialQuantityProcessed > 0 &&
      result.partial.id !== dbOrderId
    ) {
      fills.push({
        matchOrderId: result.partial.id,
        fillPrice: result.partial.price,
        fillQty: result.partialQuantityProcessed,
      });
    }

    return fills;
  }

  /**
   * Restore skipped liquidity to the in-memory book.
   *
   * Caller must hold the pair lock.
   */
  _restoreFill(fill, ctx) {
    const makerSide =
      ctx.side === 'buy' ? 'sell' : 'buy';

    try {
      ctx.book.limit({
        side: makerSide,
        id: fill.matchOrderId,
        size: fill.fillQty,
        price: fill.fillPrice,
      });
    } catch (err) {
      console.error(
        `[engine] Could not restore skipped liquidity ` +
        `for order ${fill.matchOrderId}: ${err.message}`
      );

      /*
       * This is serious because DB and memory could diverge.
       */
      throw new Error(
        `Failed to restore order-book liquidity for ${fill.matchOrderId}`
      );
    }
  }

  /**
   * Settle fills against PostgreSQL.
   *
   * Caller must hold the pair lock.
   */
  async _settleFills(fills, ctx) {
    const executedTrades = [];

    let skippedQty = 0;

    let dAccumulatedCost = new Decimal(0);

    const dLockedAmount = ctx.lockedAmount
      ? new Decimal(ctx.lockedAmount)
      : null;

    for (const fill of fills) {
      /*
       * Lock/read the maker order state before settling.
       *
       * The pair lock prevents our own engine requests from changing
       * this pair concurrently, while FOR UPDATE also protects the DB
       * row against external DB transactions.
       */
      const counterRes = await db.query(
        `SELECT id,
                user_id,
                pair,
                side,
                price,
                remaining_quantity,
                status
           FROM orders
          WHERE id = $1
          FOR UPDATE`,
        [fill.matchOrderId]
      );

      if (counterRes.rows.length === 0) {
        console.error(
          `[engine] Counterparty order ${fill.matchOrderId} not found`
        );

        /*
         * Restore the liquidity because the order book consumed it,
         * but the DB order does not exist anymore.
         */
        this._restoreFill(fill, ctx);

        skippedQty += fill.fillQty;
        continue;
      }

      const counter = counterRes.rows[0];

      /*
       * Counterparty must still be active.
       *
       * If it was cancelled externally, do not create a trade against
       * a cancelled DB order.
       */
      if (
        !['open', 'partially_filled'].includes(counter.status) ||
        new Decimal(counter.remaining_quantity).lte(0)
      ) {
        console.warn(
          `[engine] Counterparty order ${fill.matchOrderId} ` +
          `is no longer active (status=${counter.status})`
        );

        this._restoreFill(fill, ctx);

        skippedQty += fill.fillQty;
        continue;
      }

      /*
       * -------------------------------------------------------------
       * HARD self-trade protection
       * -------------------------------------------------------------
       */
      if (String(counter.user_id) === String(ctx.userId)) {
        console.warn(
          `[engine] Prevented self-trade: ` +
          `order ${ctx.dbOrderId} vs ${fill.matchOrderId} ` +
          `(user ${ctx.userId})`
        );

        this._restoreFill(fill, ctx);

        skippedQty += fill.fillQty;

        continue;
      }

      const isBuyerNew = ctx.side === 'buy';

      const buyOrderId = isBuyerNew
        ? ctx.dbOrderId
        : fill.matchOrderId;

      const sellOrderId = isBuyerNew
        ? fill.matchOrderId
        : ctx.dbOrderId;

      const buyerId = isBuyerNew
        ? ctx.userId
        : counter.user_id;

      const sellerId = isBuyerNew
        ? counter.user_id
        : ctx.userId;

      const buyLimitPrice = isBuyerNew
        ? ctx.price
        : parseFloat(counter.price);

      /*
       * -------------------------------------------------------------
       * Market BUY slippage protection
       * -------------------------------------------------------------
       */
      if (
        isBuyerNew &&
        dLockedAmount &&
        ctx.type === 'market'
      ) {
        const dFillCost =
          new Decimal(fill.fillPrice)
            .mul(fill.fillQty);

        if (
          dAccumulatedCost
            .plus(dFillCost)
            .gt(dLockedAmount)
        ) {
          console.warn(
            `[engine] Slippage guard: skipping fill ` +
            `— would exceed locked ${dLockedAmount.toString()}`
          );

          this._restoreFill(fill, ctx);

          skippedQty += fill.fillQty;

          continue;
        }

        dAccumulatedCost =
          dAccumulatedCost.plus(dFillCost);
      }

      /*
       * -------------------------------------------------------------
       * Atomic settlement transaction
       * -------------------------------------------------------------
       */
      const client = await db.getClient();

      try {
        await client.query('BEGIN');

        const trade = await db.settleFill(client, {
          buyOrderId,
          sellOrderId,
          buyerId,
          sellerId,

          pair: ctx.pair,

          baseCurrency:
            ctx.baseCurrency,

          quoteCurrency:
            ctx.quoteCurrency,

          fillPrice:
            fill.fillPrice,

          fillQty:
            fill.fillQty,

          buyLimitPrice,
        });

        await client.query('COMMIT');

        executedTrades.push(trade);
      } catch (err) {
        await client.query('ROLLBACK');

        console.error(
          `[engine] settleFill failed for ` +
          `order ${ctx.dbOrderId} vs ${fill.matchOrderId}:`,
          err.message
        );

        /*
         * The matching engine consumed the new order.
         * Since settlement failed, remove the new order from memory.
         */
        try {
          ctx.book.cancel(ctx.dbOrderId);
        } catch (_) {}

        throw err;
      } finally {
        client.release();
      }
    }

    return {
      executedTrades,
      skippedQty,
    };
  }

  /**
   * Reload open orders after server startup.
   *
   * Recovery for each pair is serialized through the same pair lock
   * used by normal trading.
   */
  async recoverFromDB() {
    /*
     * Auto-heal ghost orders.
     */
    await db.query(`
      UPDATE orders
         SET status = 'filled',
             updated_at = NOW()
       WHERE remaining_quantity <= 0
         AND status IN ('open', 'partially_filled')
    `);

    const { rows } = await db.query(
      `SELECT id,
              user_id,
              pair,
              side,
              price,
              remaining_quantity AS quantity
         FROM orders
        WHERE status IN ('open', 'partially_filled')
          AND remaining_quantity > 0
        ORDER BY created_at ASC`
    );

    let loaded = 0;

    /*
     * Recovery order is globally serialized by the database ordering,
     * while individual book mutations are protected by their pair lock.
     */
    for (const order of rows) {
      try {
        await this._withPairLock(order.pair, async () => {
          const {
            baseCurrency,
            quoteCurrency,
          } = parsePair(order.pair);

          const book =
            this._getBook(order.pair);

          /*
           * Verify that the order is still active before loading it.
           */
          const currentRes = await db.query(
            `SELECT id,
                    user_id,
                    pair,
                    side,
                    price,
                    remaining_quantity,
                    status
               FROM orders
              WHERE id = $1
              FOR UPDATE`,
            [order.id]
          );

          if (currentRes.rows.length === 0) {
            return;
          }

          const current =
            currentRes.rows[0];

          if (
            !['open', 'partially_filled']
              .includes(current.status)
          ) {
            return;
          }

          if (
            new Decimal(current.remaining_quantity)
              .lte(0)
          ) {
            return;
          }

          const result = book.limit({
            side: current.side,
            id: current.id,
            size: parseFloat(
              current.remaining_quantity
            ),
            price: parseFloat(
              current.price
            ),
          });

          if (result.err) {
            console.error(
              `[engine] Could not recover order ` +
              `${current.id}: ${result.err.message}`
            );

            return;
          }

          loaded++;

          /*
           * Recovery should normally not create cross-matches because
           * the database contains the current state. However, if it
           * does, settle them using the same safety rules.
           */
          const fills =
            this._extractFills(
              result,
              current.id
            );

          for (const fill of fills) {
            const counterRes = await db.query(
              `SELECT id,
                      user_id,
                      pair,
                      side,
                      price,
                      remaining_quantity,
                      status
                 FROM orders
                WHERE id = $1
                FOR UPDATE`,
              [fill.matchOrderId]
            );

            if (
              counterRes.rows.length === 0
            ) {
              this._restoreFill(fill, {
                side: current.side,
                book,
              });

              continue;
            }

            const counter =
              counterRes.rows[0];

            /*
             * Never recover a self-trade.
             */
            if (
              String(counter.user_id) ===
              String(current.user_id)
            ) {
              console.warn(
                `[engine] Recovery prevented self-trade: ` +
                `${current.id} vs ${fill.matchOrderId} ` +
                `(user ${current.user_id})`
              );

              this._restoreFill(fill, {
                side: current.side,
                book,
              });

              continue;
            }

            if (
              !['open', 'partially_filled']
                .includes(counter.status)
            ) {
              this._restoreFill(fill, {
                side: current.side,
                book,
              });

              continue;
            }

            const isBuyerNew =
              current.side === 'buy';

            const buyOrderId =
              isBuyerNew
                ? current.id
                : fill.matchOrderId;

            const sellOrderId =
              isBuyerNew
                ? fill.matchOrderId
                : current.id;

            const buyerId =
              isBuyerNew
                ? current.user_id
                : counter.user_id;

            const sellerId =
              isBuyerNew
                ? counter.user_id
                : current.user_id;

            const buyLimitPrice =
              isBuyerNew
                ? parseFloat(current.price)
                : parseFloat(counter.price);

            const client =
              await db.getClient();

            try {
              await client.query('BEGIN');

              await db.settleFill(client, {
                buyOrderId,
                sellOrderId,

                buyerId,
                sellerId,

                pair: current.pair,

                baseCurrency,
                quoteCurrency,

                fillPrice:
                  fill.fillPrice,

                fillQty:
                  fill.fillQty,

                buyLimitPrice,
              });

              await client.query('COMMIT');

              console.log(
                `[engine] Recovery fill: ` +
                `order ${current.id} x ` +
                `${fill.matchOrderId} @ ` +
                `${fill.fillPrice}`
              );
            } catch (err) {
              await client.query(
                'ROLLBACK'
              );

              console.error(
                `[engine] Recovery fill failed ` +
                `for ${current.id}:`,
                err.message
              );
            } finally {
              client.release();
            }
          }
        });
      } catch (err) {
        console.error(
          `[engine] Recovery failed for order ${order.id}:`,
          err.message
        );
      }
    }

    console.log(
      `[engine] Recovered ${loaded} / ${rows.length} open orders`
    );
  }

  /**
   * Public cancellation method.
   *
   * We first read the pair so that we know which pair lock to acquire.
   * The actual cancellation then re-reads the order under FOR UPDATE.
   */
  async cancelOrder(orderId) {
    const lookup = await db.query(
      `SELECT pair
         FROM orders
        WHERE id = $1`,
      [orderId]
    );

    if (lookup.rows.length === 0) {
      throw new Error('Order not found');
    }

    const pair = lookup.rows[0].pair;

    return this._withPairLock(pair, async () => {
      return this._cancelOrderUnsafe(orderId);
    });
  }

  /**
   * Internal cancellation implementation.
   *
   * IMPORTANT:
   * Caller MUST already hold the pair lock.
   *
   * This function must NEVER call _withPairLock().
   */
  async _cancelOrderUnsafe(orderId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id,
                user_id,
                pair,
                side,
                price,
                remaining_quantity,
                status
           FROM orders
          WHERE id = $1
          FOR UPDATE`,
        [orderId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');

        throw new Error(
          'Order not found'
        );
      }

      const order = rows[0];

      /*
       * If already completed, nothing to do.
       */
      if (
        order.status === 'filled' ||
        order.status === 'cancelled'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return {
          cancelled: false,
          orderId,
          reason: order.status,
        };
      }

      const {
        baseCurrency,
        quoteCurrency,
      } = parsePair(order.pair);

      const book =
        this._getBook(order.pair);

      /*
       * Remove the order from the in-memory book.
       */
      try {
        book.cancel(orderId);
      } catch (_) {}

      const dRemaining =
        new Decimal(
          order.remaining_quantity
        );

      const lockCurrency =
        order.side === 'buy'
          ? quoteCurrency
          : baseCurrency;

      const lockAmount =
        order.side === 'buy'
          ? new Decimal(order.price)
              .mul(dRemaining)
              .toFixed(10)
          : dRemaining.toFixed(10);

      /*
       * Unlock reserved funds atomically.
       */
      const balRow = await client.query(
        `SELECT locked_balance
           FROM balances
          WHERE user_id = $1
            AND currency = $2
          FOR UPDATE`,
        [
          order.user_id,
          lockCurrency,
        ]
      );

      if (balRow.rows.length > 0) {
        const locked =
          new Decimal(
            balRow.rows[0]
              .locked_balance
          );

        const toUnlock =
          Decimal.min(
            new Decimal(lockAmount),
            locked
          );

        if (toUnlock.gt(0)) {
          await client.query(
            `UPDATE balances
                SET locked_balance =
                      locked_balance - $1,
                    available_balance =
                      available_balance + $1,
                    updated_at = NOW()
              WHERE user_id = $2
                AND currency = $3`,
            [
              toUnlock.toFixed(10),
              order.user_id,
              lockCurrency,
            ]
          );
        }
      }

      await client.query(
        `UPDATE orders
            SET status = 'cancelled',
                updated_at = NOW()
          WHERE id = $1`,
        [orderId]
      );

      await client.query(
        'COMMIT'
      );

      return {
        cancelled: true,
        orderId,
      };
    } catch (err) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}

      throw err;
    } finally {
      client.release();
    }
  }
}

EngineService._instance = null;

module.exports =
  EngineService.getInstance();
