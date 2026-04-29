const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = new Map(); // key → { data, fetchedAt }

// GET /api/crypto/listings — Top cryptos via CoinMarketCap (cached)
router.get('/listings', async (req, res) => {
  const { convert = 'INR', limit = 50 } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
  const key = `${convert}|${safeLimit}`;
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
    res.set('X-Cache', 'HIT');
    return res.json(hit.data);
  }

  try {
    const { data: body } = await axios.get(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
      {
        params:  { start: 1, limit: safeLimit, convert },
        headers: { 'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API },
        timeout: 8_000,
      }
    );
    cache.set(key, { data: body.data, fetchedAt: now });
    res.set('X-Cache', 'MISS');
    return res.json(body.data);
  } catch (err) {
    if (hit) {
      res.set('X-Cache', 'STALE');
      return res.json(hit.data);
    }
    const status = err.response?.status ?? 500;
    return res.status(status).json({ error: 'Failed to fetch crypto listings' });
  }
});

module.exports = router;
