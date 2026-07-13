/**
 * services/cmcMarketData.js — Data-access layer for CoinMarketCap-spec market
 * data endpoints.
 *
 * All functions are read-only against the database. The router layer
 * (routes/cmcRoutes.js) handles caching, HTTP concerns, and field mapping.
 *
 * Pair-key conventions
 * ─────────────────────
 *   Internal  → slash form:  "BTC/USDT"
 *   CMC       → underscore:  "BTC_USDT"
 */

'use strict';

const db       = require('../db');
const engine   = require('./engineService');
const ApiCache = require('../utils/apiCache');
const { SYMBOLS, QUOTE_CURRENCY, DEPOSIT_NETWORKS } = require('../config/pairs');

// Shared 60-second cache for the raw 24h aggregate + last-price queries.
// buildSummary() and buildTicker() both call getRawStats() so they share one
// DB round-trip per window instead of firing four independent queries.
const _rawStatsCache = new ApiCache(60_000);

// ── Pair-key helpers ──────────────────────────────────────────────────────────

/** "BTC/USDT" → "BTC_USDT" */
const toCmcPair   = (p) => p.replace('/', '_');
/** "BTC_USDT" → "BTC/USDT" */
const fromCmcPair = (p) => p.replace('_', '/');

// ── Static asset metadata ─────────────────────────────────────────────────────
// CMC unified_cryptoasset_id: these are CoinMarketCap's canonical integer IDs
// for each asset. Required in /ticker and /assets.
const ASSET_META = {
  BTC:  { name: 'Bitcoin',          unified_id: 1     },
  ETH:  { name: 'Ethereum',         unified_id: 1027  },
  BNB:  { name: 'BNB',              unified_id: 1839  },
  SOL:  { name: 'Solana',           unified_id: 5426  },
  XRP:  { name: 'XRP',              unified_id: 52    },
  ADA:  { name: 'Cardano',          unified_id: 2010  },
  DOGE: { name: 'Dogecoin',         unified_id: 74    },
  AVAX: { name: 'Avalanche',        unified_id: 5805  },
  MATIC:{ name: 'Polygon',          unified_id: 3890  },
  LTC:  { name: 'Litecoin',         unified_id: 2     },
  DOT:  { name: 'Polkadot',         unified_id: 6636  },
  LINK: { name: 'Chainlink',        unified_id: 1975  },
  UNI:  { name: 'Uniswap',          unified_id: 7083  },
  ATOM: { name: 'Cosmos',           unified_id: 3794  },
  TRX:  { name: 'TRON',             unified_id: 1958  },
  USDT: { name: 'Tether USDt',      unified_id: 825   },
};

// ── SQL helpers ───────────────────────────────────────────────────────────────

/**
 * Returns a Map<pair, {base_volume, quote_volume, high_24h, low_24h, open_price}>
 * for all pairs over the last 24 hours, computed from the trades table.
 *
 * Used by: /summary, /ticker
 */
async function get24hStats() {
  const { rows } = await db.query(`
    SELECT
      pair,
      SUM(quantity)           AS base_volume,
      SUM(price * quantity)   AS quote_volume,
      MAX(price)              AS high_24h,
      MIN(price)              AS low_24h,
      -- True 24h anchor: last trade price BEFORE the window opened.
      -- Gives accurate price_change_percent_24h for CMC. Uses idx_trades_pair_time.
      (SELECT t2.price
       FROM   trades t2
       WHERE  t2.pair = trades.pair
         AND  t2.executed_at <= NOW() - INTERVAL '24 hours'
       ORDER  BY t2.executed_at DESC
       LIMIT  1)              AS open_price
    FROM trades
    WHERE executed_at > NOW() - INTERVAL '24 hours'
    GROUP BY pair
  `);

  const map = new Map();
  for (const r of rows) {
    map.set(r.pair, {
      base_volume:  parseFloat(r.base_volume),
      quote_volume: parseFloat(r.quote_volume),
      high_24h:     parseFloat(r.high_24h),
      low_24h:      parseFloat(r.low_24h),
      // Preserve null when no anchor trade exists so ?? can fall back correctly.
      // parseFloat(null) = NaN which passes through nullish coalescing unchanged.
      open_price:   r.open_price != null ? parseFloat(r.open_price) : null,
    });
  }
  return map;
}

