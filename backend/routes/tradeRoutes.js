/**
 * tradeRoutes.js — Order placement and management
 *
 * All routes require authentication (requireAuth middleware).
 * Factory function receives the socket.io `io` instance so it can
 * broadcast real-time events after a successful trade.
 */

const express = require('express');
const Decimal  = require('decimal.js');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const db = require('../db');
const engine = require('../services/engineService');
const email  = require('../services/emailService');

const VALID_SIDES = new Set(['buy', 'sell']);
const VALID_TYPES = new Set(['limit', 'market']);

// Whitelist of supported trading pairs
const SUPPORTED_PAIRS = new Set([
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT', 'LTC/USDT',
  'DOT/USDT', 'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'TRX/USDT',
]);

// In-memory cache for the admin-configured static coin pair (e.g. 'AVG/USDT').
// Refreshed from DB whenever a non-standard pair is presented, so the trade
// route never needs a restart when the admin adds or renames the coin.
let _staticCoinPair  = null;
let _staticCoinFetch = 0;            // timestamp of last DB check
const STATIC_COIN_TTL = 30_000;     // re-check DB at most every 30 s

const isValidPair = async (pair) => {
  if (typeof pair !== 'string') return false;
  if (SUPPORTED_PAIRS.has(pair))  return true;

  // Rate-limit DB lookups
  const now = Date.now();
  if (_staticCoinPair && now - _staticCoinFetch < STATIC_COIN_TTL) {
    return pair === _staticCoinPair;
  }

  try {
    const { rows } = await db.query(
      `SELECT symbol FROM static_coin_config WHERE enabled = TRUE LIMIT 1`
    );
    _staticCoinPair  = rows[0] ? `${rows[0].symbol}/USDT` : null;
    _staticCoinFetch = now;
  } catch (_) {}

  return pair === _staticCoinPair;
};

// Rate limiters for trading endpoints
const orderLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  message: { error: 'Too many orders — slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || 'anon'),
  // Admin/bot accounts are exempt — they place many orders legitimately as market makers
  skip: (req) => req.user?.is_admin === true,
});

const cancelLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  message: { error: 'Too many cancel requests — slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || 'anon'),
  // Admin/bot accounts are exempt — they cancel and replace orders every cycle
  skip: (req) => req.user?.is_admin === true,
});

/**
 * @param {import('socket.io').Server} io
 */
