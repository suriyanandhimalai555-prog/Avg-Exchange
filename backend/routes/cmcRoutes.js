/**
 * routes/cmcRoutes.js — CoinMarketCap-spec public market-data endpoints.
 *
 * Mounted at /api/cmc in server.js. Fully public (no requireAuth).
 * All responses are cached 60 s in memory and carry X-Cache headers.
 *
 * Endpoints
 * ──────────
 *   GET /api/cmc/              → self-describing API docs index
 *   GET /api/cmc/summary       → all pairs ticker (CMC summary format)
 *   GET /api/cmc/assets        → per-asset metadata (can_withdraw, fees, …)
 *   GET /api/cmc/ticker        → compact 24h ticker keyed by pair
 *   GET /api/cmc/orderbook/:market_pair  → live order book (CMC array form)
 *   GET /api/cmc/trades/:market_pair     → recent public trades
 *
 * Pair key convention: "BTC_USDT" (underscore) as required by CMC.
 * The internal pair format is "BTC/USDT" (slash); helpers convert between them.
 *
 * ⚠️  Spec note: CMC's "ideal endpoints" template article is auth-gated.
 *     Before submission, diff live output against the official template.
 *     ⚠️  can_withdraw is false because withdrawals are currently admin-gated.
 */

'use strict';

const express   = require('express');
const ApiCache  = require('../utils/apiCache');
const { isValidPair } = require('../utils/pairValidator');
const { cmcLimiter } = require('../middleware/rateLimiters');
const {
  toCmcPair,
  fromCmcPair,
  buildSummary,
  buildAssets,
  buildTicker,
  buildOrderBook,
  getRecentTrades,
} = require('../services/cmcMarketData');

const router = express.Router();
// Route-level cache for /orderbook and /trades (per-pair, no internal cache).
// /summary and /ticker rely on the shared _rawStatsCache inside cmcMarketData.js.
const cache  = new ApiCache(60_000);

router.use(cmcLimiter);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamps an integer query-param to [min, max], falling back to def when
 * the value is absent, non-numeric, or NaN. Negative values are rejected.
 */
function clamp(raw, min, max, def) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
}

/**
 * Validates a CMC-format pair param ("BTC_USDT") and converts to internal form.
 * Returns { ok: true, internalPair } or { ok: false, status, error }.
 * DB errors from isValidPair (now propagated) are caught here and returned as 503
 * so route handlers always get a safe { ok, status, error } object, never a throw.
 */
async function resolvePair(cmcPair) {
  if (!cmcPair || typeof cmcPair !== 'string') {
    return { ok: false, status: 400, error: 'Missing market_pair parameter (e.g. BTC_USDT)' };
  }
  const internalPair = fromCmcPair(cmcPair.toUpperCase());
  try {
    const valid = await isValidPair(internalPair);
    if (!valid) return { ok: false, status: 400, error: `Unknown market pair: ${cmcPair}` };
    return { ok: true, internalPair };
  } catch (_) {
    return { ok: false, status: 503, error: 'Service temporarily unavailable' };
  }
}

// ── GET /api/cmc/ — self-describing docs index ────────────────────────────────
router.get('/', (_req, res) => {
  res.json({
    name:        'AvgExchange Market Data API',
    version:     '1.0',
    base_url:    '/api/cmc',
    description: 'Public market-data endpoints in CoinMarketCap standardized format. No authentication required.',
    endpoints: [
      {
        path:        '/summary',
        method:      'GET',
        description: 'Summary ticker for all trading pairs (24h stats + live best bid/ask).',
        response_key: 'Array<SummaryObject>',
      },
      {
        path:        '/assets',
        method:      'GET',
        description: 'Metadata for all supported assets (deposit/withdrawal status, fees).',
        response_key: 'Object<symbol, AssetObject>',
      },
      {
        path:        '/ticker',
        method:      'GET',
        description: 'Compact 24h ticker for all pairs, keyed by CMC pair (e.g. BTC_USDT).',
        response_key: 'Object<pair, TickerObject>',
      },
      {
        path:        '/orderbook/:market_pair',
        method:      'GET',
        description: 'Live order book for a pair. market_pair e.g. BTC_USDT.',
        params:      { depth: 'integer (optional, max levels per side, default 50)' },
        response_key:'{ timestamp, bids:string[][], asks:string[][] }',
      },
      {
        path:        '/trades/:market_pair',
        method:      'GET',
        description: 'Recent public trades for a pair. market_pair e.g. BTC_USDT.',
        params:      { limit: 'integer (optional, max rows, default 200)', window_hours: 'integer (optional, look-back, default 24)' },
        response_key:'Array<TradeObject>',
      },
    ],
    notes: [
      'can_withdraw is false because withdrawals are currently admin-gated.',
      'trading_pairs use underscore separator (BTC_USDT).',
      'Responses are cached for 60 seconds. X-Cache header indicates HIT / MISS / STALE.',
    ],
  });
});

