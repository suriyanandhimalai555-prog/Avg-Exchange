/**
 * engineService.js — In-memory matching engine (Singleton)
 *
 * Uses `nodejs-order-book` (v10) to match limit orders in memory.
 * Every fill is immediately persisted to Postgres via db.settleFill().
 *
 * Result shape from book.limit():
 *   done         — array of fully-consumed orders (new order and/or book orders)
 *   partial      — one book order that was partially consumed (still in book, reduced qty)
 *   partialQuantityProcessed — quantity traded against the partial order
 *   quantityLeft — unmatched portion of the new order (stays in book if > 0)
 *   err          — Error object or null
 *
 * One OrderBook instance is maintained per trading pair.
 * recoverFromDB() reloads all open/partially-filled orders on server startup.
 */

const { OrderBook } = require('nodejs-order-book');
const db = require('../db');

class EngineService {
  constructor() {
    // Map<pair, OrderBook>  e.g. 'BTC/USDT' → OrderBook instance
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

  _parsePair(pair) {
    const [base, quote] = pair.split('/');
    if (!base || !quote) throw new Error(`Invalid trading pair: ${pair}`);
    return { baseCurrency: base, quoteCurrency: quote };
  }

  /**
   * Returns the current order book depth for a pair.
   * @returns {{ asks: {price,amount}[], bids: {price,amount}[] }}
   */
  /** Returns all pairs that currently have an order book instance. */
  getPairs() {
    return [...this._books.keys()];
  }

  getDepth(pair) {
    const book   = this._getBook(pair);
    const [asks, bids] = book.depth();   // [[price,qty]...] asks asc, bids desc
    return {
      asks: (asks || []).map(([price, amount]) => ({ price, amount })),
      bids: (bids || []).map(([price, amount]) => ({ price, amount })),
    };
  }

  /**
   * Returns the best available counterparty price for a market order.
   * For a BUY  → returns the lowest ask  (best sell available).
   * For a SELL → returns the highest bid (best buy available).
   * Returns null if the side has no liquidity.
   */
  getBestPrice(pair, side) {
    const { asks, bids } = this.getDepth(pair);
    if (side === 'buy')  return asks.length > 0 ? asks[0].price : null;
    if (side === 'sell') return bids.length > 0 ? bids[0].price : null;
    return null;
  }

  /**
   * Submits a new order to the engine.
   * Limit orders rest in the book; market orders consume available liquidity immediately.
   * Settles any fills against the database atomically (one transaction per fill).
   *
   * @param {object} order
   * @param {number} order.id        DB-assigned order ID
   * @param {number} order.userId
   * @param {string} order.pair      e.g. 'BTC/USDT'
   * @param {'buy'|'sell'} order.side
   * @param {'limit'|'market'} order.type
   * @param {number} order.price     limit price (ignored for market orders)
   * @param {number} order.quantity
   * @returns {{ executedTrades: object[], quantityLeft: number }}
   */
  async placeOrder({ id: dbOrderId, userId, pair, side, type = 'limit', price, quantity }) {
    const { baseCurrency, quoteCurrency } = this._parsePair(pair);
    const book = this._getBook(pair);

    // ── Submit to book ────────────────────────────────────────
    const result = type === 'market'
      ? book.market({ side, id: dbOrderId, size: quantity })
      : book.limit({  side, id: dbOrderId, size: quantity, price });

    if (result.err) {
      throw new Error(`Order book error: ${result.err.message}`);
    }

    // ── Identify fills ────────────────────────────────────────
    // `done` can contain both the new order (if fully consumed) and book orders
    //  that were completely consumed. We only want the counterparty orders.
    // `partial` is a single book order that was partially consumed.
    const fills = [];

    for (const doneOrder of result.done) {
      if (doneOrder.id === dbOrderId) continue; // skip the new order itself
      fills.push({
        matchOrderId: doneOrder.id,
        fillPrice:    doneOrder.price,  // maker's price = execution price
        fillQty:      doneOrder.size,   // remaining size at fill time (correct for partial→full fills)
      });
    }

    // result.partial has two distinct meanings from the library:
    //   a) A COUNTERPARTY resting order that was partially consumed (new order fully filled)
    //      → result.partial.id ≠ dbOrderId  → settle this fill
    //   b) The NEW ORDER's own remainder resting in the book (new order partially filled counterparties)
    //      → result.partial.id = dbOrderId  → already handled via result.done; do NOT double-settle
    if (result.partial && result.partialQuantityProcessed > 0 && result.partial.id !== dbOrderId) {
      fills.push({
        matchOrderId: result.partial.id,
        fillPrice:    result.partial.price,
        fillQty:      result.partialQuantityProcessed,
      });
    }

    // ── Settle each fill ──────────────────────────────────────
    const executedTrades = [];

    for (const fill of fills) {
      // Fetch counterparty details from DB (user_id + original limit price for refund calc)
      const counterRes = await db.query(
        'SELECT user_id, price FROM orders WHERE id = $1',
        [fill.matchOrderId]
      );
      if (counterRes.rows.length === 0) {
        console.error(`[engineService] Counterparty order ${fill.matchOrderId} not found in DB — skipping fill`);
        continue;
      }
      const counter = counterRes.rows[0];

      const isBuyerNew   = (side === 'buy');
      const buyOrderId   = isBuyerNew ? dbOrderId        : fill.matchOrderId;
      const sellOrderId  = isBuyerNew ? fill.matchOrderId : dbOrderId;
      const buyerId      = isBuyerNew ? userId            : counter.user_id;
      const sellerId     = isBuyerNew ? counter.user_id   : userId;
      // The buyer originally locked funds at their limit price — needed to compute refund
      const buyLimitPrice = isBuyerNew ? price : parseFloat(counter.price);

      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        const trade = await db.settleFill(client, {
          buyOrderId, sellOrderId,
          buyerId, sellerId,
          pair, baseCurrency, quoteCurrency,
          fillPrice:    fill.fillPrice,
          fillQty:      fill.fillQty,
          buyLimitPrice,
        });
        await client.query('COMMIT');
        executedTrades.push(trade);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[engineService] settleFill failed — rolling back fill:', err.message);
        // Remove the order from memory to keep the book consistent with DB state
        try { book.cancel(dbOrderId); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    }

    return { executedTrades, quantityLeft: result.quantityLeft };
  }

  /**
   * Reloads all open and partially-filled orders from the database into memory.
   * Call once during server startup to survive restarts without losing the book state.
   */
  async recoverFromDB() {
    const { rows } = await db.query(
      `SELECT id, user_id, pair, side, price, remaining_quantity AS quantity
         FROM orders
        WHERE status IN ('open', 'partially_filled')
        ORDER BY created_at ASC`  // oldest orders get time-priority
    );

    let loaded = 0;
    for (const order of rows) {
      const { baseCurrency, quoteCurrency } = this._parsePair(order.pair);
      const book   = this._getBook(order.pair);
      const result = book.limit({
        side:  order.side,
        id:    order.id,
        size:  parseFloat(order.quantity),
        price: parseFloat(order.price),
      });

      if (result.err) {
        console.error(`[engineService] Could not recover order ${order.id}: ${result.err.message}`);
        continue;
      }

      loaded++;

      // ── Settle any cross-matches that occurred during recovery ──
      // This happens when a resting bid's price ≥ a resting ask's price
      // (e.g. market moved after orders were placed in a previous session).
      // We must settle these or funds stay locked and orders stay "open" in DB.
      const fills = [];
      for (const done of result.done) {
        if (done.id === order.id) continue;
        fills.push({ matchOrderId: done.id, fillPrice: done.price, fillQty: done.size });
      }
      // Same guard as placeOrder: skip when partial is the current order's own remainder
      if (result.partial && result.partialQuantityProcessed > 0 && result.partial.id !== order.id) {
        fills.push({ matchOrderId: result.partial.id, fillPrice: result.partial.price, fillQty: result.partialQuantityProcessed });
      }

      for (const fill of fills) {
        const counterRes = await db.query('SELECT user_id, price FROM orders WHERE id = $1', [fill.matchOrderId]);
        if (counterRes.rows.length === 0) continue;
        const counter = counterRes.rows[0];

        const isBuyerNew  = order.side === 'buy';
        const buyOrderId  = isBuyerNew ? order.id         : fill.matchOrderId;
        const sellOrderId = isBuyerNew ? fill.matchOrderId : order.id;
        const buyerId     = isBuyerNew ? order.user_id     : counter.user_id;
        const sellerId    = isBuyerNew ? counter.user_id   : order.user_id;
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
          console.log(`[engineService] Recovery fill settled: order ${order.id} × ${fill.matchOrderId} @ ${fill.fillPrice}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[engineService] Recovery settleFill failed for ${order.id}:`, err.message);
        } finally {
          client.release();
        }
      }
    }

    console.log(`[engineService] Recovered ${loaded} / ${rows.length} open orders from database`);
  }

  /**
   * Cancels an open order: removes it from memory and unlocks reserved funds.
   */
  async cancelOrder(orderId) {
    const { rows } = await db.query(
      'SELECT id, user_id, pair, side, price, remaining_quantity, status FROM orders WHERE id = $1',
      [orderId]
    );
    if (rows.length === 0) throw new Error('Order not found');

    const order = rows[0];
    if (order.status === 'filled' || order.status === 'cancelled') {
      // Already in a terminal state — idempotent, nothing to do
      return { cancelled: false, orderId, reason: order.status };
    }

    const { baseCurrency, quoteCurrency } = this._parsePair(order.pair);
    const book = this._getBook(order.pair);

    try { book.cancel(orderId); } catch (_) {}

    // Release the locked funds back to available
    const remaining = parseFloat(order.remaining_quantity);
    const lockCurrency = order.side === 'buy' ? quoteCurrency : baseCurrency;
    const lockAmount   = order.side === 'buy' ? parseFloat(order.price) * remaining : remaining;

    await db.unlockFunds(order.user_id, lockCurrency, lockAmount);
    await db.query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [orderId]);

    return { cancelled: true, orderId };
  }
}

EngineService._instance = null;

module.exports = EngineService.getInstance();
