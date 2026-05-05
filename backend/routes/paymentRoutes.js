/**
 * paymentRoutes.js — OxaPay deposit flow
 *
 * POST /api/payment/invoice          (auth required)
 *   → Creates an OxaPay invoice, stores it in payment_invoices, returns payLink + trackId
 *
 * GET  /api/payment/status/:trackId  (auth required)
 *   → Checks OxaPay directly for current status (works in sandbox without a public callback URL).
 *   → If newly Paid, credits the user atomically. Idempotent.
 *
 * POST /api/payment/callback         (public — called by OxaPay servers in production)
 *   → Verifies HMAC, then credits via the same shared helper. Idempotent.
 */

const express     = require('express');
const Decimal     = require('decimal.js');
const requireAuth = require('../middleware/requireAuth');
const db          = require('../db');
const oxapay      = require('../services/oxapayService');

const router = express.Router();

const SUPPORTED_CURRENCIES = new Set(['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'TRX', 'LTC']);

// ── Shared helper ────────────────────────────────────────────────────────────
/**
 * Credit a Paid invoice to the user's balance.
 * Uses FOR UPDATE + credited flag to guarantee exactly-once execution.
 *
 * @param  {string} trackId
 * @returns {boolean} true if just credited, false if already credited (idempotent)
 */
async function creditInvoice(trackId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, user_id, currency, amount, credited
         FROM payment_invoices
        WHERE track_id = $1
        FOR UPDATE`,
      [trackId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    if (rows[0].credited) {
      await client.query('ROLLBACK');
      return false; // already done — idempotent
    }

    const { user_id, currency, amount } = rows[0];
    const dAmount = new Decimal(amount);

    await client.query(
      `INSERT INTO balances (user_id, currency, available_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, currency)
       DO UPDATE SET available_balance = balances.available_balance + $3,
                     updated_at        = NOW()`,
      [user_id, currency, dAmount.toFixed(10)]
    );

    await client.query(
      `UPDATE payment_invoices
          SET credited   = TRUE,
              status     = 'Paid',
              updated_at = NOW()
        WHERE track_id = $1`,
      [trackId]
    );

    await client.query('COMMIT');
    console.log(`[payment] ✅ Credited ${dAmount.toFixed(8)} ${currency} to user #${user_id} (trackId=${trackId})`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── POST /api/payment/invoice ────────────────────────────────────────────────
router.post('/invoice', requireAuth, async (req, res, next) => {
  try {
    const { currency = 'USDT', amount } = req.body;
    const userId = req.user.id;

    const dAmount = new Decimal(amount || 0);
    if (dAmount.lte(0)) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    if (!SUPPORTED_CURRENCIES.has(currency.toUpperCase())) {
      return res.status(400).json({
        error: `Unsupported currency. Supported: ${[...SUPPORTED_CURRENCIES].join(', ')}`,
      });
    }

    const cur      = currency.toUpperCase();
    const orderId  = `avg_${userId}_${Date.now()}`;
    const callbackUrl = process.env.OXAPAY_CALLBACK_URL
      || `${process.env.APP_URL || 'http://localhost:4000'}/api/payment/callback`;
    const returnUrl   = process.env.OXAPAY_RETURN_URL
      || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`;

    const userRes = await db.query('SELECT email FROM "User" WHERE id = $1', [userId]);
    const email   = userRes.rows[0]?.email;

    const { trackId, payLink } = await oxapay.createInvoice({
      amount:      dAmount.toNumber(),
      currency:    cur,
      orderId,
      callbackUrl,
      returnUrl,
      email,
      description: `AvgExchange deposit — ${dAmount.toFixed(8)} ${cur} for user #${userId}`,
    });

    await db.query(
      `INSERT INTO payment_invoices (user_id, track_id, currency, amount, status, payment_url)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [userId, trackId, cur, dAmount.toFixed(10), payLink]
    );

    res.json({ trackId, payLink, currency: cur, amount: dAmount.toNumber() });
  } catch (err) {
    console.error('[payment] createInvoice failed:', err.message);
    next(err);
  }
});

// ── GET /api/payment/status/:trackId ────────────────────────────────────────
// Frontend polls this every 5 s. We also query OxaPay directly here so the
// flow works in sandbox (where localhost can't receive callbacks).
router.get('/status/:trackId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT track_id, currency, amount, status, credited, payment_url, created_at
         FROM payment_invoices
        WHERE track_id = $1 AND user_id = $2`,
      [req.params.trackId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = { ...rows[0] };

    // If the invoice is still open, check OxaPay directly.
    // This makes sandbox work without a public callback URL.
    const isTerminal = ['Paid', 'Expired', 'Error'].includes(invoice.status) || invoice.credited;
    if (!isTerminal) {
      try {
        const oxaStatus = await oxapay.getPaymentStatus(req.params.trackId);

        if (oxaStatus && oxaStatus !== invoice.status) {
          await db.query(
            `UPDATE payment_invoices SET status = $1, updated_at = NOW() WHERE track_id = $2`,
            [oxaStatus, req.params.trackId]
          );
          invoice.status = oxaStatus;
        }

        if (oxaStatus === 'Paid' && !invoice.credited) {
          await creditInvoice(req.params.trackId);
          invoice.credited = true;
        }
      } catch (err) {
        // Non-fatal — return whatever status we have from our DB
        console.warn('[payment/status] OxaPay direct check failed:', err.message);
      }
    }

    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/payment/callback ───────────────────────────────────────────────
// OxaPay POSTs here when payment status changes (production).
// Must be PUBLIC — no requireAuth.
router.post('/callback', async (req, res) => {
  res.sendStatus(200); // always respond immediately; OxaPay retries on non-2xx

  const { body, rawBody } = req;

  // HMAC verification
  const receivedHmac = body?.hmac;
  if (receivedHmac) {
    if (!oxapay.verifyCallbackHmac(rawBody, receivedHmac)) {
      console.warn('[payment/callback] HMAC mismatch — ignoring');
      return;
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[payment/callback] Missing HMAC in production — ignoring');
    return;
  }

  const { trackId } = body ?? {};
  const rawStatus   = body?.status ?? '';
  // Normalise OxaPay's lowercase status ('paid' → 'Paid') to match our DB constraint
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  if (!trackId || !status) {
    console.warn('[payment/callback] Missing trackId or status');
    return;
  }

  console.log(`[payment/callback] trackId=${trackId} status=${status}`);

  // Update invoice status in DB
  try {
    await db.query(
      `UPDATE payment_invoices SET status = $1, updated_at = NOW() WHERE track_id = $2`,
      [status, trackId]
    );
  } catch (err) {
    console.error('[payment/callback] Failed to update invoice status:', err.message);
    return;
  }

  if (status !== 'Paid') return;

  try {
    await creditInvoice(trackId);
  } catch (err) {
    console.error('[payment/callback] creditInvoice failed:', err.message);
  }
});

module.exports = router;
