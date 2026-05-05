/**
 * oxapayService.js — OxaPay API client
 *
 * Handles:
 *   - Creating payment invoices  (POST /v1/payment/invoice)
 *   - Checking payment status    (POST /v1/payment)
 *   - Verifying HMAC-SHA512 signatures on inbound callbacks
 *
 * Sandbox mode is controlled by OXAPAY_SANDBOX env var (default: true).
 * Set OXAPAY_SANDBOX=false in production to use real payments.
 */

const axios  = require('axios');
const crypto = require('crypto');

const OXAPAY_BASE  = 'https://api.oxapay.com';
const MERCHANT_KEY = process.env.OXAPAY_MERCHANT_KEY;
const SANDBOX      = process.env.OXAPAY_SANDBOX !== 'false';

if (!MERCHANT_KEY) {
  console.warn('[oxapay] OXAPAY_MERCHANT_KEY not set — payment routes will fail');
}

// Shared axios defaults for all OxaPay requests
const oxaClient = axios.create({
  baseURL: OXAPAY_BASE,
  timeout: 10_000,
  headers: {
    merchant_api_key: MERCHANT_KEY,
    'Content-Type':   'application/json',
  },
});

/**
 * Normalise the OxaPay response body.
 * OxaPay sometimes nests data under `data.data` and sometimes returns fields flat.
 */
function unwrap(data) {
  return (data && typeof data.data === 'object' && data.data !== null)
    ? data.data
    : data;
}

// ── createInvoice ────────────────────────────────────────────────────────────
/**
 * Create a new payment invoice.
 * @returns {{ trackId: string, payLink: string }}
 */
const createInvoice = async ({ amount, currency, orderId, callbackUrl, returnUrl, email, description }) => {
  const body = {
    amount,
    currency,
    lifetime:          60,
    fee_paid_by_payer: 0,
    callback_url:      callbackUrl,
    return_url:        returnUrl,
    order_id:          orderId,
    description:       description || `AvgExchange deposit — ${currency}`,
    sandbox:           SANDBOX,
  };
  if (email) body.email = email;

  const { data } = await oxaClient.post('/v1/payment/invoice', body);
  console.log('[oxapay] createInvoice response:', JSON.stringify(data));

  if (data.status !== 200) {
    throw new Error(`OxaPay invoice error: ${data.message || JSON.stringify(data)}`);
  }

  // Response shape: { data: { track_id, payment_url, expired_at, date }, status: 200, ... }
  const payload = unwrap(data);
  const trackId = payload.track_id ?? payload.trackId;
  const payLink = payload.payment_url ?? payload.payLink ?? payload.pay_link;

  if (!trackId) {
    throw new Error(`OxaPay returned no track_id. Response: ${JSON.stringify(data)}`);
  }
  if (!payLink) {
    throw new Error(`OxaPay returned no payment_url. Response: ${JSON.stringify(data)}`);
  }

  console.log(`[oxapay] trackId=${trackId}  payLink=${payLink}`);
  return { trackId, payLink };
};

// ── getPaymentStatus ─────────────────────────────────────────────────────────
/**
 * Query OxaPay directly for the current status of an invoice.
 * Used by the status-poll endpoint so sandbox works without a public callback URL.
 *
 * @param  {string} trackId
 * @returns {string} e.g. 'Waiting' | 'Paid' | 'Underpaid' | 'Expired' | 'Error'
 */
const getPaymentStatus = async (trackId) => {
  const { data } = await oxaClient.get(`/v1/payment/${trackId}`);
  console.log('[oxapay] getPaymentStatus response:', JSON.stringify(data));

  if (data.status !== 200) {
    throw new Error(`OxaPay status error: ${data.message || JSON.stringify(data)}`);
  }

  // Response shape: { data: { status: "paid", track_id, ... }, status: 200, ... }
  // OxaPay returns lowercase status ('paid', 'expired') — normalise to 'Paid', 'Expired'
  const raw = unwrap(data).status ?? '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

// ── verifyCallbackHmac ───────────────────────────────────────────────────────
/**
 * Verify the HMAC-SHA512 signature OxaPay sends with every callback.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param {string} rawBody      — req.rawBody (captured by express.json verify hook)
 * @param {string} receivedHmac — the `hmac` field from the parsed callback body
 * @returns {boolean}
 */
const verifyCallbackHmac = (rawBody, receivedHmac) => {
  if (!MERCHANT_KEY || !rawBody || !receivedHmac) return false;
  const expected = crypto
    .createHmac('sha512', MERCHANT_KEY)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected,      'hex'),
      Buffer.from(receivedHmac,  'hex'),
    );
  } catch {
    return false;
  }
};