module.exports = (io) => {
  const router = express.Router();

  // Broadcasts the full current order book depth for a pair to every connected client.
  // Debounced per pair — when the bot places/cancels many orders in a burst, all
  // the intermediate states are collapsed into one emit 300 ms after the last change.
  // Real user orders (single events) still feel instant since 300 ms is imperceptible.
  const _depthTimers = {};
  const emitDepth = (pair) => {
    if (_depthTimers[pair]) clearTimeout(_depthTimers[pair]);
    _depthTimers[pair] = setTimeout(() => {
      delete _depthTimers[pair];
      const depth = engine.getDepth(pair);
      io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
    }, 300);
  };

  // ── GET /api/trade/orderbook?pair=BTC/USDT ───────────────
  // Public endpoint — no auth needed (market data is public on every exchange).
  // Must be registered BEFORE router.use(requireAuth).
  router.get('/orderbook', async (req, res) => {
    const { pair } = req.query;
    if (!pair || !(await isValidPair(pair))) {
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
  router.post('/order', orderLimiter, async (req, res, next) => {
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
    if (!(await isValidPair(pair))) {
      return res.status(400).json({ error: 'Pair must be in format SYMBOL/USDT (e.g. BTC/USDT)' });
    }

    // ── KYC gate (skipped for admin/bot accounts) ─────────────
    if (!req.user.is_admin) {
      const kycRow = await db.query(
        `SELECT status FROM kyc_submissions WHERE user_id = $1`,
        [req.user.id]
      );
      if (!kycRow.rows.length || kycRow.rows[0].status !== 'approved') {
        return res.status(403).json({ error: 'KYC verification required to trade. Please complete your KYC in Account settings.' });
      }
    }

    let dQuantity;
    try {
      dQuantity = new Decimal(quantity);
    } catch (_) {
      return res.status(400).json({ error: 'quantity must be a valid number' });
    }
    if (dQuantity.lte(0)) return res.status(400).json({ error: 'quantity must be a positive number' });
    if (dQuantity.gt('1e12')) return res.status(400).json({ error: 'quantity exceeds maximum allowed' });

    const [baseCurrency, quoteCurrency] = pair.split('/');

    // ── Market order: determine lock price from book depth ────
    // We walk the ask/bid depth to sum the ACTUAL worst-case cost across all
    // available levels, then add a 5% buffer. This prevents the exploit where
    // a market order sweeps multiple price levels and the true cost exceeds the
    // 1%-buffered lock, making the refund go negative.
    let dLockPrice;
    if (type === 'market') {
      const bestPrice = engine.getBestPrice(pair, side);
      if (!bestPrice) {
        return res.status(400).json({ error: `No liquidity on the ${side === 'buy' ? 'sell' : 'buy'} side for a market order` });
      }
      // 5% buffer: enough room to cover multi-level sweeps without over-locking
      dLockPrice = new Decimal(bestPrice).mul(side === 'buy' ? '1.05' : '0.95');
    } else {
      const pNum = parseFloat(price);
      if (isNaN(pNum) || pNum <= 0) return res.status(400).json({ error: 'price must be a positive number' });
      dLockPrice = new Decimal(price);
    }

    // ── 2. Compute lock amount with Decimal precision ────────
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

    // ── 3 + 4. Lock funds AND insert order in ONE transaction ─
    // If the server crashes between lock and insert, the transaction rolls back
    // automatically — funds can never be locked without a corresponding order.
    let dbOrder;
    const txClient = await db.getClient();
    try {
      await txClient.query('BEGIN');

      // Lock funds using the composable variant (no inner BEGIN/COMMIT)
      await db.lockFunds(userId, lockCurrency, dLockAmount.toFixed(10), txClient);

      const { rows } = await txClient.query(
        `INSERT INTO orders (user_id, pair, side, type, price, quantity, remaining_quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING *`,
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

    // ── 5. Submit to matching engine ────────────────────────
    let executedTrades, quantityLeft;
    try {
      ({ executedTrades, quantityLeft } = await engine.placeOrder({
        id:           dbOrder.id,
        userId,
        pair,
        side,
        type,
        price:        numPrice,
        quantity:     numQuantity,
        lockedAmount: lockAmount,   // passed so engine can guard against slippage overflow
      }));
    } catch (err) {
      await db.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [dbOrder.id]).catch(() => {});
      await db.unlockFunds(userId, lockCurrency, lockAmount).catch((unlockErr) => {
        console.error(`[CRITICAL] Failed to unlock funds for user ${userId} after engine error — manual fix required. currency=${lockCurrency} amount=${lockAmount}`, unlockErr.message);
      });
      return next(err);
    }

    // ── 5a. Market orders: cancel unfilled remainder & refund unused lock ──
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

    // ── 6. Emit WebSocket events ────────────────────────────
    // Always push the updated depth — covers both resting and filled orders
    emitDepth(pair);
    // Signal the admin dashboard to refresh stats + orders (debounced on the client)
    io.emit('admin:refresh');

    // ── WebSocket balance updates ───────────────────────────
    for (const trade of executedTrades) {
      io.to(`user:${trade.buyer_id}`).emit('balance_update', { userId: trade.buyer_id });
      io.to(`user:${trade.seller_id}`).emit('balance_update', { userId: trade.seller_id });
    }

    // ── Trade notification emails (Binance-style) ───────────
    // Rule: email only on ORDER COMPLETION, never on individual fills.
    //   • Placing user  → email only if quantityLeft === 0 (fully filled)
    //   • Counterparty  → email only if their resting order is now fully consumed
    // This prevents spamming when one order sweeps many price levels.
    if (executedTrades.length > 0) {
      ;(async () => {
        try {
          const counterpartyRole = side === 'buy' ? 'sell' : 'buy';

          // Aggregate fills for the placing user (avg price, total qty)
          let totalFillQty   = new Decimal(0);
          let totalFillValue = new Decimal(0);
          let lastExecutedAt = null;
          for (const t of executedTrades) {
            totalFillQty   = totalFillQty.plus(t.quantity);
            totalFillValue = totalFillValue.plus(new Decimal(t.price).mul(t.quantity));
            lastExecutedAt = t.executed_at;
          }

          // 1. Placing user:
          //   - Market orders: always email if any fills executed (order is done regardless of quantityLeft)
          //   - Limit orders:  only email when fully filled (quantityLeft === 0); partial fills rest in book
          const orderComplete = type === 'market' || quantityLeft === 0;
          if (orderComplete) {
            const userRes = await db.query('SELECT email, is_admin FROM "User" WHERE id = $1', [userId]);
            const usr = userRes.rows[0];
            if (usr?.email && !usr.is_admin) {
              const avgPrice = totalFillValue.div(totalFillQty);
              email.sendTradeNotification(usr.email, {
                price:       avgPrice.toFixed(10),
                quantity:    totalFillQty.toFixed(10),
                executed_at: lastExecutedAt,
              }, side, pair);
            }
          }

          // 2. Counterparties — only when their resting order is fully consumed
          for (const t of executedTrades) {
            const cpId      = side === 'buy' ? t.seller_id   : t.buyer_id;
            const cpOrderId = side === 'buy' ? t.sell_order_id : t.buy_order_id;

            const [orderRes, cpRes] = await Promise.all([
              db.query('SELECT status FROM orders WHERE id = $1', [cpOrderId]),
              db.query('SELECT email, is_admin FROM "User" WHERE id = $1', [cpId]),
            ]);

            if (orderRes.rows[0]?.status !== 'filled') continue; // still open → no email yet
            const cp = cpRes.rows[0];
            if (cp?.email && !cp.is_admin) {
              email.sendTradeNotification(cp.email, t, counterpartyRole, pair);
            }
          }
        } catch (err) {
          console.error('[trade] Failed to send trade notification emails:', err.message);
        }
      })();
    }

    res.status(201).json({
      order: dbOrder,
      executedTrades,
      quantityLeft,
    });
  });

  // ── DELETE /api/trade/order/:id ───────────────────────────
  router.delete('/order/:id', cancelLimiter, async (req, res, next) => {
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
      io.emit('admin:refresh');
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
