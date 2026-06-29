/**
 * purge-orphans.js — One-time cleanup of the bot's orphan orders.
 *
 * Run with the bot stopped:
 *   node purge-orphans.js
 *
 * What it does:
 *   1. Logs into the bot account.
 *   2. Fetches EVERY open/partially_filled order across ALL pairs
 *      (uses the paginated /orders endpoint with status filter + limit=1000).
 *   3. Cancels each via DELETE /api/trade/order/:id, which goes through the
 *      engine's cancelOrder() — that releases the locked funds back to
 *      available balance inside a DB transaction.
 *   4. Prints before/after balances so you can see the funds returning.
 *
 * After running this once, the bot's `available` balance should jump back
 * close to whatever was originally deposited, since most of it was sitting
 * locked in stale orders from previous sessions.
 */

require('dotenv').config();
const axios  = require('axios');
const config = require('./config');

const PAGE_LIMIT = 1000;

const extractCookie = (res) => {
  const raw = res.headers['set-cookie'] ?? [];
  const entry = raw.find((c) => c.startsWith('token='));
  return entry ? entry.split(';')[0] : null;
};

async function main() {
  console.log('═'.repeat(55));
  console.log('  AVG Exchange — Bot Orphan Order Purge');
  console.log('═'.repeat(55));
  console.log(`  API     : ${config.API_URL}`);
  console.log(`  Account : ${config.BOT_EMAIL}`);
  console.log('═'.repeat(55) + '\n');

  // ── Login ───────────────────────────────────────────────────────────────
  const loginRes = await axios.post(
    `${config.API_URL}/api/user/bot-login`,
    { email: config.BOT_EMAIL, password: config.BOT_PASSWORD, botSecret: config.BOT_SECRET },
    { validateStatus: () => true }
  );
  if (loginRes.status !== 200) {
    console.error('[purge] Login failed:', loginRes.status, loginRes.data);
    process.exit(1);
  }
  const cookie = extractCookie(loginRes);
  if (!cookie) {
    console.error('[purge] No session cookie returned');
    process.exit(1);
  }

  const client = axios.create({
    baseURL: config.API_URL,
    headers: { Cookie: cookie },
    validateStatus: () => true,
  });

  // ── Balance snapshot (before) ───────────────────────────────────────────
  const balBefore = await client.get('/api/user/balance');
  console.log('[purge] Balances BEFORE:');
  for (const [c, { available, locked }] of Object.entries(balBefore.data || {})) {
    console.log(`  ${c.padEnd(6)}  available: ${Number(available).toLocaleString()}  locked: ${Number(locked).toLocaleString()}`);
  }

  // ── Fetch every open/partially_filled order, paged by created_at ────────
  // The endpoint is capped at 1000 per call; loop until we've drained them.
  let totalCancelled = 0;
  let totalFailed    = 0;

  while (true) {
    const res = await client.get('/api/trade/orders', {
      params: { status: 'open,partially_filled', limit: PAGE_LIMIT },
    });
    if (res.status !== 200) {
      console.error('[purge] /orders failed:', res.status, res.data);
      process.exit(1);
    }

    const orders = res.data || [];
    if (orders.length === 0) break;

    console.log(`\n[purge] Cancelling ${orders.length} order(s)…`);

    const results = await Promise.allSettled(
      orders.map((o) => client.delete(`/api/trade/order/${o.id}`))
    );

    let ok = 0, fail = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.status === 200) ok++;
      else fail++;
    }
    totalCancelled += ok;
    totalFailed    += fail;
    console.log(`[purge] Page done — cancelled ${ok}, failed ${fail}`);

    // If fewer than the page limit came back, we've drained the queue.
    if (orders.length < PAGE_LIMIT) break;
  }

  console.log(`\n[purge] Total cancelled: ${totalCancelled} (failed: ${totalFailed})`);

  // ── Balance snapshot (after) ────────────────────────────────────────────
  const balAfter = await client.get('/api/user/balance');
  console.log('\n[purge] Balances AFTER:');
  for (const [c, { available, locked }] of Object.entries(balAfter.data || {})) {
    console.log(`  ${c.padEnd(6)}  available: ${Number(available).toLocaleString()}  locked: ${Number(locked).toLocaleString()}`);
  }

  console.log('\n[purge] ✅ Done. You can now restart the bot with `npm start`.');
}

main().catch((err) => {
  console.error('[purge] Fatal:', err?.message || err);
  if (err?.response) {
    console.error('[purge] status:', err.response.status, 'body:', JSON.stringify(err.response.data));
  }
  process.exit(1);
});
