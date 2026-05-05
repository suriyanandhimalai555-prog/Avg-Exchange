// backend/routes/adminRoutes.js
const express      = require('express');
const requireAuth  = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const db           = require('../db');
const s3           = require('../services/s3Service');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats
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
      totalUsers:    parseInt(usersRes.rows[0].count),
      openOrders:    parseInt(ordersRes.rows[0].count),
      totalTrades:   parseInt(tradesRes.rows[0].count),
      pendingKyc:    parseInt(kycRes.rows[0].count),
      totalVolumeUSD: parseFloat(volumeRes.rows[0].volume),
    });
  } catch (err) { next(err); }
});

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
             k.status AS kyc_status,
             COALESCE(SUM(b.available_balance + b.locked_balance), 0) AS total_balance_raw
        FROM "User" u
        LEFT JOIN kyc_submissions k ON k.user_id = u.id
        LEFT JOIN balances b ON b.user_id = u.id AND b.currency = 'USDT'
       GROUP BY u.id, u.name, u.email, u.is_admin, u.created_at, k.status
       ORDER BY u.created_at DESC
       LIMIT 200
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/admin/kyc — pending + recent KYC submissions
router.get('/kyc', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT k.user_id, k.full_name, k.date_of_birth, k.document_type,
             k.document_number, k.document_path, k.status, k.submitted_at, k.reviewed_at,
             k.reviewer_note, u.email, u.name AS user_name
        FROM kyc_submissions k
        JOIN "User" u ON u.id = k.user_id
       ORDER BY
         CASE k.status WHEN 'pending' THEN 0 ELSE 1 END,
         k.submitted_at DESC
       LIMIT 200
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/kyc/:userId/approve
router.post('/kyc/:userId/approve', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    await db.query(
      `UPDATE kyc_submissions
          SET status = 'approved', reviewed_at = NOW(), reviewer_note = NULL
        WHERE user_id = $1`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/admin/kyc/:userId/reject
router.post('/kyc/:userId/reject', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  const { note } = req.body;
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    await db.query(
      `UPDATE kyc_submissions
          SET status = 'rejected', reviewed_at = NOW(), reviewer_note = $2
        WHERE user_id = $1`,
      [userId, note || 'Rejected by admin']
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:userId/toggle-admin
router.patch('/users/:userId/toggle-admin', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  // Prevent self-demotion
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

// POST /api/admin/users/:userId/add-balance
const Decimal = require('decimal.js');
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
      `INSERT INTO balances (user_id, currency, available_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, currency)
       DO UPDATE SET available_balance = balances.available_balance + $3, updated_at = NOW()`,
      [userId, currency.toUpperCase(), dAmount.toFixed(10)]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/admin/kyc/:userId/document — redirect to a signed S3 URL for the document
router.get('/kyc/:userId/document', async (req, res, next) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });
  try {
    const { rows } = await db.query(
      'SELECT document_path FROM kyc_submissions WHERE user_id = $1',
      [userId]
    );
    if (!rows[0]?.document_path) {
      return res.status(404).json({ error: 'No document found' });
    }
    const signedUrl = await s3.getDownloadUrl(rows[0].document_path);
    res.redirect(signedUrl);
  } catch (err) { next(err); }
});

// GET /api/admin/orders — paginated orders
// Query params: ?page=1&limit=50
router.get('/orders', async (req, res, next) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  try {
    const [dataRes, countRes] = await Promise.all([
      db.query(`
        SELECT o.id, o.pair, o.side, o.type, o.price, o.quantity,
               o.remaining_quantity, o.status, o.created_at,
               u.email, u.name
          FROM orders o
          JOIN "User" u ON u.id = o.user_id
         ORDER BY o.created_at DESC
         LIMIT $1 OFFSET $2
      `, [limit, offset]),
      db.query('SELECT COUNT(*) FROM orders'),
    ]);
    const total = parseInt(countRes.rows[0].count);
    res.json({
      orders: dataRes.rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) { next(err); }
});

module.exports = router;
