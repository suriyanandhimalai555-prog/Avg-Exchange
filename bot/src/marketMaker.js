/**
 * marketMaker.js — Core market making loop
 *
 * Strategy:
 *   Every BOT_INTERVAL_MS milliseconds:
 *     1. Cancel all existing bot orders
 *     2. Fetch the current mid-market price
 *     3. Place BOT_LEVELS buy orders below mid (each BOT_LEVEL_STEP_PCT further)
 *     4. Place BOT_LEVELS sell orders above mid
 *
 * The bot earns the spread when a buy and sell are both filled.
 */

const { getMidPrice } = require('./marketData');
const OrderManager = require('./orderManager');
const config = require('../config');

class MarketMaker {
  constructor(client, pair) {
    this.pair    = pair;
    this.orders  = new OrderManager(client, pair);
    this.running = false;
    this.timer   = null;
    this.cycles  = 0;
  }

  async tick() {
    this.cycles++;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[${this.pair}] Cycle #${this.cycles} — ${new Date().toISOString()}`);
    console.log(`[${this.pair}] Spread: ±${config.BOT_SPREAD_PCT}% | Levels: ${config.BOT_LEVELS}`);

    try {
      // 1. Cancel stale orders
      await this.orders.cancelAll();

      // 2. Get current price
      const mid = await getMidPrice(this.pair);
      console.log(`[${this.pair}] Mid-market price: $${mid.toLocaleString()}`);

      // 3. Quote new grid
      console.log(`[${this.pair}] Placing ${config.BOT_LEVELS * 2} new orders…`);
      await this.orders.placeGrid(mid);

      console.log(`[${this.pair}] ${this.orders.orderCount} resting orders`);
    } catch (err) {
      console.error(`[${this.pair}] Cycle error:`, err.message);
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log(`\n[${this.pair}] Market maker started`);
    console.log(`[${this.pair}] Refreshing every ${config.BOT_INTERVAL_MS / 1000}s`);

    // Clear any ghost orders left over from a previous session
    await this.orders.cancelAllOpen();

    // Run immediately, then on interval
    this.tick();
    this.timer = setInterval(() => this.tick(), config.BOT_INTERVAL_MS);
  }

  stop() {
    if (!this.running) return Promise.resolve();
    if (this.timer) clearInterval(this.timer);
    this.running = false;
    console.log(`\n[${this.pair}] Stopping — cancelling all open orders…`);
    // cancelAllOpen() fetches open orders from the exchange API rather than
    // relying on the in-memory openOrderIds set, so it correctly handles the
    // case where the bot was previously killed and the in-memory set is empty.
    return this.orders.cancelAllOpen();
  }
}

module.exports = MarketMaker;
