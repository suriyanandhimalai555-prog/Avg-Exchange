/**
 * engineService.js — In-memory matching engine (Singleton)
 *
 * Uses `nodejs-order-book` (v10) to match limit orders in memory.
 * Every fill is immediately persisted to Postgres via db.settleFill().
 *
 * One OrderBook instance is maintained per trading pair.
 * recoverFromDB() reloads all open/partially-filled orders on server startup.
 */

'use strict';

const { OrderBook } = require('nodejs-order-book');
const Decimal       = require('../utils/decimal');
const db            = require('../db');
const { parsePair } = require('../utils/validation');

class EngineService {
  constructor() {
    this._books = new Map();
  }

  static getInstance() {
    if (!EngineService._instance) {
      EngineService._instance = new EngineService();
    }
    return EngineService._instance;
  }

  _getBook(pair) {
    if (!this._books.has(pair)) {
      this._books.set(pair, new OrderBook());
    }
    return this._books.get(pair);
  }

  /** Returns all pairs that currently have an order book instance. */
  getPairs() {
    return [...this._books.keys()];
  }

  /**
   * Returns the current order book depth for a pair.
   * @returns {{ asks: {price,amount}[], bids: {price,amount}[] }}
   */
  getDepth(pair) {
    const book = this._getBook(pair);
    const [asks, bids] = book.depth();
    return {
      asks: (asks || []).map(([price, amount]) => ({ price, amount })),
      bids: (bids || []).map(([price, amount]) => ({ price, amount })),
    };
  }

  /**
   * Returns the best available counterparty price for a market order.
   * BUY -> lowest ask. SELL -> highest bid. Null if no liquidity.
   */
  getBestPrice(pair, side) {
    const { asks, bids } = this.getDepth(pair);
    if (side === 'buy')  return asks.length > 0 ? asks[0].price : null;
    if (side === 'sell') return bids.length > 0 ? bids[0].price : null;
    return null;
  }

  /**
   * Submits a new order to the engine, settles fills atomically.
   *
   * @param {object} order
   * @returns {{ executedTrades: object[], quantityLeft: number }}
   */
  async placeOrder({ id: dbOrderId, userId, pair, side, type = 'limit', price, quantity, lockedAmount }) {
    const { baseCurrency, quoteCurrency } = parsePair(pair);
    const book = this._getBook(pair);

    // Self-trade prevention: cancel any of this user's own resting orders on
    // the opposite side that this order could cross before matching runs. The
    // book has no notion of accounts, so without this step a user can match
    // against their own stale orders (e.g. a bot whose old buys are still open).
    // A limit order only crosses the opposite side up to its price; a market
    // order crosses any price, so we cancel every own resting order on that side.
    {
      const oppositeSide = side === 'buy' ? 'sell' : 'buy';
      const params       = [pair, oppositeSide, userId];
      let priceClause    = '';
      if (type === 'limit' && price != null) {
        const crossOp = side === 'buy' ? '<=' : '>=';
        priceClause   = ` AND price ${crossOp} $4`;
        params.push(price);
      }
      const { rows: ownCrossable } = await db.query(
        `SELECT id FROM orders
          WHERE pair = $1 AND side = $2 AND user_id = $3
            AND status IN ('open', 'partially_filled')${priceClause}`,
        params
      );
      for (const own of ownCrossable) {
        try {
          await this.cancelOrder(own.id);
        } catch (err) {
          console.warn(`[engine] Self-trade guard: could not cancel ${own.id}: ${err.message}`);
        }
      }
    }

    const result = type === 'market'
      ? book.market({ side, id: dbOrderId, size: quantity })
      : book.limit({  side, id: dbOrderId, size: quantity, price });

    if (result.err) {
      throw new Error(`Order book error: ${result.err.message}`);
    }

    const fills = this._extractFills(result, dbOrderId);
    const { executedTrades, skippedQty } = await this._settleFills(fills, {
      dbOrderId, userId, pair, side, type, price, lockedAmount,
      baseCurrency, quoteCurrency, book,
    });

    // Any fill the book matched but we declined to settle (self-trade race or
    // slippage) had its liquidity restored to the book; from the taker's point
    // of view that quantity is unfilled, so add it back to quantityLeft. This
    // keeps the caller's unlock accounting consistent with what actually traded.
    const quantityLeft = (result.quantityLeft || 0) + skippedQty;

    return { executedTrades, quantityLeft };
  }

