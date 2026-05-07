/**
 * staticCoinMaker.js — Market maker for the admin-configured static coin
 *
 * Unlike the regular MarketMaker (which tracks Binance prices), this one
 * places orders within the admin-set [min_price, max_price] range using
 * current_price as the mid. The price never drifts outside the range.
 *
 * Grid layout:
 *   Sell side: current_price → max_price  (BOT_LEVELS orders)
 *   Buy  side: current_price → min_price  (BOT_LEVELS orders)
 */

const OrderManager = require('./orderManager');
const config       = require('../config');

class StaticCoinMaker {
  constructor(client) {
    this.client  = client;
    this.orders  = null;   // created once we know the pair
    this.running = false;
    this.timer   = null;
    this.cycles  = 0;
    this.pair    = null;
  }

  /** Fetch static coin config from the admin API. Returns null if not configured. */
  async _fetchConfig() {
    const res = await this.client.get('/api/admin/static-coin').catch(() => null);
    if (!res || res.status !== 200 || !res.data) return null;
    return res.data;
  }

  async tick() {
    this.cycles++;

    const cfg = await this._fetchConfig();
    if (!cfg || !cfg.enabled) {
      console.log('[staticCoin] Not configured or disabled — skipping cycle');
      return;
    }

    const pair        = `${cfg.symbol}/USDT`;
    const minPrice    = parseFloat(cfg.min_price);
    const maxPrice    = parseFloat(cfg.max_price);
    const midPrice    = parseFloat(cfg.current_price);
    const levels      = config.BOT_LEVELS;
    const orderValue  = config.BOT_STATIC_ORDER_VALUE_USD;

    // Initialise OrderManager for this pair on first run
    if (!this.orders || this.pair !== pair) {
      if (this.orders) await this.orders.cancelAllOpen();
      this.pair   = pair;
      this.orders = new OrderManager(this.client, pair);
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[staticCoin] Cycle #${this.cycles} — ${new Date().toISOString()}`);
    console.log(`[staticCoin] ${pair} | range $${minPrice} – $${maxPrice} | mid $${midPrice}`);

    // 1. Cancel all current orders
    await this.orders.cancelAll();

    // 2. Place buy grid: current_price → min_price
    const buyStep  = (midPrice - minPrice) / levels;
    // 3. Place sell grid: current_price → max_price
    const sellStep = (maxPrice - midPrice) / levels;

    console.log(`[staticCoin] Placing ${levels * 2} orders…`);

    for (let i = 0; i < levels; i++) {
      const buyPrice  = midPrice - (i + 1) * buyStep;
      const sellPrice = midPrice + (i + 1) * sellStep;

      // Randomise ±40% so every row in the order book has a different total
      const buyQty  = (orderValue / buyPrice)  * (0.6 + Math.random() * 0.8);
      const sellQty = (orderValue / sellPrice) * (0.6 + Math.random() * 0.8);

      if (buyPrice  > minPrice)  await this.orders.place('buy',  buyPrice,  buyQty);
      if (sellPrice < maxPrice)  await this.orders.place('sell', sellPrice, sellQty);
    }

    console.log(`[staticCoin] ${this.orders.orderCount} resting orders`);
  }

  async start() {
    if (this.running) return;

    const cfg = await this._fetchConfig();
    if (!cfg || !cfg.enabled) {
      console.log('[staticCoin] No enabled static coin config found — maker not started');
      return;
    }

    this.running = true;
    this.pair    = `${cfg.symbol}/USDT`;
    this.orders  = new OrderManager(this.client, this.pair);

    console.log(`\n[staticCoin] Static coin maker started — ${this.pair}`);
    console.log(`[staticCoin] Range: $${cfg.min_price} – $${cfg.max_price}`);
    console.log(`[staticCoin] Refreshing every ${config.BOT_INTERVAL_MS / 1000}s`);

    await this.orders.cancelAllOpen();

    this.tick();
    this.timer = setInterval(() => this.tick(), config.BOT_INTERVAL_MS);
  }

  stop() {
    if (!this.running) return Promise.resolve();
    if (this.timer) clearInterval(this.timer);
    this.running = false;
    console.log('\n[staticCoin] Stopping — cancelling orders…');
    return this.orders ? this.orders.cancelAllOpen() : Promise.resolve();
  }
}

module.exports = StaticCoinMaker;
