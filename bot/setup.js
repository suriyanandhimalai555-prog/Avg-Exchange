/**
 * setup.js — One-time bot account initialisation
 *
 * Run ONCE before starting the bot:
 *   node setup.js
 *
 * What it does:
 *   1. Creates the bot exchange account (or logs in if it already exists)
 *   2. Deposits dummy USDT and BTC so the bot has funds to quote with
 *   3. Prints the final balance so you can confirm everything is ready
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config');

const DEPOSIT_USDT = parseFloat(process.env.BOT_DEPOSIT_USDT || '500000'); // $500k
const DEPOSIT_BTC  = parseFloat(process.env.BOT_DEPOSIT_BTC  || '10');     // 10 BTC
const DEPOSIT_ETH  = parseFloat(process.env.BOT_DEPOSIT_ETH  || '100');    // 100 ETH
const DEPOSIT_SOL  = parseFloat(process.env.BOT_DEPOSIT_SOL  || '5000');   // 5000 SOL  (~$83 each)
const DEPOSIT_BNB  = parseFloat(process.env.BOT_DEPOSIT_BNB  || '800');    // 800 BNB   (~$622 each)
const DEPOSIT_XRP  = parseFloat(process.env.BOT_DEPOSIT_XRP  || '500000'); // 500k XRP  (~$1.39 each)
const DEPOSIT_DOGE = parseFloat(process.env.BOT_DEPOSIT_DOGE || '5000000');// 5M DOGE   (~$0.099 each)
const DEPOSIT_ADA  = parseFloat(process.env.BOT_DEPOSIT_ADA  || '2000000');// 2M ADA    (~$0.24 each)

const client = axios.create({
  baseURL: config.API_URL,
  validateStatus: () => true,
});

function extractCookie(res) {
  const raw = res.headers['set-cookie'] ?? [];
  const entry = raw.find(c => c.startsWith('token='));
  return entry ? entry.split(';')[0] : null;
}

async function run() {
  console.log('═'.repeat(55));
  console.log('  AVG Exchange — Bot Account Setup');
  console.log('═'.repeat(55));
  console.log(`  API      : ${config.API_URL}`);
  console.log(`  Account  : ${config.BOT_EMAIL}`);
  console.log(`  Funding  : ${DEPOSIT_USDT.toLocaleString()} USDT + ${DEPOSIT_BTC} BTC + ${DEPOSIT_ETH} ETH + ${DEPOSIT_SOL} SOL + ${DEPOSIT_BNB} BNB + ${DEPOSIT_XRP.toLocaleString()} XRP + ${DEPOSIT_DOGE.toLocaleString()} DOGE + ${DEPOSIT_ADA.toLocaleString()} ADA`);
  console.log('═'.repeat(55) + '\n');

  // ── Step 1: Sign up (or log in if account already exists) ────────────────
  let cookie;

  console.log('[setup] Attempting sign up…');
  const signupRes = await client.post('/api/user/signup', {
    name:     'AVG Market Maker Bot',
    email:    config.BOT_EMAIL,
    password: config.BOT_PASSWORD,
  });

  if (signupRes.status === 200) {
    cookie = extractCookie(signupRes);
    console.log(`[setup] ✅ Account created — referral: ${signupRes.data?.referralCode}`);
  } else if (signupRes.data?.error?.toLowerCase().includes('already in use')) {
    console.log('[setup] Account already exists — logging in…');
    const loginRes = await client.post('/api/user/login', {
      email:    config.BOT_EMAIL,
      password: config.BOT_PASSWORD,
    });
    if (loginRes.status !== 200) {
      console.error('[setup] ❌ Login failed:', loginRes.data);
      process.exit(1);
    }
    cookie = extractCookie(loginRes);
    console.log('[setup] ✅ Logged in');
  } else {
    console.error('[setup] ❌ Signup failed:', signupRes.data);
    process.exit(1);
  }

  if (!cookie) {
    console.error('[setup] ❌ No session cookie received');
    process.exit(1);
  }

  const authed = axios.create({
    baseURL: config.API_URL,
    headers: { Cookie: cookie },
    validateStatus: () => true,
  });

  // ── Step 2: Deposit funds ─────────────────────────────────────────────────
  console.log('\n[setup] Depositing test funds…');

  const usdtRes = await authed.post('/api/user/deposit', { currency: 'USDT', amount: DEPOSIT_USDT });
  if (usdtRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_USDT.toLocaleString()} USDT`);
  } else {
    console.error('[setup] ❌ USDT deposit failed:', usdtRes.data);
  }

  const btcRes = await authed.post('/api/user/deposit', { currency: 'BTC', amount: DEPOSIT_BTC });
  if (btcRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_BTC} BTC`);
  } else {
    console.error('[setup] ❌ BTC deposit failed:', btcRes.data);
  }

  const ethRes = await authed.post('/api/user/deposit', { currency: 'ETH', amount: DEPOSIT_ETH });
  if (ethRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_ETH} ETH`);
  } else {
    console.error('[setup] ❌ ETH deposit failed:', ethRes.data);
  }

  const solRes = await authed.post('/api/user/deposit', { currency: 'SOL', amount: DEPOSIT_SOL });
  if (solRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_SOL.toLocaleString()} SOL`);
  } else {
    console.error('[setup] ❌ SOL deposit failed:', solRes.data);
  }

  const bnbRes = await authed.post('/api/user/deposit', { currency: 'BNB', amount: DEPOSIT_BNB });
  if (bnbRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_BNB} BNB`);
  } else {
    console.error('[setup] ❌ BNB deposit failed:', bnbRes.data);
  }

  const xrpRes = await authed.post('/api/user/deposit', { currency: 'XRP', amount: DEPOSIT_XRP });
  if (xrpRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_XRP.toLocaleString()} XRP`);
  } else {
    console.error('[setup] ❌ XRP deposit failed:', xrpRes.data);
  }

  const dogeRes = await authed.post('/api/user/deposit', { currency: 'DOGE', amount: DEPOSIT_DOGE });
  if (dogeRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_DOGE.toLocaleString()} DOGE`);
  } else {
    console.error('[setup] ❌ DOGE deposit failed:', dogeRes.data);
  }

  const adaRes = await authed.post('/api/user/deposit', { currency: 'ADA', amount: DEPOSIT_ADA });
  if (adaRes.data?.success) {
    console.log(`[setup] ✅ Deposited ${DEPOSIT_ADA.toLocaleString()} ADA`);
  } else {
    console.error('[setup] ❌ ADA deposit failed:', adaRes.data);
  }

  // ── Step 3: Print final balances ─────────────────────────────────────────
  console.log('\n[setup] Current balances:');
  const balRes = await authed.get('/api/user/balance');
  const bals = balRes.data ?? {};

  if (Object.keys(bals).length === 0) {
    console.log('  (no balances — deposits may have failed)');
  } else {
    for (const [currency, { available, locked }] of Object.entries(bals)) {
      console.log(`  ${currency.padEnd(6)}  available: ${Number(available).toLocaleString()}  locked: ${Number(locked).toLocaleString()}`);
    }
  }

  console.log('\n[setup] ✅ Done — run `npm start` to launch the bot\n');
}

run().catch(err => {
  console.error('[setup] Fatal:', err.message);
  process.exit(1);
});