  /**
   * Extract fill info from the order book result.
   * Separates counterparty fills from the placing order's own entry.
   */
  _extractFills(result, dbOrderId) {
    const fills = [];

    for (const doneOrder of result.done) {
      if (doneOrder.id === dbOrderId) continue;
      fills.push({
        matchOrderId: doneOrder.id,
        fillPrice:    doneOrder.price,
        fillQty:      doneOrder.size,
      });
    }

    if (result.partial && result.partialQuantityProcessed > 0 && result.partial.id !== dbOrderId) {
      fills.push({
        matchOrderId: result.partial.id,
        fillPrice:    result.partial.price,
        fillQty:      result.partialQuantityProcessed,
      });
    }

    return fills;
  }

  /**
   * Restore a fill's liquidity to the in-memory book.
   *
   * The library already consumed the maker order during matching, but if we
   * decline to settle that fill (self-trade race or slippage) the maker's DB
   * row is still 'open' with funds locked. Re-add the consumed quantity so the
   * book stays consistent with the database instead of silently losing it.
   */
  _restoreFill(fill, ctx) {
    const makerSide = ctx.side === 'buy' ? 'sell' : 'buy';
    try {
      ctx.book.limit({
        side:  makerSide,
        id:    fill.matchOrderId,
        size:  fill.fillQty,
        price: fill.fillPrice,
      });
    } catch (err) {
      console.warn(`[engine] Could not restore skipped liquidity for ${fill.matchOrderId}: ${err.message}`);
    }
  }

  /**
   * Settle each fill against the database in its own transaction.
   * @returns {{ executedTrades: object[], skippedQty: number }}
   */
  async _settleFills(fills, ctx) {
    const executedTrades = [];
    let skippedQty       = 0;
    let dAccumulatedCost = new Decimal(0);
    const dLockedAmount  = ctx.lockedAmount ? new Decimal(ctx.lockedAmount) : null;

    for (const fill of fills) {
      const counterRes = await db.query(
        'SELECT user_id, price FROM orders WHERE id = $1',
        [fill.matchOrderId]
      );
      if (counterRes.rows.length === 0) {
        console.error(`[engine] Counterparty order ${fill.matchOrderId} not found — skipping`);
        skippedQty += fill.fillQty;
        continue;
      }
      const counter = counterRes.rows[0];

      // Belt-and-suspenders self-trade guard. The pre-check in placeOrder()
      // covers limit and market orders; this is the fallback for any race the
      // pre-check missed. We skip persistence — the trade simply does not exist
      // — and restore the maker's liquidity so the book matches the DB.
      if (counter.user_id === ctx.userId) {
        console.warn(`[engine] Skipped self-trade: order ${ctx.dbOrderId} vs ${fill.matchOrderId} (user ${ctx.userId})`);
        this._restoreFill(fill, ctx);
        skippedQty += fill.fillQty;
        continue;
      }

      const isBuyerNew    = (ctx.side === 'buy');
      const buyOrderId    = isBuyerNew ? ctx.dbOrderId     : fill.matchOrderId;
      const sellOrderId   = isBuyerNew ? fill.matchOrderId : ctx.dbOrderId;
      const buyerId       = isBuyerNew ? ctx.userId         : counter.user_id;
      const sellerId      = isBuyerNew ? counter.user_id    : ctx.userId;
      const buyLimitPrice = isBuyerNew ? ctx.price : parseFloat(counter.price);

      // Slippage guard for market buy orders
      if (isBuyerNew && dLockedAmount && ctx.type === 'market') {
        const dFillCost = new Decimal(fill.fillPrice).mul(fill.fillQty);
        if (dAccumulatedCost.plus(dFillCost).gt(dLockedAmount)) {
          console.warn(`[engine] Slippage guard: skipping fill — would exceed locked ${dLockedAmount}`);
          this._restoreFill(fill, ctx);
          skippedQty += fill.fillQty;
          continue;
        }
        dAccumulatedCost = dAccumulatedCost.plus(dFillCost);
      }

      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const trade = await db.settleFill(client, {
          buyOrderId, sellOrderId,
          buyerId, sellerId,
          pair: ctx.pair, baseCurrency: ctx.baseCurrency, quoteCurrency: ctx.quoteCurrency,
          fillPrice: fill.fillPrice, fillQty: fill.fillQty,
          buyLimitPrice,
        });
        await client.query('COMMIT');
        executedTrades.push(trade);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[engine] settleFill failed:', err.message);
        try { ctx.book.cancel(ctx.dbOrderId); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    }

    return { executedTrades, skippedQty };
  }

  /**
   * Reloads all open/partially-filled orders from the database into memory.
   * Called once during server startup to survive restarts.
   */
  async recoverFromDB() {
    // Auto-heal ghost orders
    await db.query(`
      UPDATE orders
         SET status = 'filled', updated_at = NOW()
       WHERE remaining_quantity <= 0
         AND status IN ('open', 'partially_filled')
    `);

    const { rows } = await db.query(
      `SELECT id, user_id, pair, side, price, remaining_quantity AS quantity
         FROM orders
        WHERE status IN ('open', 'partially_filled')
          AND remaining_quantity > 0
        ORDER BY created_at ASC`
    );

    let loaded = 0;
    for (const order of rows) {
      const { baseCurrency, quoteCurrency } = parsePair(order.pair);
      const book   = this._getBook(order.pair);
      const result = book.limit({
        side:  order.side,
        id:    order.id,
        size:  parseFloat(order.quantity),
        price: parseFloat(order.price),
      });

      if (result.err) {
        console.error(`[engine] Could not recover order ${order.id}: ${result.err.message}`);
        continue;
      }

      loaded++;

      // Settle any cross-matches that occurred during recovery
      const fills = this._extractFills(result, order.id);
      for (const fill of fills) {
        const counterRes = await db.query('SELECT user_id, price FROM orders WHERE id = $1', [fill.matchOrderId]);
        if (counterRes.rows.length === 0) continue;
        const counter = counterRes.rows[0];

        const isBuyerNew    = order.side === 'buy';
        const buyOrderId    = isBuyerNew ? order.id          : fill.matchOrderId;
        const sellOrderId   = isBuyerNew ? fill.matchOrderId : order.id;
        const buyerId       = isBuyerNew ? order.user_id     : counter.user_id;
        const sellerId      = isBuyerNew ? counter.user_id   : order.user_id;
        const buyLimitPrice = isBuyerNew ? parseFloat(order.price) : parseFloat(counter.price);

        const client = await db.getClient();
        try {
          await client.query('BEGIN');
          await db.settleFill(client, {
            buyOrderId, sellOrderId, buyerId, sellerId,
            pair: order.pair, baseCurrency, quoteCurrency,
            fillPrice: fill.fillPrice, fillQty: fill.fillQty, buyLimitPrice,
          });
          await client.query('COMMIT');
          console.log(`[engine] Recovery fill: order ${order.id} x ${fill.matchOrderId} @ ${fill.fillPrice}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[engine] Recovery fill failed for ${order.id}:`, err.message);
        } finally {
          client.release();
        }
      }
    }

    console.log(`[engine] Recovered ${loaded} / ${rows.length} open orders`);
  }

  /**
   * Cancels an open order: removes from memory and unlocks reserved funds.
   * Uses a DB transaction with FOR UPDATE to prevent races with concurrent fills.
   */
  async cancelOrder(orderId) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT id, user_id, pair, side, price, remaining_quantity, status FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Order not found');
      }

