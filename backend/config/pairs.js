/**
 * config/pairs.js — Single source of truth for trading pairs and symbols.
 *
 * Both tradeRoutes (SUPPORTED_PAIRS) and binanceStreamService (SYMBOLS)
 * derive their lists from here. Add a new coin in one place.
 */

'use strict';

// Base symbols supported on the exchange (all paired against USDT)
const SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP',
  'ADA', 'DOGE', 'AVAX', 'MATIC', 'LTC',
  'DOT', 'LINK', 'UNI', 'ATOM', 'TRX',
];

const QUOTE_CURRENCY = 'USDT';

// Pre-computed Set for O(1) lookups in trade validation
const SUPPORTED_PAIRS = new Set(
  SYMBOLS.map(s => `${s}/${QUOTE_CURRENCY}`)
);

// Binance stream symbols (lowercase, no separator): 'btcusdt'
const BINANCE_STREAM_SYMBOLS = SYMBOLS.map(
  s => `${s.toLowerCase()}${QUOTE_CURRENCY.toLowerCase()}`
);

// Supported deposit networks per currency
const DEPOSIT_NETWORKS = {
  USDT: ['TRX', 'ETH', 'BSC'],
  BTC:  ['BTC'],
  ETH:  ['ETH'],
  BNB:  ['BSC'],
  SOL:  ['SOL'],
  TRX:  ['TRX'],
  LTC:  ['LTC'],
};

// Supported currencies for payment/deposit
const SUPPORTED_CURRENCIES = new Set(Object.keys(DEPOSIT_NETWORKS));

module.exports = {
  SYMBOLS,
  QUOTE_CURRENCY,
  SUPPORTED_PAIRS,
  BINANCE_STREAM_SYMBOLS,
  DEPOSIT_NETWORKS,
  SUPPORTED_CURRENCIES,
};
