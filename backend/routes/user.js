const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { loginUser, signupUser } = require('../controllers/userController');
const requireAuth = require('../middleware/requireAuth');
const db = require('../db');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth ──────────────────────────────────────────────────────
router.post('/login',  authLimiter, loginUser);
router.post('/signup', authLimiter, signupUser);
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true });
});

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

// GET /api/user/me — return full profile + KYC status
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.is_admin, u.referral_code, u.referral_count, u.created_at,
              k.status AS kyc_status, k.submitted_at AS kyc_submitted_at,
              k.reviewed_at AS kyc_reviewed_at, k.reviewer_note AS kyc_reviewer_note
         FROM "User" u
         LEFT JOIN kyc_submissions k ON k.user_id = u.id
        WHERE u.id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/user/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new password are required' });
  }
  if (!validator.isStrongPassword(newPassword)) {
    return res.status(400).json({
      error: 'New password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
    });
  }
  try {
    const { rows } = await db.query('SELECT password FROM "User" WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE "User" SET password = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
