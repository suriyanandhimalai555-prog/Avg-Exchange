/**
 * tradeRoutes.js — Order placement and management
 *
 * All routes require authentication (requireAuth middleware).
 * Factory function receives the socket.io `io` instance so it can
 * broadcast real-time events after a successful trade.
 */

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const db = require('../db');
const engine = require('../services/engineService');

const VALID_SIDES = new Set(['buy', 'sell']);
const VALID_TYPES = new Set(['limit', 'market']);
const isValidPair = (pair) => typeof pair === 'string' && /^[A-Z1-9]+\/USDT$/.test(pair);

/**
 * @param {import('socket.io').Server} io
 */
module.exports = (io) => {
  const router = express.Router();

  // Broadcasts the full current order book depth for a pair to every connected client.
  // Called after every state change: place, cancel, fill.
  const emitDepth = (pair) => {
    const depth = engine.getDepth(pair);
    io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
  };

  // ── GET /api/trade/orderbook?pair=BTC/USDT ───────────────
  // Public endpoint — no auth needed (market data is public on every exchange).
  // Must be registered BEFORE router.use(requireAuth).
  router.get('/orderbook', (req, res) => {
    const { pair } = req.query;
    if (!pair || !isValidPair(pair)) {
      return res.status(400).json({ error: 'pair query param required (e.g. ?pair=BTC/USDT)' });
    }
    const depth = engine.getDepth(pair);
    res.json(depth);
  });

  // All routes below this line require a valid JWT
  router.use(requireAuth);

  // ── POST /api/trade/order ─────────────────────────────────
  /**
   * Place a new limit order.
   *
   * Body: { pair, side, type, price, quantity }
   *
   * Flow:
   *   1. Validate inputs
   *   2. Check available balance
   *   3. Lock funds (atomic DB transaction)
   *   4. Insert order record into DB
   *   5. Pass to matching engine
   *   6. Emit WebSocket events for each fill
   */
  router.post('/order', async (req, res, next) => {
    const { pair, side, type = 'limit', price, quantity } = req.body;
    const userId = req.user.id;

    // ── 1. Input validation ─────────────────────────────────
    if (!pair || !side || !price || !quantity) {
      return res.status(400).json({ error: 'pair, side, price, and quantity are required' });
    }
    if (!VALID_SIDES.has(side)) {
      return res.status(400).json({ error: 'side must be "buy" or "sell"' });
    }
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be "limit" or "market"' });
    }
    if (!isValidPair(pair)) {
      return res.status(400).json({ error: 'Pair must be in format SYMBOL/USDT (e.g. BTC/USDT)' });
    }

    let numPrice      = parseFloat(price);
    const numQuantity = parseFloat(quantity);
    if (isNaN(numQuantity) || numQuantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });

    // For market orders the submitted price is just a UI hint — actual execution
    // price is the best available in the book. We use the book price (+ 1% buffer)
    // to lock enough funds so settleFill never goes negative.
    const [baseCurrency, quoteCurrency] = pair.split('/');

    if (type === 'market') {
      const bestPrice = engine.getBestPrice(pair, side);
      if (!bestPrice) {
        return res.status(400).json({ error: `No liquidity on the ${side === 'buy' ? 'sell' : 'buy'} side for a market order` });
      }
      // Lock 1 % extra to absorb any micro-movement between lock and fill
      numPrice = side === 'buy' ? bestPrice * 1.01 : bestPrice * 0.99;
    } else {
      if (isNaN(numPrice) || numPrice <= 0) return res.status(400).json({ error: 'price must be a positive number' });
    }

    // ── 2. Check available balance ──────────────────────────
    // Buyers need quoteCurrency (e.g. USDT);  sellers need baseCurrency (e.g. BTC)
    const lockCurrency = side === 'buy' ? quoteCurrency : baseCurrency;
    const lockAmount   = side === 'buy' ? numPrice * numQuantity : numQuantity;

    const balRes = await db.query(
      'SELECT available_balance FROM balances WHERE user_id = $1 AND currency = $2',
      [userId, lockCurrency]
    );
    const available = balRes.rows.length > 0 ? parseFloat(balRes.rows[0].available_balance) : 0;

    if (available < lockAmount) {
      return res.status(400).json({
        error: `Insufficient ${lockCurrency} balance (available: ${available.toFixed(8)}, required: ${lockAmount.toFixed(8)})`,
      });
    }

    // ── 3. Lock funds ───────────────────────────────────────
    // Throws if a race condition consumed the balance between steps 2 and 3
    try {
      await db.lockFunds(userId, lockCurrency, lockAmount);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // ── 4. Insert order record ──────────────────────────────
    let dbOrder;
    try {
      const { rows } = await db.query(
        `INSERT INTO orders (user_id, pair, side, type, price, quantity, remaining_quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING *`,
        [userId, pair, side, type, numPrice, numQuantity]
      );
      dbOrder = rows[0];
    } catch (err) {
      // Insertion failed — unlock the funds we just locked
      await db.unlockFunds(userId, lockCurrency, lockAmount).catch(() => {});
      return next(err);
    }

    // ── 5. Submit to matching engine ────────────────────────
    let executedTrades, quantityLeft;
    try {
      ({ executedTrades, quantityLeft } = await engine.placeOrder({
        id:       dbOrder.id,
        userId,
        pair,
        side,
        type,
        price:    numPrice,
        quantity: numQuantity,
      }));
    } catch (err) {
      // Engine failure — cancel the order in DB and unlock funds
      await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [dbOrder.id]).catch(() => {});
      await db.unlockFunds(userId, lockCurrency, lockAmount).catch(() => {});
      return next(err);
    }

    // ── 5a. Market orders must fill fully — cancel any unfilled remainder ──
    // (happens when book liquidity is exhausted mid-fill)
    if (type === 'market' && quantityLeft > 0) {
      const filledQty = numQuantity - quantityLeft;
      if (filledQty === 0) {
        // Nothing filled at all — cancel entirely and unlock
        await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [dbOrder.id]).catch(() => {});
        await db.unlockFunds(userId, lockCurrency, lockAmount).catch(() => {});
        return res.status(400).json({ error: 'Market order could not be filled — insufficient liquidity' });
      }
      // Partial fill — cancel the unfilled portion and refund the unused lock
      const unusedLock = side === 'buy' ? numPrice * quantityLeft : quantityLeft;
      await db.unlockFunds(userId, lockCurrency, unusedLock).catch(() => {});
      await db.query(`UPDATE orders SET status = 'filled', remaining_quantity = 0 WHERE id = $1`, [dbOrder.id]).catch(() => {});
    }

    // ── 6. Emit WebSocket events ────────────────────────────
    // Always push the updated depth — covers both resting and filled orders
    emitDepth(pair);

    // Notify each party of their balance change
    for (const trade of executedTrades) {
      io.to(`user:${trade.buyer_id}`).emit('balance_update', { userId: trade.buyer_id });
      io.to(`user:${trade.seller_id}`).emit('balance_update', { userId: trade.seller_id });
    }

    res.status(201).json({
      order: dbOrder,
      executedTrades,
      quantityLeft,
    });
  });

  // ── DELETE /api/trade/order/:id ───────────────────────────
  router.delete('/order/:id', async (req, res, next) => {
    const orderId = parseInt(req.params.id, 10);
    const userId  = req.user.id;

    // Ensure the order belongs to this user
    const { rows } = await db.query('SELECT user_id, pair FROM orders WHERE id = $1', [orderId]);
    if (rows.length === 0)             return res.status(404).json({ error: 'Order not found' });
    if (rows[0].user_id !== userId)    return res.status(403).json({ error: 'Not your order' });

    try {
      const result = await engine.cancelOrder(orderId);
      // Push updated depth — cancelled order is now gone from the book
      emitDepth(rows[0].pair);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── GET /api/trade/orders ─────────────────────────────────
  router.get('/orders', async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user.id]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  // ── GET /api/trade/trades ─────────────────────────────────
  router.get('/trades', async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT * FROM trades WHERE buyer_id = $1 OR seller_id = $1 ORDER BY executed_at DESC LIMIT 50`,
        [req.user.id]
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
