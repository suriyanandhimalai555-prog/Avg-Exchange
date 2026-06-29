/**
 * routes/adminRoutes.js — Admin dashboard endpoints.
 */

'use strict';

const express      = require('express');
const Decimal      = require('../utils/decimal');
const config       = require('../config');
const requireAuth  = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const db           = require('../db');
const s3           = require('../services/s3Service');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /stats
router.get('/stats', async (req, res, next) => {
  try {
    const [usersRes, ordersRes, tradesRes, kycRes, volumeRes] = await Promise.all([
      db.query('SELECT COUNT(*) FROM "User"'),
      db.query("SELECT COUNT(*) FROM orders WHERE status IN ('open','partially_filled')"),
      db.query('SELECT COUNT(*) FROM trades'),
      db.query("SELECT COUNT(*) FROM kyc_submissions WHERE status = 'pending'"),
      db.query('SELECT COALESCE(SUM(price::numeric * quantity::numeric), 0) AS volume FROM trades'),
    ]);
    res.json({
      totalUsers:     parseInt(usersRes.rows[0].count),
      openOrders:     parseInt(ordersRes.rows[0].count),
      totalTrades:    parseInt(tradesRes.rows[0].count),
      pendingKyc:     parseInt(kycRes.rows[0].count),
      totalVolumeUSD: parseFloat(volumeRes.rows[0].volume),
    });
  } catch (err) { next(err); }
});

// GET /users
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
             k.status AS kyc_status,
             COALESCE(
               jsonb_object_agg(b.currency, (b.available_balance + b.locked_balance)::numeric)
               FILTER (WHERE b.currency IS NOT NULL),
               '{}'::jsonb
             ) AS balances
        FROM "User" u
        LEFT JOIN kyc_submissions k ON k.user_id = u.id
        LEFT JOIN balances b ON b.user_id = u.id
       GROUP BY u.id, u.name, u.email, u.is_admin, u.created_at, k.status
       ORDER BY u.created_at DESC
       LIMIT 200
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /users/:userId
router.get('/users/:userId', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    const [userRes, balancesRes, ordersRes, tradesRes] = await Promise.all([
      db.query(`
        SELECT u.id, u.name, u.email, u.is_admin, u.created_at, u.referral_code,
               k.status AS kyc_status, k.full_name AS kyc_full_name,
               k.document_type, k.document_number,
               k.submitted_at AS kyc_submitted_at,
               k.reviewed_at  AS kyc_reviewed_at,
               k.reviewer_note
          FROM "User" u
          LEFT JOIN kyc_submissions k ON k.user_id = u.id
         WHERE u.id = $1
      `, [userId]),
      db.query(`
        SELECT currency, available_balance::numeric AS available, locked_balance::numeric AS locked
          FROM balances WHERE user_id = $1 ORDER BY currency
      `, [userId]),
      db.query(`
        SELECT id, pair, side, type, price, quantity, remaining_quantity, status, created_at
          FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
      `, [userId]),
      db.query(`
        SELECT id, pair, price, quantity, executed_at,
               CASE WHEN buyer_id = $1 THEN 'buy' ELSE 'sell' END AS side
          FROM trades WHERE buyer_id = $1 OR seller_id = $1 ORDER BY executed_at DESC LIMIT 20
      `, [userId]),
    ]);
    if (!userRes.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({
      user:     userRes.rows[0],
      balances: balancesRes.rows,
      orders:   ordersRes.rows,
      trades:   tradesRes.rows,
    });
  } catch (err) { next(err); }
});

// PATCH /users/:userId/toggle-admin
router.patch('/users/:userId/toggle-admin', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot change your own admin status' });
  try {
    const { rows } = await db.query(
      `UPDATE "User" SET is_admin = NOT is_admin WHERE id = $1 RETURNING id, is_admin`,
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, is_admin: rows[0].is_admin });
  } catch (err) { next(err); }
});

