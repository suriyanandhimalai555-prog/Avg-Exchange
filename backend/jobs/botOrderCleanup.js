/**
 * jobs/botOrderCleanup.js — Periodic deletion of old bot orders.
 *
 * The market-maker bot cancels and re-places ~160 orders every 15 s.
 * Without cleanup that is ~920k cancelled rows/day. This job deletes
 * bot-owned cancelled/filled orders older than 24 h that are not
 * referenced by any trade. Real user orders are untouched.
 *
 * Runs once on startup, then every 24 hours.
 */

'use strict';

const db     = require('../db');
const config = require('../config');

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runCleanup() {
  const botEmail = config.botEmail;
  if (!botEmail) return;

  try {
    const userRes = await db.query('SELECT id FROM "User" WHERE email = $1', [botEmail]);
    if (userRes.rows.length === 0) return;
    const botId = userRes.rows[0].id;

    const { rowCount } = await db.query(
      `DELETE FROM orders
        WHERE user_id  = $1
          AND status   IN ('cancelled', 'filled')
          AND updated_at < NOW() - INTERVAL '24 hours'
          AND id NOT IN (
            SELECT buy_order_id  FROM trades WHERE buy_order_id  IS NOT NULL
            UNION
            SELECT sell_order_id FROM trades WHERE sell_order_id IS NOT NULL
          )`,
      [botId]
    );
    if (rowCount > 0) {
      console.log(`[cleanup] Deleted ${rowCount} old bot orders`);
    }
  } catch (err) {
    console.error('[cleanup] Bot order cleanup failed:', err.message);
  }
}

function start() {
  runCleanup(); // run once immediately
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = { start, runCleanup };
