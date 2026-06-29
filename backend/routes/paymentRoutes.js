/**
 * routes/paymentRoutes.js — OxaPay deposit flow (invoice, white-label, static address).
 */

'use strict';

const express     = require('express');
const Decimal     = require('../utils/decimal');
const config      = require('../config');
const requireAuth = require('../middleware/requireAuth');
const { invoiceLimiter } = require('../middleware/rateLimiters');
const db          = require('../db');
const oxapay      = require('../services/oxapayService');
const { DEPOSIT_NETWORKS, SUPPORTED_CURRENCIES } = require('../config/pairs');

const router = express.Router();

// ── Shared helper — idempotent invoice crediting ─────────────────
async function creditInvoice(trackId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, user_id, currency, amount, credited
         FROM payment_invoices WHERE track_id = $1 FOR UPDATE`,
      [trackId]
    );

    if (rows.length === 0 || rows[0].credited) {
      await client.query('ROLLBACK');
      return false;
    }

    const { user_id, currency, amount } = rows[0];
    const dAmount = new Decimal(amount);

    await client.query(
      `INSERT INTO balances (user_id, currency, available_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, currency)
       DO UPDATE SET available_balance = balances.available_balance + $3, updated_at = NOW()`,
      [user_id, currency, dAmount.toFixed(10)]
    );

    await client.query(
      `UPDATE payment_invoices SET credited = TRUE, status = 'Paid', updated_at = NOW() WHERE track_id = $1`,
      [trackId]
    );

    await client.query('COMMIT');
    console.log(`[payment] Credited ${dAmount.toFixed(8)} ${currency} to user #${user_id} (trackId=${trackId})`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function getCallbackUrl() {
  return config.oxapay.callbackUrl
    || `${config.oxapay.appUrl}/api/payment/callback`;
}