      const order = rows[0];
      if (order.status === 'filled' || order.status === 'cancelled') {
        await client.query('ROLLBACK');
        return { cancelled: false, orderId, reason: order.status };
      }

      const { baseCurrency, quoteCurrency } = parsePair(order.pair);
      const book = this._getBook(order.pair);

      try { book.cancel(orderId); } catch (_) {}

      const dRemaining   = new Decimal(order.remaining_quantity);
      const lockCurrency = order.side === 'buy' ? quoteCurrency : baseCurrency;
      const lockAmount   = order.side === 'buy'
        ? new Decimal(order.price).mul(dRemaining).toFixed(10)
        : dRemaining.toFixed(10);

      // Unlock within the same transaction
      const balRow = await client.query(
        `SELECT locked_balance FROM balances WHERE user_id = $1 AND currency = $2 FOR UPDATE`,
        [order.user_id, lockCurrency]
      );
      if (balRow.rows.length > 0) {
        const locked = new Decimal(balRow.rows[0].locked_balance);
        const toUnlock = Decimal.min(new Decimal(lockAmount), locked);
        if (toUnlock.gt(0)) {
          await client.query(
            `UPDATE balances
                SET locked_balance    = locked_balance    - $1,
                    available_balance = available_balance + $1,
                    updated_at        = NOW()
              WHERE user_id = $2 AND currency = $3`,
            [toUnlock.toFixed(10), order.user_id, lockCurrency]
          );
        }
      }

      await client.query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [orderId]);
      await client.query('COMMIT');

      return { cancelled: true, orderId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

EngineService._instance = null;

module.exports = EngineService.getInstance();
