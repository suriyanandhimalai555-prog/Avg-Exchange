/**
 * routes/tradeRoutes.js — Order placement, cancellation, and queries.
 *
 * Factory function receives socket.io `io` for real-time broadcasts.
 */

'use strict';

const express = require('express');
const Decimal = require('../utils/decimal');
const requireAuth = require('../middleware/requireAuth');
const { orderLimiter, cancelLimiter } = require('../middleware/rateLimiters');
const db = require('../db');
const engine = require('../services/engineService');
const { sendTradeNotifications } = require('../services/tradeNotificationService');
const { isValidPair } = require('../utils/pairValidator');
const { validatePositiveDecimal, parsePair } = require('../utils/validation');

const VALID_SIDES = new Set(['buy', 'sell']);
const VALID_TYPES = new Set(['limit', 'market']);
const MAX_ORDER_QUANTITY = '1e12';
const MARKET_ORDER_BUFFER = { buy: '1.05', sell: '0.95' };
const DEPTH_DEBOUNCE_MS = 300;

/**
 * @param {import('socket.io').Server} io
 */
module.exports = (io) => {
  const router = express.Router();

  // Debounced depth broadcast — collapses rapid bot updates into one emit
  const _depthTimers = {};
  const emitDepth = (pair) => {
    if (_depthTimers[pair]) clearTimeout(_depthTimers[pair]);
    _depthTimers[pair] = setTimeout(() => {
      delete _depthTimers[pair];
      const depth = engine.getDepth(pair);
      io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
    }, DEPTH_DEBOUNCE_MS);
  };

  // ── GET /orderbook — Public ──────────────────────────────────
  router.get('/orderbook', async (req, res) => {
    const { pair } = req.query;
    if (!pair || !(await isValidPair(pair))) {
      return res.status(400).json({ error: 'pair query param required (e.g. ?pair=BTC/USDT)' });
    }
    res.json(engine.getDepth(pair));
  });

  // All routes below require auth
  router.use(requireAuth);

  // ── POST /order ──────────────────────────────────────────────
  router.post('/order', orderLimiter, async (req, res, next) => {
    const { pair, side, type = 'limit', price, quantity } = req.body;
    const userId = req.user.id;

    // 1. Input validation
    if (!pair || !side || !quantity) {
      return res.status(400).json({ error: 'pair, side, and quantity are required' });
    }
    if (!VALID_SIDES.has(side))           return res.status(400).json({ error: 'side must be "buy" or "sell"' });
    if (!VALID_TYPES.has(type))           return res.status(400).json({ error: 'type must be "limit" or "market"' });
    // Market orders derive their price from the live book (see step 2), so a
    // price is only required for limit orders.
    if (type === 'limit' && !price)       return res.status(400).json({ error: 'price is required for limit orders' });
    if (!(await isValidPair(pair)))       return res.status(400).json({ error: 'Pair must be in format SYMBOL/USDT (e.g. BTC/USDT)' });

    // KYC gate (admin/bot exempt)
    if (!req.user.is_admin) {
      const kycRow = await db.query('SELECT status FROM kyc_submissions WHERE user_id = $1', [userId]);
      if (!kycRow.rows.length || kycRow.rows[0].status !== 'approved') {
        return res.status(403).json({ error: 'KYC verification required to trade. Please complete your KYC in Account settings.' });
      }
    }

    const qtyCheck = validatePositiveDecimal(quantity, MAX_ORDER_QUANTITY);
    if (!qtyCheck.valid) return res.status(400).json({ error: `quantity ${qtyCheck.error}` });
    const dQuantity = qtyCheck.decimal;

    const { baseCurrency, quoteCurrency } = parsePair(pair);

    // 2. Determine lock price
    let dLockPrice;
    if (type === 'market') {
      const bestPrice = engine.getBestPrice(pair, side);
      if (!bestPrice) {
        return res.status(400).json({ error: `No liquidity on the ${side === 'buy' ? 'sell' : 'buy'} side for a market order` });
      }
      dLockPrice = new Decimal(bestPrice).mul(MARKET_ORDER_BUFFER[side]);
    } else {
      const priceCheck = validatePositiveDecimal(price);
      if (!priceCheck.valid) return res.status(400).json({ error: `price ${priceCheck.error}` });
      dLockPrice = priceCheck.decimal;
    }

    // 3. Check balance
    const lockCurrency = side === 'buy' ? quoteCurrency : baseCurrency;
    const dLockAmount  = side === 'buy' ? dLockPrice.mul(dQuantity) : dQuantity;

    const balRes = await db.query(
      'SELECT available_balance FROM balances WHERE user_id = $1 AND currency = $2',
      [userId, lockCurrency]
    );
    const dAvailable = balRes.rows.length > 0
      ? new Decimal(balRes.rows[0].available_balance)
      : new Decimal(0);

    if (dAvailable.lt(dLockAmount)) {
      return res.status(400).json({
        error: `Insufficient ${lockCurrency} balance (available: ${dAvailable.toFixed(8)}, required: ${dLockAmount.toFixed(8)})`,
      });
    }

    // 4. Lock funds + insert order atomically
    let dbOrder;
    const txClient = await db.getClient();
    try {
      await txClient.query('BEGIN');
      await db.lockFunds(userId, lockCurrency, dLockAmount.toFixed(10), txClient);
      const { rows } = await txClient.query(
        `INSERT INTO orders (user_id, pair, side, type, price, quantity, remaining_quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
        [userId, pair, side, type, dLockPrice.toFixed(10), dQuantity.toFixed(10)]
      );
      dbOrder = rows[0];
      await txClient.query('COMMIT');
    } catch (err) {
      await txClient.query('ROLLBACK');
      txClient.release();
      return res.status(400).json({ error: err.message });
    }
    txClient.release();

    const numPrice    = dLockPrice.toNumber();
    const numQuantity = dQuantity.toNumber();
    const lockAmount  = dLockAmount.toNumber();

    // 5. Submit to matching engine
    let executedTrades, quantityLeft;
    try {
      ({ executedTrades, quantityLeft } = await engine.placeOrder({
        id: dbOrder.id, userId, pair, side, type,
        price: numPrice, quantity: numQuantity, lockedAmount: lockAmount,
      }));
    } catch (err) {
      await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [dbOrder.id]).catch(() => {});
      await db.unlockFunds(userId, lockCurrency, lockAmount).catch((unlockErr) => {
        console.error(`[CRITICAL] Failed to unlock funds for user ${userId} — manual fix required. currency=${lockCurrency} amount=${lockAmount}`, unlockErr.message);
      });
      return next(err);
    }

    // 5a. Market orders: cancel unfilled remainder
    if (type === 'market' && quantityLeft > 0) {
      const filledQty = numQuantity - quantityLeft;
      if (filledQty === 0) {
        await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [dbOrder.id]).catch(() => {});
        await db.unlockFunds(userId, lockCurrency, lockAmount).catch(() => {});
        return res.status(400).json({ error: 'Market order could not be filled — insufficient liquidity' });
      }
      const unusedLock = side === 'buy'
        ? new Decimal(numPrice).mul(quantityLeft).toFixed(10)
        : new Decimal(quantityLeft).toFixed(10);
      await db.unlockFunds(userId, lockCurrency, unusedLock).catch(() => {});
      await db.query(`UPDATE orders SET status = 'filled', remaining_quantity = 0 WHERE id = $1`, [dbOrder.id]).catch(() => {});
    }

    // 6. WebSocket events
    emitDepth(pair);
    io.emit('admin:refresh');

    for (const trade of executedTrades) {
      io.to(`user:${trade.buyer_id}`).emit('balance_update', { userId: trade.buyer_id });
      io.to(`user:${trade.seller_id}`).emit('balance_update', { userId: trade.seller_id });
    }

    // Fire-and-forget email notifications
    sendTradeNotifications({ executedTrades, side, pair, type, userId, quantityLeft });

    res.status(201).json({ order: dbOrder, executedTrades, quantityLeft });
  });

  // ── DELETE /order/:id ────────────────────────────────────────
  router.delete('/order/:id', cancelLimiter, async (req, res, next) => {
    const orderId = parseInt(req.params.id, 10);
    const userId  = req.user.id;

    const { rows } = await db.query('SELECT user_id, pair FROM orders WHERE id = $1', [orderId]);
    if (rows.length === 0)          return res.status(404).json({ error: 'Order not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'Not your order' });

    try {
      const result = await engine.cancelOrder(orderId);
      emitDepth(rows[0].pair);
      io.emit('admin:refresh');
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── GET /orders ──────────────────────────────────────────────
  // Query params (all optional, defaults preserve original UI behavior):
  //   ?status=open,partially_filled   comma-separated; matches any
  //   ?pair=BTC/USDT                  exact pair filter
  //   ?limit=N                        1..1000 (default 50)
  router.get('/orders', async (req, res, next) => {
    try {
      const conds  = ['user_id = $1'];
      const params = [req.user.id];

      if (req.query.status) {
        const statuses = String(req.query.status)
          .split(',').map((s) => s.trim()).filter(Boolean);
        if (statuses.length > 0) {
          params.push(statuses);
          conds.push(`status = ANY($${params.length})`);
        }
      }

      if (req.query.pair) {
        params.push(String(req.query.pair));
        conds.push(`pair = $${params.length}`);
      }

      const requested = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(requested)
        ? Math.min(Math.max(requested, 1), 1000)
        : 50;

      const { rows } = await db.query(
        `SELECT * FROM orders
          WHERE ${conds.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT ${limit}`,
        params
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  // ── GET /trades ──────────────────────────────────────────────
  router.get('/trades', async (req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT * FROM trades WHERE buyer_id = $1 OR seller_id = $1 ORDER BY executed_at DESC LIMIT 50`,
        [req.user.id]
      );
      res.json(rows);
    } catch (err) { next(err); }
  });

  return router;
};
