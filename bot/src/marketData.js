/**
 * marketData.js — Fetch mid-market price for a pair
 *
 * Resilience features:
 *  - Exponential backoff with jitter on any HTTP error
 *  - Respects Retry-After header from 429 responses
 *  - Falls back to the last known price rather than crashing the cycle
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

const MAX_RETRIES  = 3;
const BASE_DELAY   = 2_000;  // 2 s base
const MAX_DELAY    = 30_000; // 30 s ceiling

const lastKnownPrices = {}; // keyed by pair

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getMidPrice = async (pair = config.BOT_PAIR) => {
  const [base] = pair.split('/');
  const geckoId = GECKO_IDS[base.toUpperCase()];
  if (!geckoId) throw new Error(`No CoinGecko ID mapped for ${base}. Add it to GECKO_IDS in marketData.js`);

  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(`${config.API_URL}/api/markets`, {
        params:  { vs_currency: 'usd', per_page: 50, page: 1 },
        timeout: 10_000,
      });

      const coin = data.find((c) => c.id === geckoId);
      if (!coin) throw new Error(`${base} not found in market data response`);

      lastKnownPrices[pair] = coin.current_price;
      return lastKnownPrices[pair];

    } catch (err) {
      lastErr = err;
      const status = err.response?.status;

      if (attempt === MAX_RETRIES) break;

      // Honour Retry-After for 429 responses; otherwise use exponential backoff
      let delay;
      if (status === 429) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '0', 10);
        delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(BASE_DELAY * 2 ** attempt, MAX_DELAY);
        console.warn(`[market] Rate-limited (429). Retrying in ${(delay / 1000).toFixed(1)}s… (attempt ${attempt + 1}/${MAX_RETRIES})`);
      } else {
        delay = Math.min(BASE_DELAY * 2 ** attempt + Math.random() * 500, MAX_DELAY);
        console.warn(`[market] Fetch error (${status ?? err.code}). Retrying in ${(delay / 1000).toFixed(1)}s… (attempt ${attempt + 1}/${MAX_RETRIES})`);
      }

      await sleep(delay);
    }
  }

  // All retries exhausted — fall back to last known price for this pair
  if (lastKnownPrices[pair] != null) {
    console.warn(`[market] API unavailable after ${MAX_RETRIES} retries. Using last known price $${lastKnownPrices[pair].toLocaleString()} for ${pair}`);
    return lastKnownPrices[pair];
  }

  throw new Error(`Failed to fetch price for ${base} after ${MAX_RETRIES} retries: ${lastErr?.message}`);
};

module.exports = { getMidPrice };