/**
 * Returns a Map<pair, last_price> — the price of the most recent trade per pair.
 * Uses DISTINCT ON for efficiency on the (pair, executed_at) index.
 */
async function getLastPrices() {
  const { rows } = await db.query(`
    SELECT DISTINCT ON (pair) pair, price
    FROM trades
    ORDER BY pair, executed_at DESC
  `);

  const map = new Map();
  for (const r of rows) {
    map.set(r.pair, parseFloat(r.price));
  }
  return map;
}

/**
 * Returns recent trades for a single pair.
 * Derives taker side: the order with the later created_at is the taker.
 *   - taker is buy_order → type = 'buy'  (a buy market order hit a resting ask)
 *   - taker is sell_order → type = 'sell'
 *
 * Heuristic note: this assumes the incoming taker order has a later created_at
 * than the resting maker order. This holds in normal operation (taker arrives
 * after maker) but is not guaranteed by a DB constraint under concurrent inserts.
 *
 * @param {string} internalPair e.g. "BTC/USDT"
 * @param {number} limit max rows
 * @param {number} windowHours look-back window in hours
 */
async function getRecentTrades(internalPair, limit = 200, windowHours = 24) {
  const { rows } = await db.query(`
    SELECT
      t.id,
      t.price,
      t.quantity,
      t.executed_at,
      bo.created_at AS buy_created,
      so.created_at AS sell_created
    FROM trades t
    JOIN orders bo ON bo.id = t.buy_order_id
    JOIN orders so ON so.id = t.sell_order_id
    WHERE t.pair = $1
      AND t.executed_at > NOW() - ($3 * INTERVAL '1 hour')
    ORDER BY t.executed_at DESC
    LIMIT $2
  `, [internalPair, limit, windowHours]);

  return rows.map(r => {
    const buyTs  = new Date(r.buy_created).getTime();
    const sellTs = new Date(r.sell_created).getTime();
    const takerIsBuy = buyTs > sellTs;

    const price       = parseFloat(r.price);
    const baseVolume  = parseFloat(r.quantity);
    const quoteVolume = parseFloat((price * baseVolume).toFixed(8));

    return {
      trade_id:     r.id,
      price:        price.toString(),
      base_volume:  baseVolume.toString(),
      quote_volume: quoteVolume.toString(),
      timestamp:    new Date(r.executed_at).getTime(),
      type:         takerIsBuy ? 'buy' : 'sell',
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns { data: { statsMap, lastPriceMap }, cacheStatus } with 60-second
 * cache-aside. Callers destructure cacheStatus to forward as X-Cache header,
 * eliminating the need for a separate route-level cache on /summary and /ticker.
 */
async function getRawStats() {
  return _rawStatsCache.wrap('cmc|raw-stats', async () => {
    const [statsMap, lastPriceMap] = await Promise.all([
      get24hStats(),
      getLastPrices(),
    ]);
    return { statsMap, lastPriceMap };
  });
}

/**
 * Data for GET /cmc/summary.
 * Combines book depth (live best bid/ask) with 24h trade stats.
 */
async function buildSummary() {
  const { data: { statsMap, lastPriceMap }, cacheStatus } = await getRawStats();

  const result = SYMBOLS.map(sym => {
    const internalPair = `${sym}/${QUOTE_CURRENCY}`;
    const cmcPair      = toCmcPair(internalPair);
    const depth        = engine.getDepth(internalPair);
    const stats        = statsMap.get(internalPair);
    const lastPrice    = lastPriceMap.get(internalPair);

    // Best bid/ask from live book; 0 if no liquidity
    const lowestAsk  = depth.asks.length ? depth.asks[0].price  : 0;
    const highestBid = depth.bids.length ? depth.bids[0].price  : 0;

    // Last price: prefer most-recent trade; fall back to book mid; then 0
    let last = lastPrice ?? 0;
    if (!last && lowestAsk && highestBid) {
      last = (lowestAsk + highestBid) / 2;
    }

    // open_price = last trade before the 24h window (true anchor for % change)
    const openPrice = stats?.open_price ?? last;
    const pctChange = openPrice
      ? parseFloat((((last - openPrice) / openPrice) * 100).toFixed(4))
      : 0;

    return {
      trading_pairs:              cmcPair,
      base_currency:              sym,
      quote_currency:             QUOTE_CURRENCY,
      last_price:                 last,
      lowest_ask:                 lowestAsk,
      highest_bid:                highestBid,
      base_volume:                stats?.base_volume  ?? 0,
      quote_volume:               stats?.quote_volume ?? 0,
      price_change_percent_24h:   pctChange,
      highest_price_24h:          stats?.high_24h     ?? last,
      lowest_price_24h:           stats?.low_24h      ?? last,
    };
  });

  return { data: result, cacheStatus };
}

/**
 * Data for GET /cmc/assets.
 * Static metadata only — no live data needed.
 */
function buildAssets() {
  const result = {};
  // Include all base symbols + USDT
  const allCurrencies = [...SYMBOLS, QUOTE_CURRENCY];

  for (const sym of allCurrencies) {
    const meta      = ASSET_META[sym] || { name: sym, unified_id: 0 };
    const canDeposit = sym in DEPOSIT_NETWORKS;

    result[sym] = {
      name:                   meta.name,
      unified_cryptoasset_id: meta.unified_id,
      can_withdraw:           false,   // withdrawals are disabled (admin-gated)
      can_deposit:            canDeposit,
      min_withdraw:           0,
      max_withdraw:           0,
      maker_fee:              0,
      taker_fee:              0,
    };
  }

  return result;
}

/**
 * Data for GET /cmc/ticker.
 * Pairs 24h stats with CMC numeric asset IDs.
 */
async function buildTicker() {
  const { data: { statsMap, lastPriceMap }, cacheStatus } = await getRawStats();

  const result = {};
  const quoteId = ASSET_META[QUOTE_CURRENCY]?.unified_id ?? 825;

  for (const sym of SYMBOLS) {
    const internalPair = `${sym}/${QUOTE_CURRENCY}`;
    const cmcPair      = toCmcPair(internalPair);
    const meta         = ASSET_META[sym] || { unified_id: 0 };
    const stats        = statsMap.get(internalPair);
    const lastPrice    = lastPriceMap.get(internalPair);
    const depth        = engine.getDepth(internalPair);

    const hasBook   = depth.asks.length > 0 || depth.bids.length > 0;
    const hasTrades = !!stats;
    const isFrozen  = (!hasBook && !hasTrades) ? 1 : 0;

    let last = lastPrice ?? 0;
    if (!last && hasBook) {
      const ask = depth.asks[0]?.price ?? 0;
      const bid = depth.bids[0]?.price ?? 0;
      if (ask && bid) last = (ask + bid) / 2;
    }

    result[cmcPair] = {
      base_id:      meta.unified_id,
      quote_id:     quoteId,
      last_price:   last,
      base_volume:  stats?.base_volume  ?? 0,
      quote_volume: stats?.quote_volume ?? 0,
      isFrozen,
    };
  }

  return { data: result, cacheStatus };
}

/**
 * Data for GET /cmc/orderbook/:market_pair.
 *
 * @param {string} cmcPair    e.g. "BTC_USDT"
 * @param {number} depth      max levels per side (default 50, CMC typical)
 * @returns {{ timestamp, bids: string[][], asks: string[][] }}
 */
function buildOrderBook(cmcPair, depthLimit = 50) {
  const internalPair = fromCmcPair(cmcPair);
  const raw = engine.getDepth(internalPair);

  const mapLevel = (level) => [
    level.price.toString(),
    level.amount.toString(),
  ];

  // timestamp is intentionally omitted here — the route injects Date.now() at
  // serve time so cached responses never carry a stale timestamp.
  return {
    bids: raw.bids.slice(0, depthLimit).map(mapLevel),
    asks: raw.asks.slice(0, depthLimit).map(mapLevel),
  };
}

module.exports = {
  ASSET_META,
  toCmcPair,
  fromCmcPair,
  buildSummary,
  buildAssets,
  buildTicker,
  buildOrderBook,
  getRecentTrades,
};
