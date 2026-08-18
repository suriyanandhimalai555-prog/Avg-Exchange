/**
 * routes/marketRoutes.js
 *
 * Market data:
 *   /api/markets       -> CoinMarketCap with server-side caching
 *   /api/markets/live  -> Binance WebSocket live prices
 *   /api/markets/pairs -> Supported trading pairs
 *   /api/markets/static-coin -> Static coin configuration
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

const cache = new ApiCache(60_000);

/*
 * CoinMarketCap IDs.
 *
 * These IDs are used to convert CMC response format into the
 * same format that the frontend/bot previously received from CoinGecko.
 */
const CMC_IDS = {
  bitcoin: 1,
  ethereum: 1027,
  tether: 825,
  binancecoin: 1839,
  solana: 5426,
  ripple: 52,
  cardano: 2010,
  dogecoin: 74,
  polkadot: 6636,
  chainlink: 1975,
  avalanche: 5805,
  'avalanche-2': 5805,
  'matic-network': 3890,
  polygon: 3890,
  'shiba-inu': 5994,
  litecoin: 2,
  uniswap: 7083,
  cosmos: 3794,
  'the-open-network': 11419,
};

const CMC_TO_GECKO_ID = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  BNB:  'binancecoin',
  XRP:  'ripple',
  ADA:  'cardano',
  DOGE: 'dogecoin',
  DOT:  'polkadot',
  LINK: 'chainlink',
  AVAX: 'avalanche-2',
  MATIC:'matic-network',
  SHIB: 'shiba-inu',
  LTC:  'litecoin',
  UNI:  'uniswap',
  ATOM: 'cosmos',
  TON:  'the-open-network',
};

/*
 * Coin images.
 *
 * CoinMarketCap listing responses do not provide the image URL
 * used by the frontend, so we provide a stable image mapping here.
 *
 * This matches the image sources previously used by the frontend.
 */
const COIN_IMAGES = {
  BTC:  'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH:  'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/large/tether.png',
  BNB:  'https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png',
  SOL:  'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  XRP:  'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
  ADA:  'https://assets.coingecko.com/coins/images/975/large/cardano.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
  DOT:  'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
  MATIC:'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
  LTC:  'https://assets.coingecko.com/coins/images/2/large/litecoin.png',
  UNI:  'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png',
  ATOM: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png',
  TRX:  'https://assets.coingecko.com/coins/images/1094/large/tron.png',
};

function normalizeCoin(coin) {
  const symbol = String(coin.symbol || '').toUpperCase();

  const quote = coin.quote?.USD || {};

  return {
    id: CMC_TO_GECKO_ID[symbol] || String(coin.slug || '').toLowerCase(),

    symbol: symbol.toLowerCase(),

    name: coin.name,

    /*
     * CMC does not provide the frontend image field we previously used.
     * Use our stable symbol-based mapping instead.
     */
    image: COIN_IMAGES[symbol] || null,

    current_price: Number(quote.price || 0),

    market_cap: Number(quote.market_cap || 0),

    market_cap_rank:
      coin.cmc_rank != null
        ? Number(coin.cmc_rank)
        : null,

    fully_diluted_valuation:
      Number(quote.fully_diluted_market_cap || 0),

    total_volume:
      Number(quote.volume_24h || 0),

    high_24h: null,

    low_24h: null,

    price_change_24h:
      Number(quote.percent_change_24h || 0),

    price_change_percentage_24h:
      Number(quote.percent_change_24h || 0),

    circulating_supply:
      Number(coin.circulating_supply || 0),

    total_supply:
      Number(coin.total_supply || 0),

    max_supply:
      coin.max_supply == null
        ? null
        : Number(coin.max_supply),

    last_updated:
      quote.last_updated || coin.last_updated || null,
  };
}

/*
 * GET /api/markets/pairs
 *
 * Returns ONLY the actual exchange trading pairs.
 */
router.get('/pairs', (_req, res) => {
  res.json({
    quote: QUOTE_CURRENCY,

    symbols: SYMBOLS,

    pairs: SYMBOLS.map(
      symbol => `${symbol}/${QUOTE_CURRENCY}`
    ),
  });
});

/*
 * GET /api/markets
 *
 * CoinMarketCap is the ONLY external provider used here.
 *
 * Server-side cache:
 *   60 seconds
 *
 * This prevents every frontend/bot request from hitting CMC.
 */
router.get('/', async (req, res) => {
  const {
    vs_currency = 'usd',
    per_page = 15,
    page = 1,
    order = 'market_cap_desc',
  } = req.query;

  const limit = Math.min(
    Math.max(parseInt(per_page, 10) || 15, 1),
    100
  );

  const pageNumber = Math.max(
    parseInt(page, 10) || 1,
    1
  );

  const key =
    `cmc|${vs_currency}|${limit}|${pageNumber}|${order}`;

  try {
    const { data, cacheStatus } = await cache.wrap(
      key,
      async () => {

        if (!config.coinmarketcapApiKey) {
          throw new Error(
            'COINMARKETCAP_API is not configured'
          );
        }

        const response = await axios.get(
          'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
          {
            params: {
              start: ((pageNumber - 1) * limit) + 1,
              limit,
              convert: 'USD',
            },

            headers: {
              'X-CMC_PRO_API_KEY':
                config.coinmarketcapApiKey,

              Accept: 'application/json',
            },

            timeout: 10_000,
          }
        );

        if (!response.data?.data) {
          throw new Error(
            'Invalid CoinMarketCap response'
          );
        }

        return response.data.data.map(normalizeCoin);
      }
    );

    res.set('X-Cache', cacheStatus);

    res.json(data);

  } catch (err) {

    console.error(
      '[markets] CoinMarketCap error:',
      err.response?.status || err.code || err.message
    );

    if (err.response?.data) {
      console.error(
        '[markets] CMC response:',
        JSON.stringify(err.response.data)
      );
    }

    const status =
      err.response?.status ?? 500;

    res.status(status).json({
      error: 'Failed to fetch market data',
      detail: err.message,
    });
  }
});

/*
 * GET /api/markets/live
 *
 * Binance WebSocket.
 *
 * This is independent from CoinMarketCap.
 */
router.get('/live', (_req, res) => {

  const tickers =
    binanceStream.getAllTickers();

  if (
    Object.keys(tickers).length === 0
  ) {
    return res.status(503).json({
      error:
        'Live prices not yet available — Binance stream is connecting',
    });
  }

  res.json(tickers);
});

/*
 * GET /api/markets/static-coin
 */
router.get('/static-coin', async (_req, res) => {

  try {

    const { rows } = await db.query(`
      SELECT
        symbol,
        min_price,
        max_price,
        current_price,
        price_24h_ago
      FROM static_coin_config
      WHERE enabled = TRUE
      LIMIT 1
    `);

    res.json(rows[0] || null);

  } catch (err) {

    console.error(
      '[markets] static coin error:',
      err.message
    );

    res.status(500).json(null);
  }
});

module.exports = router;
