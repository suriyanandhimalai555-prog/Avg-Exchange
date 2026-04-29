const express = require('express');
const axios   = require('axios');
const router  = express.Router();

// ── In-memory response cache ──────────────────────────────────────────────────
// Keyed by serialised query params so different per_page/page combos are cached
// independently. All clients (bot + every frontend user) share this cache, so
// we make at most 1 CoinGecko call per TTL window per unique query combination.
const CACHE_TTL_MS = 60_000; // 60 seconds — well within CoinGecko free-tier limits
const cache = new Map(); // key → { data, fetchedAt }

function cacheKey(params) {
  const { vs_currency = 'usd', per_page = 15, page = 1, order = 'market_cap_desc' } = params;
  return `${vs_currency}|${per_page}|${page}|${order}`;
}

// GET /api/markets — CoinGecko proxy with server-side caching
router.get('/', async (req, res) => {
  const {
    vs_currency = 'usd',
    per_page    = 15,
    page        = 1,
    order       = 'market_cap_desc',
  } = req.query;

  const limit = Math.min(parseInt(per_page, 10) || 15, 250);
  const key   = cacheKey({ vs_currency, per_page: limit, page, order });
  const now   = Date.now();

  // ── Serve from cache if fresh ─────────────────────────────────────────────
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
    res.set('X-Cache', 'HIT');
    return res.json(hit.data);
  }

  // ── Fetch from CoinGecko ──────────────────────────────────────────────────
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params:  { vs_currency, order, per_page: limit, page },
      headers: process.env.COINGECKO_API_KEY
        ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
        : {},
      timeout: 8_000,
    });

    cache.set(key, { data, fetchedAt: now });
    res.set('X-Cache', 'MISS');
    return res.json(data);

  } catch (err) {
    // ── Return stale cache rather than an error ───────────────────────────
    if (hit) {
      const ageS = Math.round((now - hit.fetchedAt) / 1000);
      res.set('X-Cache', `STALE age=${ageS}s`);
      return res.json(hit.data);
    }

    const status = err.response?.status ?? 500;
    return res.status(status).json({ error: 'Failed to fetch market data', detail: err.message });
  }
});

module.exports = router;