// ── POST /invoice ────────────────────────────────────────────────
router.post('/invoice', requireAuth, invoiceLimiter, async (req, res, next) => {
  try {
    const { currency = 'USDT', amount } = req.body;
    const userId = req.user.id;

    const dAmount = new Decimal(amount || 0);
    if (dAmount.lte(0)) return res.status(400).json({ error: 'amount must be a positive number' });

    const cur = currency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(cur)) {
      return res.status(400).json({ error: `Unsupported currency. Supported: ${[...SUPPORTED_CURRENCIES].join(', ')}` });
    }

    const orderId     = `avg_${userId}_${Date.now()}`;
    const callbackUrl = getCallbackUrl();
    const returnUrl   = config.oxapay.returnUrl || `${config.oxapay.frontendUrl}/dashboard`;

    const userRes = await db.query('SELECT email, name FROM "User" WHERE id = $1', [userId]);
    const { email, name } = userRes.rows[0] ?? {};

    const { trackId, payLink } = await oxapay.createInvoice({
      amount: dAmount.toNumber(), currency: cur, orderId, callbackUrl, returnUrl,
      email, description: `AvgExchange deposit — ${dAmount.toFixed(8)} ${cur} for ${name || email || `user #${userId}`}`,
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

// ── GET /status/:trackId ─────────────────────────────────────────
router.get('/status/:trackId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT track_id, currency, amount, status, credited, payment_url, created_at, payment_type
         FROM payment_invoices WHERE track_id = $1 AND user_id = $2`,
      [req.params.trackId, req.user.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = { ...rows[0] };

    const isTerminal = ['Paid', 'Expired', 'Error'].includes(invoice.status) || invoice.credited;
    if (!isTerminal) {
      try {
        const statusFn = invoice.payment_type === 'whitelabel'
          ? oxapay.getWhiteLabelStatus
          : oxapay.getPaymentStatus;
        const oxaStatus = await statusFn(req.params.trackId);

        if (oxaStatus && oxaStatus !== invoice.status) {
          await db.query(`UPDATE payment_invoices SET status = $1, updated_at = NOW() WHERE track_id = $2`, [oxaStatus, req.params.trackId]);
          invoice.status = oxaStatus;
        }
        if (oxaStatus === 'Paid' && !invoice.credited) {
          await creditInvoice(req.params.trackId);
          invoice.credited = true;
        }
      } catch (err) {
        console.warn('[payment/status] OxaPay direct check failed:', err.message);
      }
    }

    res.json(invoice);
  } catch (err) { next(err); }
});

// ── POST /callback (public — called by OxaPay) ──────────────────
router.post('/callback', async (req, res) => {
  res.sendStatus(200);

  const { body, rawBody } = req;
  const receivedHmac = body?.hmac;
  if (!receivedHmac || !oxapay.verifyCallbackHmac(rawBody, receivedHmac)) {
    console.warn('[payment/callback] Missing or invalid HMAC — ignoring');
    return;
  }

  const { trackId } = body ?? {};
  const rawStatus = body?.status ?? '';
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  if (!trackId || !status) return;

  try {
    await db.query(`UPDATE payment_invoices SET status = $1, updated_at = NOW() WHERE track_id = $2`, [status, trackId]);
  } catch (err) {
    console.error('[payment/callback] Failed to update status:', err.message);
    return;
  }

  if (status === 'Paid') {
    creditInvoice(trackId).catch(err => console.error('[payment/callback] creditInvoice failed:', err.message));
  }
});

// ── POST /whitelabel ─────────────────────────────────────────────
router.post('/whitelabel', requireAuth, invoiceLimiter, async (req, res, next) => {
  try {
    const { currency = 'USDT', network, amount } = req.body;
    const userId = req.user.id;

    const dAmount = new Decimal(amount || 0);
    if (dAmount.lte(0)) return res.status(400).json({ error: 'amount must be a positive number' });

    const cur = currency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(cur)) {
      return res.status(400).json({ error: `Unsupported currency. Supported: ${[...SUPPORTED_CURRENCIES].join(', ')}` });
    }

    const orderId     = `avg_wl_${userId}_${Date.now()}`;
    const callbackUrl = getCallbackUrl();

    const userRes = await db.query('SELECT email, name FROM "User" WHERE id=$1', [userId]);
    const { email, name } = userRes.rows[0] ?? {};

    const wl = await oxapay.createWhiteLabelPayment({
      amount: dAmount.toNumber(), currency: 'USD', payCurrency: cur,
      network: network || undefined, orderId, callbackUrl, email,
      description: `AvgExchange deposit — ${dAmount.toFixed(2)} USD -> ${cur} for ${name || email || `user #${userId}`}`,
    });

    await db.query(
      `INSERT INTO payment_invoices (user_id, track_id, currency, amount, status, payment_url, payment_type)
       VALUES ($1, $2, $3, $4, 'Waiting', $5, 'whitelabel')`,
      [userId, wl.trackId, cur, new Decimal(wl.payAmount).toFixed(10), '']
    );

    res.json({
      trackId: wl.trackId, address: wl.address, memo: wl.memo,
      payAmount: wl.payAmount, payCurrency: wl.payCurrency,
      network: wl.network, networkCode: network || cur,
      qrCode: wl.qrCode, expiredAt: wl.expiredAt, rate: wl.rate,
    });
  } catch (err) {
    console.error('[payment/whitelabel] failed:', err.message);
    next(err);
  }
});

// ── GET /address/:currency/:network ──────────────────────────────
router.get('/address/:currency/:network', requireAuth, async (req, res, next) => {
  const currency = req.params.currency.toUpperCase();
  const network  = req.params.network.toUpperCase();
  const userId   = req.user.id;

  if (!DEPOSIT_NETWORKS[currency]?.includes(network)) {
    return res.status(400).json({ error: `Unsupported currency/network: ${currency}/${network}` });
  }

  try {
    const existing = await db.query(
      'SELECT address FROM deposit_addresses WHERE user_id=$1 AND currency=$2 AND network=$3',
      [userId, currency, network]
    );
    if (existing.rows.length > 0) {
      return res.json({ address: existing.rows[0].address, currency, network });
    }

    const userRes = await db.query('SELECT name, email FROM "User" WHERE id=$1', [userId]);
    const { name, email } = userRes.rows[0] ?? {};
    const slaveName = `AvgExchange User #${userId} — ${name || email || 'unknown'}`;

    const staticCallbackUrl = config.oxapay.staticCallbackUrl
      || `${config.oxapay.appUrl}/api/payment/static/callback`;

    const slaveKey = await oxapay.createSlaveAccount(slaveName, staticCallbackUrl);
    const address  = await oxapay.getWalletAddress(slaveKey, currency, network);

    await db.query(
      `INSERT INTO deposit_addresses (user_id, currency, network, address, slave_key)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, currency, network) DO NOTHING`,
      [userId, currency, network, address, slaveKey]
    );

    res.json({ address, currency, network });
  } catch (err) { next(err); }
});

// ── GET /networks ────────────────────────────────────────────────
router.get('/networks', (_req, res) => {
  res.json(DEPOSIT_NETWORKS);
});

// ── POST /static/callback (public — OxaPay static address) ──────
router.post('/static/callback', async (req, res) => {
  res.sendStatus(200);

  const { body, rawBody } = req;
  if (!body?.hmac || !body?.address) return;

  const rawStatus = body?.status ?? '';
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  let row;
  try {
    const { rows } = await db.query(
      'SELECT user_id, currency, slave_key FROM deposit_addresses WHERE address=$1',
      [body.address]
    );
    if (rows.length === 0) return;
    row = rows[0];
  } catch (err) {
    console.error('[payment/static/callback] DB lookup failed:', err.message);
    return;
  }

  if (!oxapay.verifySlaveHmac(rawBody, body.hmac, row.slave_key)) return;
  if (status !== 'Paid') return;

  const amount   = body?.amount;
  const currency = body?.currency ?? row.currency;
  const txId     = body?.txId ?? body?.tx_id ?? '';

  if (!amount || parseFloat(amount) <= 0) return;

  // tx_id is our idempotency key (NOT NULL UNIQUE in static_deposit_log).
  // Without it we cannot distinguish a duplicate callback from a second
  // genuine deposit, so refuse to credit rather than risk dropping funds.
  if (!txId) {
    console.warn(`[payment/static] Ignoring Paid callback for ${body.address} with no txId — cannot dedup`);
    return;
  }

  try {
    const dAmount = new Decimal(amount);
    const client  = await db.getClient();
    try {
      await client.query('BEGIN');

      const dup = await client.query(`SELECT 1 FROM static_deposit_log WHERE tx_id=$1`, [txId]);
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        return;
      }

      await client.query(
        `INSERT INTO balances (user_id, currency, available_balance) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, currency)
         DO UPDATE SET available_balance = balances.available_balance + $3, updated_at = NOW()`,
        [row.user_id, currency.toUpperCase(), dAmount.toFixed(10)]
      );

      await client.query(
        `INSERT INTO static_deposit_log (user_id, currency, amount, address, tx_id) VALUES ($1, $2, $3, $4, $5)`,
        [row.user_id, currency.toUpperCase(), dAmount.toFixed(10), body.address, txId]
      );

      await client.query('COMMIT');
      console.log(`[payment/static] Credited ${dAmount.toFixed(8)} ${currency} to user #${row.user_id} (txId=${txId})`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[payment/static/callback] Credit failed:', err.message);
  }
});

module.exports = router;
