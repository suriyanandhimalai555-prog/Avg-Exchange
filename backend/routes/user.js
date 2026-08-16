/**
 * routes/user.js — Authentication, profile, balance, and password routes.
 */

'use strict';

const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const validator = require('validator');
const config    = require('../config');
const db        = require('../db');
const email     = require('../services/emailService');
const requireAuth  = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { authLimiter, otpVerifyLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiters');
const { loginUser, signupUser, verifyLoginOtp, verifySignupOtp } = require('../controllers/userController');

const router = express.Router();

// ── Auth (OTP-based) ─────────────────────────────────────────────
router.post('/login',              authLimiter, loginUser);
router.post('/verify-login-otp',   authLimiter, otpVerifyLimiter, verifyLoginOtp);
router.post('/signup',             authLimiter, signupUser);
router.post('/verify-signup-otp',  authLimiter, otpVerifyLimiter, verifySignupOtp);

// ── Bot / Service Account Login ──────────────────────────────────
router.post('/bot-login', authLimiter, async (req, res, next) => {
  const { email: botEmail, password, botSecret } = req.body;
  console.log("================================");
 	console.log("================================");

  if (!config.botSecret) {
    return res.status(503).json({ error: 'Bot auth not configured on this server' });
  }
  // Constant-time compare so the shared secret can't be recovered by timing.
  const provided = Buffer.from(String(botSecret || ''));
  const expected = Buffer.from(String(config.botSecret));
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Invalid bot secret' });
  }

  try {
    const result = await db.query('SELECT * FROM "User" WHERE email = $1', [botEmail]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id }, config.secret, { expiresIn: config.botSessionExpiry });
    res.cookie('token', token, { ...config.cookieDefaults, maxAge: config.botSessionMaxAge });
    res.status(200).json({ id: user.id, email: user.email, token });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', config.cookieDefaults);
  res.json({ success: true });
});

// ── Balances ─────────────────────────────────────────────────────
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT currency, available_balance, locked_balance FROM balances WHERE user_id = $1`,
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
  } catch (err) { next(err); }
});

// Admin-only credit funds (testing/support)
router.post('/deposit', requireAuth, requireAdmin, async (req, res, next) => {
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
  } catch (err) { next(err); }
});

// ── Profile ──────────────────────────────────────────────────────
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

// ── Password ─────────────────────────────────────────────────────
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

// ── Forgot Password ──────────────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  const { email: userEmail } = req.body;
  if (!userEmail) return res.status(400).json({ error: 'Email is required' });

  try {
    const { rows } = await db.query(
      'SELECT id, email FROM "User" WHERE email = $1',
      [userEmail.toLowerCase().trim()]
    );

    // Always return success to prevent email enumeration
    if (rows.length === 0) {
      return res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
    }

    const user = rows[0];
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + config.resetCodeExpiryMinutes * 60 * 1000);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, code, expires_at, used)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (user_id) DO UPDATE
         SET code = EXCLUDED.code,
             expires_at = EXCLUDED.expires_at,
             used = FALSE,
             created_at = NOW()`,
      [user.id, code, expiresAt]
    );

    email.sendPasswordResetEmail(user.email, code, config.resetCodeExpiryMinutes);
    res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
  } catch (err) { next(err); }
});

router.post('/reset-password', forgotPasswordLimiter, async (req, res, next) => {
  const { email: userEmail, code, newPassword } = req.body;

  if (!userEmail || !code || !newPassword) {
    return res.status(400).json({ error: 'Email, code, and new password are required' });
  }
  if (!validator.isStrongPassword(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
    });
  }

  try {
    const { rows } = await db.query(
      `SELECT t.id AS token_id, t.user_id, t.code, t.expires_at, t.used
         FROM password_reset_tokens t
         JOIN "User" u ON u.id = t.user_id
        WHERE u.email = $1`,
      [userEmail.toLowerCase().trim()]
    );

    if (rows.length === 0)   return res.status(400).json({ error: 'Invalid or expired reset code' });
    const token = rows[0];
    if (token.used)          return res.status(400).json({ error: 'This reset code has already been used. Please request a new one.' });
    if (new Date() > new Date(token.expires_at)) return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
    if (token.code !== code.trim()) return res.status(400).json({ error: 'Invalid reset code' });

    const hash = await bcrypt.hash(newPassword, 10);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE "User" SET password = $1 WHERE id = $2', [hash, token.user_id]);
      await client.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [token.token_id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) { next(err); }
});

module.exports = router;
