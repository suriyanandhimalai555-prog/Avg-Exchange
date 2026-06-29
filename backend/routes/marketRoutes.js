/**
 * routes/marketRoutes.js — CoinGecko proxy, Binance live tickers, and static coin data.
 */

'use strict';

const express       = require('express');
const axios         = require('axios');
const config        = require('../config');
const db            = require('../db');
const binanceStream = require('../services/binanceStreamService');
const ApiCache      = require('../utils/apiCache');
const { SYMBOLS, QUOTE_CURRENCY } = require('../config/pairs');

const router = express.Router();
const cache  = new ApiCache(60_000);

// GET /api/markets/pairs — canonical list of supported trading pairs.
// This is the single source of truth (config/pairs.js); the frontend mirrors
// it in constants/pairs.js and should prefer this endpoint where practical.
router.get('/pairs', (_req, res) => {
  res.json({
    quote:   QUOTE_CURRENCY,
    symbols: SYMBOLS,
    pairs:   SYMBOLS.map(s => `${s}/${QUOTE_CURRENCY}`),
  });
});

// GET /api/markets — CoinGecko proxy with server-side caching
router.get('/', async (req, res) => {
  const {
    vs_currency = 'usd',
    per_page    = 15,
    page        = 1,
    order       = 'market_cap_desc',
  } = req.query;

  const limit = Math.min(parseInt(per_page, 10) || 15, 250);
  const key   = `coingecko|${vs_currency}|${limit}|${page}|${order}`;

  try {
    const { data, cacheStatus } = await cache.wrap(key, async () => {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
        params:  { vs_currency, order, per_page: limit, page },
        headers: config.coingeckoApiKey
          ? { 'x-cg-demo-api-key': config.coingeckoApiKey }
          : {},
        timeout: 8_000,
      });
      return data;
    });

    res.set('X-Cache', cacheStatus);
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 500;
    res.status(status).json({ error: 'Failed to fetch market data', detail: err.message });
  }
});

// GET /api/markets/live — Binance real-time tickers
router.get('/live', (_req, res) => {
  const tickers = binanceStream.getAllTickers();
  if (Object.keys(tickers).length === 0) {
    return res.status(503).json({ error: 'Live prices not yet available — stream is connecting' });
  }
  res.json(tickers);
});

// GET /api/markets/static-coin — public, returns enabled static coin
router.get('/static-coin', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT symbol, min_price, max_price, current_price, price_24h_ago
         FROM static_coin_config WHERE enabled = TRUE LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (_) {
    res.status(500).json(null);
  }
});

module.exports = router;
