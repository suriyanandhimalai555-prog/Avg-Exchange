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
const rateLimit   = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const db          = require('../db');
const oxapay      = require('../services/oxapayService');

// Supported networks per currency for the static-address flow
const STATIC_NETWORKS = {
  USDT: ['TRX', 'ETH', 'BSC'],
  BTC:  ['BTC'],
  ETH:  ['ETH'],
  BNB:  ['BSC'],
  SOL:  ['SOL'],
  TRX:  ['TRX'],
  LTC:  ['LTC'],
};

const router = express.Router();

const invoiceLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many invoice requests — please wait' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || 'anon'),
});

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
router.post('/invoice', requireAuth, invoiceLimiter, async (req, res, next) => {
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

    const userRes = await db.query('SELECT email, name FROM "User" WHERE id = $1', [userId]);
    const { email, name } = userRes.rows[0] ?? {};

    const { trackId, payLink } = await oxapay.createInvoice({
      amount:      dAmount.toNumber(),
      currency:    cur,
      orderId,
      callbackUrl,
      returnUrl,
      email,
      description: `AvgExchange deposit — ${dAmount.toFixed(8)} ${cur} for ${name || email || `user #${userId}`}`,
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

  // HMAC verification — always required regardless of environment
  const receivedHmac = body?.hmac;
  if (!receivedHmac) {
    console.warn('[payment/callback] Missing HMAC — ignoring');
    return;
  }
  if (!oxapay.verifyCallbackHmac(rawBody, receivedHmac)) {
    console.warn('[payment/callback] HMAC mismatch — ignoring');
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

// ── POST /api/payment/whitelabel ─────────────────────────────────────────────
// Creates a white-label payment: returns a raw blockchain address + QR code.
// User stays on our site — no redirect to OxaPay checkout page.
// Reuses the same payment_invoices table + creditInvoice helper as invoices.
//
// Body: { currency, network, amount }
//   currency — crypto to receive (e.g. 'USDT', 'BTC')
//   network  — blockchain network (e.g. 'TRX', 'ETH', 'BSC')
//   amount   — amount in USD (OxaPay converts to crypto at live rate)
router.post('/whitelabel', requireAuth, invoiceLimiter, async (req, res, next) => {
  try {
    const { currency = 'USDT', network, amount } = req.body;
    const userId = req.user.id;

    const dAmount = new Decimal(amount || 0);
    if (dAmount.lte(0)) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const cur = currency.toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(cur)) {
      return res.status(400).json({
        error: `Unsupported currency. Supported: ${[...SUPPORTED_CURRENCIES].join(', ')}`,
      });
    }

    const orderId = `avg_wl_${userId}_${Date.now()}`;

    const userRes = await db.query('SELECT email, name FROM "User" WHERE id=$1', [userId]);
    const { email, name } = userRes.rows[0] ?? {};

    const callbackUrl = process.env.OXAPAY_CALLBACK_URL
      || `${process.env.APP_URL || 'http://localhost:4000'}/api/payment/callback`;

    const wl = await oxapay.createWhiteLabelPayment({
      amount:      dAmount.toNumber(),
      currency:    'USD',    // amount is always in USD; OxaPay converts to crypto
      payCurrency: cur,
      network:     network || undefined,
      orderId,
      callbackUrl,
      email,
      description: `AvgExchange deposit — ${dAmount.toFixed(2)} USD → ${cur} for ${name || email || `user #${userId}`}`,
    });

    // Store in payment_invoices so creditInvoice() + status poll work unchanged
    await db.query(
      `INSERT INTO payment_invoices (user_id, track_id, currency, amount, status, payment_url)
       VALUES ($1, $2, $3, $4, 'Waiting', $5)`,
      [userId, wl.trackId, cur, new Decimal(wl.payAmount).toFixed(10), '']
    );

    res.json({
      trackId:     wl.trackId,
      address:     wl.address,
      memo:        wl.memo,
      payAmount:   wl.payAmount,
      payCurrency: wl.payCurrency,
      network:     wl.network,
      qrCode:      wl.qrCode,
      expiredAt:   wl.expiredAt,
      rate:        wl.rate,
    });
  } catch (err) {
    console.error('[payment/whitelabel] failed:', err.message);
    next(err);
  }
});

// ── GET /api/payment/address/:currency/:network ──────────────────────────────
// Returns (or creates) the permanent static deposit address for this user.
// First call creates an OxaPay slave account + fetches the address (takes ~1-2s).
// Every subsequent call for the same user/currency/network returns instantly from DB.
router.get('/address/:currency/:network', requireAuth, async (req, res, next) => {
  const currency = req.params.currency.toUpperCase();
  const network  = req.params.network.toUpperCase();
  const userId   = req.user.id;

  if (!STATIC_NETWORKS[currency]?.includes(network)) {
    return res.status(400).json({ error: `Unsupported currency/network: ${currency}/${network}` });
  }

  try {
    // 1. Check if we already have an address for this user+currency+network
    const existing = await db.query(
      'SELECT address FROM deposit_addresses WHERE user_id=$1 AND currency=$2 AND network=$3',
      [userId, currency, network]
    );
    if (existing.rows.length > 0) {
      return res.json({ address: existing.rows[0].address, currency, network });
    }

    // 2. Create a new OxaPay slave merchant account for this user
    const userRes = await db.query('SELECT name, email FROM "User" WHERE id=$1', [userId]);
    const { name, email } = userRes.rows[0] ?? {};
    const slaveName = `AvgExchange User #${userId} — ${name || email || 'unknown'}`;

    const staticCallbackUrl = process.env.OXAPAY_STATIC_CALLBACK_URL
      || `${process.env.APP_URL || 'http://localhost:4000'}/api/payment/static/callback`;

    const slaveKey = await oxapay.createSlaveAccount(slaveName, staticCallbackUrl);

    // 3. Get the permanent wallet address from the slave account
    const address = await oxapay.getWalletAddress(slaveKey, currency, network);

    // 4. Persist: address is now permanent for this user+currency+network
    await db.query(
      `INSERT INTO deposit_addresses (user_id, currency, network, address, slave_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, currency, network) DO NOTHING`,
      [userId, currency, network, address, slaveKey]
    );

    console.log(`[payment/static] Created address for user #${userId}: ${currency}/${network} → ${address}`);
    res.json({ address, currency, network });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/payment/networks ────────────────────────────────────────────────
// Returns supported currency→network map so the frontend stays in sync.
router.get('/networks', (req, res) => {
  res.json(STATIC_NETWORKS);
});

// ── POST /api/payment/static/callback ───────────────────────────────────────
// OxaPay fires this when funds arrive at a static (slave) address.
// Public — no requireAuth. HMAC verified with the slave's key.
router.post('/static/callback', async (req, res) => {
  res.sendStatus(200); // always respond immediately

  const { body, rawBody } = req;
  const receivedHmac = body?.hmac;

  if (!receivedHmac) {
    console.warn('[payment/static/callback] Missing HMAC — ignoring');
    return;
  }

  const address = body?.address;
  const rawStatus = body?.status ?? '';
  const status  = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  if (!address) {
    console.warn('[payment/static/callback] Missing address — ignoring');
    return;
  }

  // Look up the slave key (and user) by address
  let row;
  try {
    const { rows } = await db.query(
      'SELECT user_id, currency, slave_key FROM deposit_addresses WHERE address=$1',
      [address]
    );
    if (rows.length === 0) {
      console.warn(`[payment/static/callback] Unknown address ${address} — ignoring`);
      return;
    }
    row = rows[0];
  } catch (err) {
    console.error('[payment/static/callback] DB lookup failed:', err.message);
    return;
  }

  // Verify HMAC with slave key
  if (!oxapay.verifySlaveHmac(rawBody, receivedHmac, row.slave_key)) {
    console.warn('[payment/static/callback] HMAC mismatch — ignoring');
    return;
  }

  if (status !== 'Paid') {
    console.log(`[payment/static/callback] address=${address} status=${status} — not paid yet`);
    return;
  }

  const amount   = body?.amount;
  const currency = body?.currency ?? row.currency;
  const txId     = body?.txId ?? body?.tx_id ?? '';

  if (!amount || parseFloat(amount) <= 0) {
    console.warn('[payment/static/callback] Zero or missing amount — ignoring');
    return;
  }

  // Credit the user — use txId as idempotency key to prevent double-credit
  try {
    const dAmount = new Decimal(amount);
    const client  = await db.getClient();
    try {
      await client.query('BEGIN');

      // Check if this txId was already processed
      const dup = await client.query(
        `SELECT 1 FROM static_deposit_log WHERE tx_id=$1`,
        [txId]
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        console.log(`[payment/static/callback] txId=${txId} already credited — skipping`);
        return;
      }

      await client.query(
        `INSERT INTO balances (user_id, currency, available_balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, currency)
         DO UPDATE SET available_balance = balances.available_balance + $3, updated_at = NOW()`,
        [row.user_id, currency.toUpperCase(), dAmount.toFixed(10)]
      );

      await client.query(
        `INSERT INTO static_deposit_log (user_id, currency, amount, address, tx_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.user_id, currency.toUpperCase(), dAmount.toFixed(10), address, txId]
      );

      await client.query('COMMIT');
      console.log(`[payment/static/callback] ✅ Credited ${dAmount.toFixed(8)} ${currency} to user #${row.user_id} (txId=${txId})`);
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
