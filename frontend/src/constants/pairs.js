/**
 * constants/pairs.js — Trading pair configuration for the frontend.
 *
 * ⚠️ SINGLE SOURCE OF TRUTH IS THE BACKEND: backend/config/pairs.js.
 * The list below MUST mirror it. Prefer fetching `GET /api/markets/pairs`
 * (use fetchSupportedPairs) at runtime; the static list is only a fallback so
 * the UI renders before that request resolves. Keep both in sync when adding a
 * coin, or the UI will offer a pair the backend rejects (or omit a valid one).
 */

import { marketApi } from '../api';

export const SUPPORTED_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT', 'LTC/USDT',
  'DOT/USDT', 'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'TRX/USDT',
];

export const QUOTE_CURRENCY = 'USDT';

/**
 * Fetch the canonical pair list from the backend (config/pairs.js).
 * Falls back to the static SUPPORTED_PAIRS above if the request fails.
 * @returns {Promise<string[]>}
 */
export const fetchSupportedPairs = async () => {
  try {
    const { data } = await marketApi.getPairs();
    return Array.isArray(data?.pairs) && data.pairs.length ? data.pairs : SUPPORTED_PAIRS;
  } catch {
    return SUPPORTED_PAIRS;
  }
};

/**
 * Extract the base symbol from a pair string.
 * 'BTC/USDT' -> 'BTC'
 */
export const getBaseSymbol = (pair) => pair?.split('/')[0] || '';

/**
 * Build a Binance-style stream symbol from a pair.
 * 'BTC/USDT' -> 'btcusdt'
 */
export const toBinanceSymbol = (pair) =>
  pair?.replace('/', '').toLowerCase() || '';