// ── GET /api/cmc/summary ──────────────────────────────────────────────────────
// Cache lives inside buildSummary() → getRawStats() → _rawStatsCache (60 s).
// No route-level cache here to avoid double-TTL staleness.
router.get('/summary', async (_req, res) => {
  try {
    const { data, cacheStatus } = await buildSummary();
    res.set('X-Cache', cacheStatus);
    res.json(data);
  } catch (err) {
    console.error('[CMC /summary]', err.message);
    res.status(500).json({ error: 'Failed to build summary' });
  }
});

// ── GET /api/cmc/assets ───────────────────────────────────────────────────────
router.get('/assets', (_req, res) => {
  // buildAssets is synchronous (static data only) — no need to cache async
  res.set('X-Cache', 'STATIC');
  res.json(buildAssets());
});

// ── GET /api/cmc/ticker ───────────────────────────────────────────────────────
// Cache lives inside buildTicker() → getRawStats() → _rawStatsCache (60 s).
router.get('/ticker', async (_req, res) => {
  try {
    const { data, cacheStatus } = await buildTicker();
    res.set('X-Cache', cacheStatus);
    res.json(data);
  } catch (err) {
    console.error('[CMC /ticker]', err.message);
    res.status(500).json({ error: 'Failed to build ticker' });
  }
});

// ── GET /api/cmc/orderbook/:market_pair ──────────────────────────────────────
// NOTE: buildOrderBook returns raw { bids, asks } (no self-caching); this route
// wraps it with cache.wrap(). buildSummary/buildTicker are self-caching and are
// called directly. Do NOT add self-caching to buildOrderBook without removing
// this cache.wrap() — doing both would double-nest the { data, cacheStatus } envelope.
router.get('/orderbook/:market_pair', async (req, res) => {
  const { ok, error, status, internalPair } = await resolvePair(req.params.market_pair);
  if (!ok) return res.status(status).json({ error });

  const depthLimit = clamp(req.query.depth, 1, 200, 50);
  const cmcPair    = toCmcPair(internalPair);
  const cacheKey   = `cmc|orderbook|${cmcPair}|${depthLimit}`;

  try {
    const { data, cacheStatus } = await cache.wrap(cacheKey, () => buildOrderBook(cmcPair, depthLimit));
    res.set('X-Cache', cacheStatus);
    // timestamp injected at serve time so cache hits carry a fresh value
    res.json({ ...data, timestamp: Date.now() });
  } catch (err) {
    console.error('[CMC /orderbook]', err.message);
    res.status(500).json({ error: 'Failed to build order book' });
  }
});

// ── GET /api/cmc/trades/:market_pair ─────────────────────────────────────────
router.get('/trades/:market_pair', async (req, res) => {
  const { ok, error, status, internalPair } = await resolvePair(req.params.market_pair);
  if (!ok) return res.status(status).json({ error });

  const limit       = clamp(req.query.limit, 1, 500, 200);
  const windowHours = clamp(req.query.window_hours, 1, 72, 24);
  const cmcPair     = toCmcPair(internalPair);
  const cacheKey    = `cmc|trades|${cmcPair}|${limit}|${windowHours}`;

  try {
    const { data, cacheStatus } = await cache.wrap(
      cacheKey,
      () => getRecentTrades(internalPair, limit, windowHours),
    );
    res.set('X-Cache', cacheStatus);
    res.json(data);
  } catch (err) {
    console.error('[CMC /trades]', err.message);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

module.exports = router;
