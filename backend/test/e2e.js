/**
 * End-to-End Test — AVG Exchange
 *
 * Tests the full trade lifecycle:
 *   signup → deposit → place buy + sell orders → verify match → check balances
 *
 * Run from the backend folder:
 *   node test/e2e.js
 *
 * The backend server must be running (npm run dev) before executing this.
 */

require('dotenv').config();
const axios = require('axios');

const API = process.env.API_URL || 'http://localhost:4000';
const PAIR = 'BTC/USDT';
const PRICE = 50000;
const QTY   = 0.01;

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// Extract the token cookie from a login/signup response
function extractCookie(response) {
  const raw = response.headers['set-cookie'] ?? [];
  const entry = raw.find(c => c.startsWith('token='));
  return entry ? entry.split(';')[0] : null; // "token=eyJ..."
}

// Create an axios client that carries a specific session cookie
function makeClient(cookie) {
  return axios.create({
    baseURL: API,
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true, // never throw on 4xx/5xx — we'll inspect manually
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  AVG Exchange — End-to-End Test Suite');
  console.log(`  Target: ${API}`);
  console.log(`${'─'.repeat(60)}\n`);

  // ── 1. Health check ────────────────────────────────────────────────────────
  console.log('1. Connectivity');
  const ping = await axios.get(`${API}/api/markets?per_page=1`).catch(() => null);
  ok('Backend is reachable', ping?.status === 200, `Got ${ping?.status ?? 'no response'}`);
  if (!ping) return finish();

  // ── 2. Register two test users ─────────────────────────────────────────────
  console.log('\n2. User registration');
  const ts = Date.now();
  const aliceEmail = `alice_${ts}@test.com`;
  const bobEmail   = `bob_${ts}@test.com`;
  const password   = 'Test@1234!';

  const aliceRes = await makeClient().post('/api/user/signup', { name: 'Alice', email: aliceEmail, password });
  ok('Alice signed up', aliceRes.status === 200, JSON.stringify(aliceRes.data));
  const aliceCookie = extractCookie(aliceRes);
  ok('Alice received session cookie', !!aliceCookie);

  const bobRes = await makeClient().post('/api/user/signup', { name: 'Bob', email: bobEmail, password });
  ok('Bob signed up', bobRes.status === 200, JSON.stringify(bobRes.data));
  const bobCookie = extractCookie(bobRes);
  ok('Bob received session cookie', !!bobCookie);

  if (!aliceCookie || !bobCookie) return finish();

  const alice = makeClient(aliceCookie);
  const bob   = makeClient(bobCookie);

  // ── 3. Deposit test funds ──────────────────────────────────────────────────
  console.log('\n3. Deposit test funds');

  const aliceDeposit = await alice.post('/api/user/deposit', { currency: 'USDT', amount: 1000 });
  ok('Alice credited 1000 USDT', aliceDeposit.data?.credited === 1000, JSON.stringify(aliceDeposit.data));

  const bobDeposit = await bob.post('/api/user/deposit', { currency: 'BTC', amount: 1 });
  ok('Bob credited 1 BTC', bobDeposit.data?.credited === 1, JSON.stringify(bobDeposit.data));

  // ── 4. Verify balances ─────────────────────────────────────────────────────
  console.log('\n4. Balance check before trade');

  const aliceBal = await alice.get('/api/user/balance');
  ok('Alice balance endpoint returns 200', aliceBal.status === 200);
  ok('Alice has 1000 USDT available', aliceBal.data?.USDT?.available === 1000,
    `got ${aliceBal.data?.USDT?.available}`);

  const bobBal = await bob.get('/api/user/balance');
  ok('Bob has 1 BTC available', bobBal.data?.BTC?.available === 1,
    `got ${bobBal.data?.BTC?.available}`);

  // ── 5. Place opposing orders ───────────────────────────────────────────────
  console.log('\n5. Order placement');

  // Alice places a BUY for 0.01 BTC at $50,000 → locks 500 USDT
  const buyRes = await alice.post('/api/trade/order', {
    pair: PAIR, side: 'buy', type: 'limit', price: PRICE, quantity: QTY,
  });
  ok('Alice BUY order accepted', buyRes.status === 201, JSON.stringify(buyRes.data));
  const buyOrderId = buyRes.data?.order?.id;
  ok('Buy order has a DB id', !!buyOrderId);
  ok('No immediate fill (no seller yet)', buyRes.data?.executedTrades?.length === 0);

  // Bob places a SELL for 0.01 BTC at $50,000 → should match Alice's BUY
  const sellRes = await bob.post('/api/trade/order', {
    pair: PAIR, side: 'sell', type: 'limit', price: PRICE, quantity: QTY,
  });
  ok('Bob SELL order accepted', sellRes.status === 201, JSON.stringify(sellRes.data));
  ok('Trade matched immediately', sellRes.data?.executedTrades?.length === 1,
    `fills: ${sellRes.data?.executedTrades?.length}`);

  const trade = sellRes.data?.executedTrades?.[0];
  if (trade) {
    ok('Trade price is correct', parseFloat(trade.price) === PRICE, `got ${trade.price}`);
    ok('Trade quantity is correct', parseFloat(trade.quantity) === QTY,  `got ${trade.quantity}`);
  }

  // ── 6. Verify balances after trade ────────────────────────────────────────
  console.log('\n6. Balance check after trade');

  const aliceAfter = await alice.get('/api/user/balance');
  const aliceUSDT  = aliceAfter.data?.USDT?.available ?? 0;
  const aliceBTC   = aliceAfter.data?.BTC?.available  ?? 0;
  const expectedUSDT = 1000 - PRICE * QTY; // 500

  ok(`Alice USDT decreased by ${PRICE * QTY}`, Math.abs(aliceUSDT - expectedUSDT) < 0.0001,
    `expected ${expectedUSDT}, got ${aliceUSDT}`);
  ok(`Alice gained ${QTY} BTC`, Math.abs(aliceBTC - QTY) < 0.000001,
    `expected ${QTY}, got ${aliceBTC}`);

  const bobAfter = await bob.get('/api/user/balance');
  const bobBTC   = bobAfter.data?.BTC?.available  ?? 0;
  const bobUSDT  = bobAfter.data?.USDT?.available ?? 0;
  const expectedBTC = 1 - QTY; // 0.99

  ok(`Bob BTC decreased by ${QTY}`, Math.abs(bobBTC - expectedBTC) < 0.000001,
    `expected ${expectedBTC}, got ${bobBTC}`);
  ok(`Bob received ${PRICE * QTY} USDT`, Math.abs(bobUSDT - PRICE * QTY) < 0.0001,
    `expected ${PRICE * QTY}, got ${bobUSDT}`);

  // ── 7. Order history ───────────────────────────────────────────────────────
  console.log('\n7. Order & trade history');

  const aliceOrders = await alice.get('/api/trade/orders');
  ok('Alice order history returns data', Array.isArray(aliceOrders.data) && aliceOrders.data.length > 0);

  const aliceTrades = await alice.get('/api/trade/trades');
  ok('Alice trade history contains the fill', aliceTrades.data?.length >= 1);

  // ── 8. Input validation ────────────────────────────────────────────────────
  console.log('\n8. Validation');

  const badOrder = await alice.post('/api/trade/order', { pair: 'INVALID', side: 'buy', price: 1, quantity: 1 });
  ok('Invalid pair rejected', badOrder.status === 400);

  const insufficientFunds = await alice.post('/api/trade/order', {
    pair: PAIR, side: 'buy', type: 'limit', price: PRICE, quantity: 999999,
  });
  ok('Insufficient funds rejected', insufficientFunds.status === 400,
    insufficientFunds.data?.error);

  // ── 9. CMC public endpoints ────────────────────────────────────────────────
  console.log('\n9. CMC market-data endpoints (public, unauthenticated)');

  const pub = makeClient(); // no auth cookie

  // /summary
  const summaryRes = await pub.get('/api/cmc/summary');
  ok('GET /cmc/summary → 200', summaryRes.status === 200, `got ${summaryRes.status}`);
  ok('/cmc/summary returns an array', Array.isArray(summaryRes.data));
  if (Array.isArray(summaryRes.data) && summaryRes.data.length > 0) {
    const s = summaryRes.data[0];
    ok('/cmc/summary entry has trading_pairs', typeof s.trading_pairs === 'string',
      JSON.stringify(s));
    ok('/cmc/summary entry has last_price (number)', typeof s.last_price === 'number',
      `got ${typeof s.last_price}`);
    ok('/cmc/summary entry has base_volume (number)', typeof s.base_volume === 'number',
      `got ${typeof s.base_volume}`);
    ok('/cmc/summary has 15 pairs', summaryRes.data.length === 15,
      `got ${summaryRes.data.length}`);
  }

  // /assets
  const assetsRes = await pub.get('/api/cmc/assets');
  ok('GET /cmc/assets → 200', assetsRes.status === 200, `got ${assetsRes.status}`);
  ok('/cmc/assets has BTC entry', typeof assetsRes.data?.BTC === 'object');
  ok('/cmc/assets BTC.can_withdraw === false', assetsRes.data?.BTC?.can_withdraw === false,
    `got ${assetsRes.data?.BTC?.can_withdraw}`);
  ok('/cmc/assets BTC.unified_cryptoasset_id === 1',
    assetsRes.data?.BTC?.unified_cryptoasset_id === 1,
    `got ${assetsRes.data?.BTC?.unified_cryptoasset_id}`);
  ok('/cmc/assets USDT.can_deposit === true', assetsRes.data?.USDT?.can_deposit === true,
    'USDT is in DEPOSIT_NETWORKS (TRX/ETH/BSC networks)');

  // /ticker
  const tickerRes = await pub.get('/api/cmc/ticker');
  ok('GET /cmc/ticker → 200', tickerRes.status === 200, `got ${tickerRes.status}`);
  ok('/cmc/ticker has BTC_USDT entry', typeof tickerRes.data?.BTC_USDT === 'object');
  if (tickerRes.data?.BTC_USDT) {
    ok('/cmc/ticker BTC_USDT has isFrozen field', 'isFrozen' in tickerRes.data.BTC_USDT,
      JSON.stringify(tickerRes.data.BTC_USDT));
    ok('/cmc/ticker BTC_USDT.base_id is a number',
      typeof tickerRes.data.BTC_USDT.base_id === 'number');
    ok('/cmc/ticker BTC_USDT.quote_id === 825',
      tickerRes.data.BTC_USDT.quote_id === 825,
      `got ${tickerRes.data.BTC_USDT.quote_id}`);
  }

  // /orderbook/:pair
  const bookRes = await pub.get('/api/cmc/orderbook/BTC_USDT');
  ok('GET /cmc/orderbook/BTC_USDT → 200', bookRes.status === 200, `got ${bookRes.status}`);
  ok('/cmc/orderbook has bids array', Array.isArray(bookRes.data?.bids));
  ok('/cmc/orderbook has asks array', Array.isArray(bookRes.data?.asks));
  ok('/cmc/orderbook has timestamp (number)', typeof bookRes.data?.timestamp === 'number');

  // /trades/:pair
  const tradesRes = await pub.get('/api/cmc/trades/BTC_USDT');
  ok('GET /cmc/trades/BTC_USDT → 200', tradesRes.status === 200, `got ${tradesRes.status}`);
  ok('/cmc/trades returns an array', Array.isArray(tradesRes.data));
  if (Array.isArray(tradesRes.data) && tradesRes.data.length > 0) {
    const t = tradesRes.data[0];
    ok('/cmc/trades entry has trade_id', typeof t.trade_id === 'number');
    ok('/cmc/trades entry has type (buy|sell)',
      t.type === 'buy' || t.type === 'sell', `got ${t.type}`);
  }

  // Bad pair → 400
  const badPair = await pub.get('/api/cmc/orderbook/FAKE_USDT');
  ok('Invalid pair /cmc/orderbook/FAKE_USDT → 400', badPair.status === 400,
    `got ${badPair.status}`);
  ok('Invalid pair error has error field', typeof badPair.data?.error === 'string');

  const badTrades = await pub.get('/api/cmc/trades/FAKE_USDT');
  ok('Invalid pair /cmc/trades/FAKE_USDT → 400', badTrades.status === 400,
    `got ${badTrades.status}`);

  // Cache hit — second call within 60 s should return X-Cache: HIT
  const summary2 = await pub.get('/api/cmc/summary');
  ok('/cmc/summary second call → X-Cache: HIT',
    summary2.headers['x-cache'] === 'HIT',
    `got x-cache: ${summary2.headers['x-cache']}`);

  finish();
}

function finish() {
  const total = passed + failed;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Results: ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ' ✅'}`);
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
