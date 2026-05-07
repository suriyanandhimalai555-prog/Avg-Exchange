require('dotenv').config();

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}. Copy .env.example → .env and fill it in.`);
  return val;
};

// Support multiple pairs: BOT_PAIRS=BTC/USDT,ETH/USDT
// Falls back to BOT_PAIR for backward compatibility
const rawPairs = process.env.BOT_PAIRS || process.env.BOT_PAIR || 'BTC/USDT';
const BOT_PAIRS = rawPairs.split(',').map(p => p.trim()).filter(Boolean);

module.exports = {
  API_URL:            process.env.API_URL          || 'http://localhost:4000',
  BOT_EMAIL:          required('BOT_EMAIL'),
  BOT_PASSWORD:       required('BOT_PASSWORD'),
  BOT_PAIRS,
  BOT_PAIR:           BOT_PAIRS[0],                // kept for anything that still reads it
  BOT_SPREAD_PCT:      parseFloat(process.env.BOT_SPREAD_PCT      || '0.3'),
  BOT_ORDER_VALUE_USD:        parseFloat(process.env.BOT_ORDER_VALUE_USD        || '10'),  // USD value per order — auto-scales to any coin price
  BOT_STATIC_ORDER_VALUE_USD: parseFloat(process.env.BOT_STATIC_ORDER_VALUE_USD || '200'), // USD value per static-coin order (separate so it can be tuned independently)
  BOT_LEVELS:          parseInt(process.env.BOT_LEVELS            || '3', 10),
  BOT_LEVEL_STEP_PCT:  parseFloat(process.env.BOT_LEVEL_STEP_PCT  || '0.1'),
  BOT_INTERVAL_MS:     parseInt(process.env.BOT_INTERVAL_MS       || '30000', 10),
};
