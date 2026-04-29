const express = require('express');
const rateLimit = require('express-rate-limit');
const { loginUser, signupUser } = require('../controllers/userController');
const requireAuth = require('../middleware/requireAuth');
const db = require('../db');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth ──────────────────────────────────────────────────────
router.post('/login',  authLimiter, loginUser);
router.post('/signup', authLimiter, signupUser);

// ── Balances ──────────────────────────────────────────────────
// GET /api/user/balance — returns { BTC: { available, locked }, USDT: { ... }, ... }
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT currency, available_balance, locked_balance
         FROM balances WHERE user_id = $1`,
      [req.user.id]
    );
    const balances = {};
    for (const row of rows) {
      balances[row.currency] = {
        available: parseFloat(row.available_balance),
        locked:    parseFloat(row.locked_balance),
      };
    }
    res.json(balances);
  } catch (err) {
    next(err);
  }
});

// POST /api/user/deposit — credit funds for testing
// Body: { currency: 'USDT', amount: 1000 }
router.post('/deposit', requireAuth, async (req, res, next) => {
  const { currency, amount } = req.body;
  const parsed = parseFloat(amount);

  if (!currency || !parsed || parsed <= 0) {
    return res.status(400).json({ error: 'currency and a positive amount are required' });
  }

  try {
    await db.query(
      `INSERT INTO balances (user_id, currency, available_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, currency)
       DO UPDATE SET available_balance = balances.available_balance + $3, updated_at = NOW()`,
      [req.user.id, currency.toUpperCase(), parsed]
    );
    res.json({ success: true, credited: parsed, currency: currency.toUpperCase() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