// ── createWhiteLabelPayment ──────────────────────────────────────────────────
/**
 * White-Label payment: returns a raw blockchain address + QR code URL.
 * The user stays on your site — no redirect to OxaPay checkout.
 *
 * Endpoint: POST /merchants/request/whitelabel
 * Auth: merchant key goes in the request BODY (not a header).
 *
 * @returns {{ trackId, address, memo, payAmount, payCurrency, network, qrCode, expiredAt }}
 */
const createWhiteLabelPayment = async ({
  amount, currency, payCurrency, network,
  orderId, callbackUrl, email, description,
  lifeTime = 1440,      // 24 hours (max 2880)
  underPaidCover = 5,   // allow up to 5% underpayment
  feePaidByPayer = 0,   // merchant absorbs the fee
}) => {
  const body = {
    merchant:       MERCHANT_KEY,
    amount,
    payCurrency,
    callbackUrl,
    lifeTime,
    feePaidByPayer,
    underPaidCover,
  };
  if (currency)    body.currency    = currency;
  if (network)     body.network     = network;
  if (orderId)     body.orderId     = orderId;
  if (email)       body.email       = email;
  if (description) body.description = description;

  const { data } = await axios.post(`${OXAPAY_BASE}/merchants/request/whitelabel`, body);
  console.log('[oxapay] createWhiteLabel response:', JSON.stringify(data));

  if (data.result !== 100) {
    throw new Error(`OxaPay white-label error: ${data.message || JSON.stringify(data)}`);
  }

  return {
    trackId:     String(data.trackId),
    address:     data.address,
    memo:        data.memo || '',
    payAmount:   data.payAmount,
    payCurrency: data.payCurrency,
    network:     data.network,
    qrCode:      data.QRCode,
    expiredAt:   data.expiredAt,   // Unix timestamp string
    rate:        data.rate,
  };
};

// ── createSlaveAccount ───────────────────────────────────────────────────────
/**
 * White-Label: create a slave (sub-merchant) account under your master merchant.
 * Each user gets their own slave — funds received auto-sweep to master.
 *
 * OxaPay docs: POST /v1/merchants/add  (master API key required)
 *
 * @param {string} name        — display name for the slave (e.g. "AvgExchange User #42")
 * @param {string} webhookUrl  — OxaPay will POST here when funds arrive
 * @returns {string} slaveApiKey
 */
const createSlaveAccount = async (name, webhookUrl) => {
  const { data } = await oxaClient.post('/v1/merchants/add', { name, webhook: webhookUrl });
  console.log('[oxapay] createSlaveAccount response:', JSON.stringify(data));

  if (data.status !== 200) {
    throw new Error(`OxaPay createSlave error: ${data.message || JSON.stringify(data)}`);
  }

  const payload   = unwrap(data);
  const slaveKey  = payload.apiKey ?? payload.api_key;
  if (!slaveKey) {
    throw new Error(`OxaPay returned no slave apiKey. Response: ${JSON.stringify(data)}`);
  }
  return slaveKey;
};

// ── getWalletAddress ─────────────────────────────────────────────────────────
/**
 * White-Label: get the permanent deposit address for a currency+network on a slave account.
 * The address is static — users can re-use it for every deposit.
 *
 * OxaPay docs: POST /v1/wallets  (slave API key required)
 *
 * @param {string} slaveKey — slave merchant API key
 * @param {string} currency — e.g. 'USDT'
 * @param {string} network  — e.g. 'TRX'
 * @returns {string} blockchain address
 */
const getWalletAddress = async (slaveKey, currency, network) => {
  // Use a one-off axios instance with the slave key
  const { data } = await axios.post(
    `${OXAPAY_BASE}/v1/wallets`,
    { currency, network },
    {
      timeout: 10_000,
      headers: {
        merchant_api_key: slaveKey,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log('[oxapay] getWalletAddress response:', JSON.stringify(data));

  if (data.status !== 200) {
    throw new Error(`OxaPay getWalletAddress error: ${data.message || JSON.stringify(data)}`);
  }

  const payload = unwrap(data);
  const address = payload.address;
  if (!address) {
    throw new Error(`OxaPay returned no address. Response: ${JSON.stringify(data)}`);
  }
  return address;
};

// ── verifySlaveHmac ──────────────────────────────────────────────────────────
/**
 * Verify HMAC on a static-address callback using the slave's API key.
 * Each slave fires callbacks signed with its own key.
 */
const verifySlaveHmac = (rawBody, receivedHmac, slaveKey) => {
  if (!slaveKey || !rawBody || !receivedHmac) return false;
  const expected = crypto
    .createHmac('sha512', slaveKey)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected,     'hex'),
      Buffer.from(receivedHmac, 'hex'),
    );
  } catch {
    return false;
  }
};

module.exports = {
  createInvoice,
  createWhiteLabelPayment,
  getPaymentStatus,
  verifyCallbackHmac,
  createSlaveAccount,
  getWalletAddress,
  verifySlaveHmac,
};
