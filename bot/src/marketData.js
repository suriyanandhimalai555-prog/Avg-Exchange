/**
 * marketData.js — Fetch mid-market prices for trading pairs.
 *
 * Fetches /api/markets once and caches the complete market response
 * for 60 seconds so multiple trading pairs do not generate repeated
 * backend/CoinGecko requests.
 */

const axios  = require('axios');
const config = require('../config');

const GECKO_IDS = {
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

const MAX_RETRIES = 3;
const BASE_DELAY  = 2_000;
const MAX_DELAY   = 30_000;

const MARKET_CACHE_TTL = 60_000;

let marketCache = null;
let marketCacheTime = 0;
let marketFetchInFlight = null;

const lastKnownPrices = {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchMarketData() {
  const now = Date.now();

  // Return fresh cached market data.
  if (
    marketCache &&
    now - marketCacheTime < MARKET_CACHE_TTL
  ) {
    return marketCache;
  }

  // If another request is already fetching market data,
  // wait for that request instead of creating another API call.
  if (marketFetchInFlight) {
    return marketFetchInFlight;
  }

  marketFetchInFlight = (async () => {
    let lastErr;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data } = await axios.get(
          `${config.API_URL}/api/markets`,
          {
            params: {
              vs_currency: 'usd',
              per_page: 50,
              page: 1,
            },
            timeout: 10_000,
          }
        );

        if (!Array.isArray(data)) {
          throw new Error('Invalid market data response');
        }

        marketCache = data;
        marketCacheTime = Date.now();

        console.log(
          `[market] Market data refreshed: ${data.length} coins`
        );

        return data;

      } catch (err) {
        lastErr = err;

        const status = err.response?.status;

        if (attempt === MAX_RETRIES) {
          break;
        }

        let delay;

        if (status === 429) {
          const retryAfter = parseInt(
            err.response?.headers?.['retry-after'] || '0',
            10
          );

          delay = retryAfter > 0
            ? retryAfter * 1000
            : Math.min(
                BASE_DELAY * 2 ** attempt,
                MAX_DELAY
              );

          console.warn(
            `[market] Rate-limited (429). Retrying in ${(delay / 1000).toFixed(1)}s… ` +
            `(attempt ${attempt + 1}/${MAX_RETRIES})`
          );

        } else {
          delay = Math.min(
            BASE_DELAY * 2 ** attempt +
            Math.random() * 500,
            MAX_DELAY
          );

          console.warn(
            `[market] Fetch error (${status ?? err.code}). ` +
            `Retrying in ${(delay / 1000).toFixed(1)}s… ` +
            `(attempt ${attempt + 1}/${MAX_RETRIES})`
          );
        }

        await sleep(delay);
      }
    }

    // If external API fails but we have previous market data,
    // continue using it.
    if (marketCache) {
      console.warn(
        '[market] API unavailable. Using cached market data.'
      );

      return marketCache;
    }

    throw new Error(
      `Failed to fetch market data after ${MAX_RETRIES} retries: ${lastErr?.message}`
    );
  })();

  try {
    return await marketFetchInFlight;
  } finally {
    marketFetchInFlight = null;
  }
}

const getMidPrice = async (pair = config.BOT_PAIR) => {
  const [base] = pair.split('/');

  const symbol = base.toUpperCase();
  const geckoId = GECKO_IDS[symbol];

  if (!geckoId) {
    throw new Error(
      `No CoinGecko ID mapped for ${base}. ` +
      `Add it to GECKO_IDS in marketData.js`
    );
  }

  try {
    const data = await fetchMarketData();

    const coin = data.find(
      (c) => c.id === geckoId
    );

    if (!coin) {
      throw new Error(
        `${base} not found in market data response`
      );
    }

    lastKnownPrices[pair] = coin.current_price;

    return lastKnownPrices[pair];

  } catch (err) {

    // Use pair-specific last known price if available.
    if (lastKnownPrices[pair] != null) {
      console.warn(
        `[market] Using last known price ` +
        `$${lastKnownPrices[pair].toLocaleString()} for ${pair}`
      );

      return lastKnownPrices[pair];
    }

    throw err;
  }
};

module.exports = {
  getMidPrice,
};
