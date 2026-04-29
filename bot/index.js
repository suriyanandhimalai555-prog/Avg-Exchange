/**
 * AVG Exchange — Market Maker Bot
 *
 * Runs one MarketMaker instance per pair defined in BOT_PAIRS.
 * Each instance independently quotes bids/asks for its pair.
 *
 * Setup:
 *   1. cp .env.example .env  and fill in credentials
 *   2. npm install
 *   3. node setup.js   (one-time: creates bot account + funds)
 *   4. npm start
 */

require('dotenv').config();
const { login, getClient } = require('./src/auth');
const MarketMaker = require('./src/marketMaker');
const config = require('./config');

async function main() {
  console.log('═'.repeat(50));
  console.log('  AVG Exchange — Market Maker Bot');
  console.log(`  Pairs    : ${config.BOT_PAIRS.join(', ')}`);
  console.log(`  Spread   : ±${config.BOT_SPREAD_PCT}% per side`);
  console.log(`  Levels   : ${config.BOT_LEVELS} per side`);
  console.log(`  Size     : ${config.BOT_ORDER_SIZE} per order`);
  console.log(`  Interval : ${config.BOT_INTERVAL_MS / 1000}s`);
  console.log('═'.repeat(50));

  await login();
  const client = await getClient();

  // Start one MarketMaker per configured pair, staggered 2s apart to avoid
  // simultaneous API bursts and keep logs readable
  const bots = config.BOT_PAIRS.map(pair => new MarketMaker(client, pair));
  for (const bot of bots) {
    await bot.start();
    await new Promise(r => setTimeout(r, 2000));
  }

  const shutdown = async (signal) => {
    console.log(`\n[bot] Received ${signal} — shutting down all pairs…`);
    await Promise.allSettled(bots.map(b => b.stop()));
    console.log('[bot] Shut down cleanly');
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  console.error('[bot] Fatal error:', err.message);
  process.exit(1);
});
