/**
 * jobs/staleBotPurge.js — Purge stale bot orders before engine recovery.
 *
 * Called once at startup, before recoverFromDB(). If the bot was killed
 * (SIGKILL / crash / reboot), its orders remain 'open' in the DB. Without
 * cleanup they re-enter the live book and match real user orders.
 *
 * Idempotent and safe to run on every boot. No-op if BOT_EMAIL is unset.
 */

'use strict';

const Decimal = require('../utils/decimal');
const db      = require('../db');
const config  = require('../config');

async function run() {
  const botEmail = config.botEmail;
  if (!botEmail) return;

  const userRes = await db.query(
    'SELECT id FROM "User" WHERE email = $1',
    [botEmail]
  );
  if (userRes.rows.length === 0) return;

  const botId = userRes.rows[0].id;

  const { rows: stale } = await db.query(
    `SELECT id, side, pair, price, remaining_quantity
       FROM orders
      WHERE user_id = $1
        AND status IN ('open', 'partially_filled')`,
    [botId]
  );

  if (stale.length === 0) return;

  // Unlock reserved funds for every stale order before cancelling
  for (const o of stale) {
    const [baseCurrency, quoteCurrency] = o.pair.split('/');
    const lockCurrency = o.side === 'buy' ? quoteCurrency : baseCurrency;
    const lockAmount   = o.side === 'buy'
      ? new Decimal(o.price).mul(o.remaining_quantity).toFixed(10)
      : new Decimal(o.remaining_quantity).toFixed(10);

    await db.unlockFunds(botId, lockCurrency, lockAmount).catch((err) => {
      console.error(`[startup] Failed to unlock funds for stale bot order ${o.id}:`, err.message);
    });
  }

  await db.query(
    `UPDATE orders
        SET status     = 'cancelled',
            updated_at = NOW()
      WHERE user_id = $1
        AND status IN ('open', 'partially_filled')`,
    [botId]
  );

  console.log(`[startup] Purged ${stale.length} stale bot order(s) for ${botEmail}`);
}

module.exports = { run };