// POST /users/:userId/add-balance
router.post('/users/:userId/add-balance', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  const { currency, amount } = req.body;
  let dAmount;
  try { dAmount = new Decimal(amount); } catch (_) {
    return res.status(400).json({ error: 'amount must be a valid number' });
  }
  if (!userId || !currency || dAmount.lte(0)) {
    return res.status(400).json({ error: 'userId, currency, and positive amount are required' });
  }
  try {
    await db.query(
      `INSERT INTO balances (user_id, currency, available_balance) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, currency)
       DO UPDATE SET available_balance = balances.available_balance + $3, updated_at = NOW()`,
      [userId, currency.toUpperCase(), dAmount.toFixed(10)]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── KYC management ───────────────────────────────────────────────
router.get('/kyc', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT k.user_id, k.full_name, k.date_of_birth, k.document_type,
             k.document_number, k.document_path, k.status, k.submitted_at, k.reviewed_at,
             k.reviewer_note, u.email, u.name AS user_name
        FROM kyc_submissions k
        JOIN "User" u ON u.id = k.user_id
       ORDER BY CASE k.status WHEN 'pending' THEN 0 ELSE 1 END, k.submitted_at DESC
       LIMIT 200
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/kyc/:userId/approve', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    await db.query(
      `UPDATE kyc_submissions SET status = 'approved', reviewed_at = NOW(), reviewer_note = NULL WHERE user_id = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/kyc/:userId/reject', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  const { note } = req.body;
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    await db.query(
      `UPDATE kyc_submissions SET status = 'rejected', reviewed_at = NOW(), reviewer_note = $2 WHERE user_id = $1`,
      [userId, note || 'Rejected by admin']
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/kyc/:userId/document', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    const { rows } = await db.query('SELECT document_path FROM kyc_submissions WHERE user_id = $1', [userId]);
    if (!rows[0]?.document_path) return res.status(404).json({ error: 'No document found' });
    const signedUrl = await s3.getDownloadUrl(rows[0].document_path);
    res.redirect(signedUrl);
  } catch (err) { next(err); }
});

// ── Orders ───────────────────────────────────────────────────────
router.get('/orders', async (req, res, next) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  try {
    const [dataRes, countRes] = await Promise.all([
      db.query(`
        SELECT o.id, o.pair, o.side, o.type, o.price, o.quantity,
               o.remaining_quantity, o.status, o.created_at, u.email, u.name
          FROM orders o JOIN "User" u ON u.id = o.user_id
         ORDER BY o.created_at DESC LIMIT $1 OFFSET $2
      `, [limit, offset]),
      db.query('SELECT COUNT(*) FROM orders'),
    ]);
    const total = parseInt(countRes.rows[0].count);
    res.json({ orders: dataRes.rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

// ── Static coin config ───────────────────────────────────────────
router.get('/static-coin', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM static_coin_config LIMIT 1');
    res.json(rows[0] || null);
  } catch (err) { next(err); }
});

router.put('/static-coin', async (req, res, next) => {
  const { symbol, min_price, max_price, current_price, enabled } = req.body;

  if (!symbol || min_price == null || max_price == null || current_price == null) {
    return res.status(400).json({ error: 'symbol, min_price, max_price, and current_price are required' });
  }

  const dMin     = parseFloat(min_price);
  const dMax     = parseFloat(max_price);
  const dCurrent = parseFloat(current_price);

  if (isNaN(dMin) || isNaN(dMax) || isNaN(dCurrent) || dMin <= 0 || dMax <= dMin) {
    return res.status(400).json({ error: 'Prices must be positive numbers and max_price must be greater than min_price' });
  }
  if (dCurrent < dMin || dCurrent > dMax) {
    return res.status(400).json({ error: 'current_price must be within [min_price, max_price]' });
  }

  const sym = symbol.toUpperCase().trim();
  try {
    const { rows } = await db.query(
      `INSERT INTO static_coin_config (symbol, min_price, max_price, current_price, enabled, price_24h_ago, price_24h_updated_at)
       VALUES ($1, $2, $3, $4, $5, $4, NOW())
       ON CONFLICT (symbol) DO UPDATE
         SET min_price     = EXCLUDED.min_price,
             max_price     = EXCLUDED.max_price,
             current_price = EXCLUDED.current_price,
             enabled       = EXCLUDED.enabled,
             price_24h_ago = COALESCE(static_coin_config.price_24h_ago, EXCLUDED.current_price),
             updated_at    = NOW()
       RETURNING *`,
      [sym, dMin, dMax, dCurrent, enabled ?? true]
    );

    // Seed bot account with static coin tokens
    const botEmail = config.botEmail;
    if (botEmail) {
      const botRes = await db.query('SELECT id FROM "User" WHERE email = $1', [botEmail]);
      if (botRes.rows.length > 0) {
        await db.query(
          `INSERT INTO balances (user_id, currency, available_balance) VALUES ($1, $2, 1000000)
           ON CONFLICT (user_id, currency) DO NOTHING`,
          [botRes.rows[0].id, sym]
        );
      }
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Referrals ────────────────────────────────────────────────────
// GET /referrals
// Returns one row per user, with their direct referral count and the
// referrer's info (if any). Supports ?q= to filter by name/email/code,
// ?sort=direct|total|recent (default: direct).
router.get('/referrals', async (req, res, next) => {
  const q    = (req.query.q || '').trim();
  const sort = ['direct', 'recent', 'total'].includes(req.query.sort) ? req.query.sort : 'direct';
  const params = [];
  const where  = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.referral_code ILIKE $${params.length})`);
  }

  const orderBy = sort === 'recent'
    ? 'u.created_at DESC'
    : sort === 'total'
      ? 'total_count DESC NULLS LAST, direct_count DESC NULLS LAST'
      : 'direct_count DESC NULLS LAST, u.created_at DESC';

  try {
    const { rows } = await db.query(`
      WITH RECURSIVE subtree AS (
        SELECT id AS root_id, id, referred_by FROM "User"
        UNION ALL
        SELECT s.root_id, c.id, c.referred_by
          FROM "User" c
          JOIN subtree s ON c.referred_by = s.id
      ),
      totals AS (
        SELECT root_id, COUNT(*) - 1 AS total_count
          FROM subtree
         GROUP BY root_id
      )
      SELECT
        u.id, u.name, u.email, u.referral_code, u.created_at,
        u.referred_by,
        ref.name          AS referrer_name,
        ref.email         AS referrer_email,
        ref.referral_code AS referrer_code,
        COALESCE((SELECT COUNT(*) FROM "User" c WHERE c.referred_by = u.id), 0) AS direct_count,
        COALESCE(t.total_count, 0) AS total_count
        FROM "User" u
        LEFT JOIN "User" ref ON ref.id = u.referred_by
        LEFT JOIN totals t  ON t.root_id = u.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${orderBy}
       LIMIT 500
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /referrals/:userId/tree
// Recursive subtree rooted at userId. Flat list; client builds the tree.
// Each row includes depth (root = 0) and the referrer id (parent in tree).
router.get('/referrals/:userId/tree', async (req, res, next) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: 'userId must be a number' });
  }

  try {
    const { rows } = await db.query(`
      WITH RECURSIVE tree AS (
        SELECT id, name, email, referral_code, referred_by, created_at,
               0 AS depth, ARRAY[id] AS path
          FROM "User"
         WHERE id = $1
        UNION ALL
        SELECT u.id, u.name, u.email, u.referral_code, u.referred_by, u.created_at,
               t.depth + 1, t.path || u.id
          FROM "User" u
          JOIN tree t ON u.referred_by = t.id
         WHERE NOT u.id = ANY(t.path)
      )
      SELECT
        t.id, t.name, t.email, t.referral_code, t.referred_by,
        t.created_at, t.depth,
        COALESCE((SELECT COUNT(*) FROM "User" c WHERE c.referred_by = t.id), 0) AS direct_count
        FROM tree t
       ORDER BY t.depth ASC, t.created_at ASC
       LIMIT 1000
    `, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      root:  rows[0],
      nodes: rows,
      totalCount: rows.length - 1,
      maxDepth:   rows[rows.length - 1].depth,
    });
  } catch (err) { next(err); }
});

module.exports = router;
