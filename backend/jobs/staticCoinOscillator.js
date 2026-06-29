/**
 * jobs/staticCoinOscillator.js — Simulates realistic price movement for admin-configured coins.
 *
 * Runs every 10 seconds. Random walk +/-0.4% per tick,
 * with gentle mean-reversion bias to prevent drift.
 */

'use strict';

const db = require('../db');

const TICK_INTERVAL_MS = 10_000;

function start() {
  setInterval(async () => {
    try {
      const { rows } = await db.query(
        `SELECT symbol, min_price, max_price, current_price, price_24h_updated_at
           FROM static_coin_config WHERE enabled = TRUE LIMIT 1`
      );
      if (!rows[0]) return;

      const min     = parseFloat(rows[0].min_price);
      const max     = parseFloat(rows[0].max_price);

      // Random walk with gentle pull toward centre to prevent drift
      const centre = (min + max) / 2;
      // Recover from any previously-corrupted (NaN/non-finite) price.
      let current = parseFloat(rows[0].current_price);
      if (!Number.isFinite(current)) current = centre;

      const range = max - min;
      // Guard divide-by-zero when an admin pegs min_price === max_price.
      const bias  = range > 0 ? ((centre - current) / range) * 0.002 : 0;
      const delta = current * ((Math.random() * 0.008 - 0.004) + bias);
      let next    = Math.min(max, Math.max(min, current + delta));
      if (!Number.isFinite(next)) next = centre;

      const snapshot24hOld = rows[0].price_24h_updated_at
        ? Date.now() - new Date(rows[0].price_24h_updated_at).getTime() > 86_400_000
        : true;

      await db.query(
        `UPDATE static_coin_config
            SET current_price        = $1,
                price_24h_ago        = CASE WHEN $3 THEN current_price ELSE price_24h_ago END,
                price_24h_updated_at = CASE WHEN $3 THEN NOW() ELSE price_24h_updated_at END,
                updated_at           = NOW()
          WHERE symbol = $2`,
        [next.toFixed(10), rows[0].symbol, snapshot24hOld]
      );
    } catch (_) {}
  }, TICK_INTERVAL_MS);
}

module.exports = { start };
