/**
 * routes/cryptoRoutes.js — CoinMarketCap proxy with server-side caching.
 */

'use strict';

const express  = require('express');
const axios    = require('axios');
const config   = require('../config');
const ApiCache = require('../utils/apiCache');

const router = express.Router();
const cache  = new ApiCache(60_000);

// GET /api/crypto/listings — Top cryptos via CoinMarketCap
router.get('/listings', async (req, res) => {
  const { convert = 'INR', limit = 50 } = req.query;
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
  const key = `cmc|${convert}|${safeLimit}`;

  try {
    const { data, cacheStatus } = await cache.wrap(key, async () => {
      const { data: body } = await axios.get(
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
        {
          params:  { start: 1, limit: safeLimit, convert },
          headers: { 'X-CMC_PRO_API_KEY': config.coinmarketcapApiKey },
          timeout: 8_000,
        }
      );
      return body.data;
    });

    res.set('X-Cache', cacheStatus);
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 500;
    res.status(status).json({ error: 'Failed to fetch crypto listings' });
  }
});

module.exports = router;
