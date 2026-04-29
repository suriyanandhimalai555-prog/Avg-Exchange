/**
 * orderManager.js — Place and cancel orders on the exchange
 */

const config = require('../config');

class OrderManager {
  constructor(client, pair) {
    this.client = client;
    this.pair   = pair;
    this.openOrderIds = new Set();
  }

  /**
   * On startup: fetch ALL open orders from the exchange for this account
   * and cancel every one. Cleans up ghost orders left from previous bot
   * sessions that recoverFromDB() loaded into the engine.
   */
  async cancelAllOpen() {
    const res = await this.client.get('/api/trade/orders').catch(() => null);
    if (!res || res.status !== 200) return;

    // Only cancel stale orders for THIS pair
    const stale = (res.data || []).filter(
      o => (o.status === 'open' || o.status === 'partially_filled') && o.pair === this.pair
    );
    if (stale.length === 0) return;

    console.log(`[orders:${this.pair}] Clearing ${stale.length} stale order(s) from previous session…`);
    await Promise.allSettled(
      stale.map(o => this.client.delete(`/api/trade/order/${o.id}`).catch(() => {}))
    );
    console.log(`[orders:${this.pair}] Stale orders cleared`);
  }

  /**
   * Cancel all orders the bot currently has open.
   */
  async cancelAll() {
    const ids = [...this.openOrderIds];
    this.openOrderIds.clear(); // clear immediately so concurrent calls skip
    if (ids.length === 0) return;

    console.log(`[orders] Cancelling ${ids.length} open order(s)…`);
    await Promise.allSettled(
      ids.map(id =>
        this.client.delete(`/api/trade/order/${id}`)
          .then(res => {
            if (res.status === 200) {
              this.openOrderIds.delete(id);
            } else {
              console.warn(`[orders] Cancel ${id} returned ${res.status}:`, res.data);
              // Remove from tracking anyway — may already be filled
              this.openOrderIds.delete(id);
            }
          })
      )
    );
  }

  /**
   * Place a single limit order and track its ID.
   * @param {'buy'|'sell'} side
   * @param {number} price
   * @param {number} quantity
   */
  /**
   * Returns the number of decimal places needed so the spread
   * is at least 1 unit at that precision.
   * e.g. price=$1.38, spread=0.001 → raw diff=$0.00138 → need 4 dp
   *      price=$0.099              → raw diff=$0.000099 → need 6 dp
   */
  _pricePrecision(price) {
    if (price >= 1000) return 2;
    if (price >= 10)   return 2;
    if (price >= 1)    return 4;
    if (price >= 0.1)  return 5;
    return 6;
  }

  async place(side, price, quantity) {
    const dp = this._pricePrecision(price);
    const roundedPrice = parseFloat(price.toFixed(dp));

    const res = await this.client.post('/api/trade/order', {
      pair:     this.pair,
      side,
      type:     'limit',
      price:    roundedPrice,
      quantity: parseFloat(quantity.toFixed(8)),
    });

    if (res.status === 201) {
      const id          = res.data?.order?.id;
      const orderStatus = res.data?.order?.status;
      const fills       = res.data?.executedTrades?.length ?? 0;

      // Only track orders that are still resting — filled orders need no cancel
      if (id && orderStatus !== 'filled' && orderStatus !== 'cancelled') {
        this.openOrderIds.add(id);
      }

      const label = fills > 0 ? `filled ${fills} trade(s)` : 'resting';
      console.log(`  [${side.toUpperCase()}] $${roundedPrice.toFixed(dp)} × ${quantity.toFixed(6)} — ${label}`);
    } else {
      console.warn(`  [${side.toUpperCase()}] Order rejected (${res.status}):`, res.data?.error ?? res.data);
    }
  }

  /**
   * Place a grid of orders on both sides.
   * @param {number} midPrice  current market price
   */
  async placeGrid(midPrice) {
    const { BOT_SPREAD_PCT, BOT_LEVELS, BOT_LEVEL_STEP_PCT, BOT_ORDER_SIZE } = config;

    for (let i = 0; i < BOT_LEVELS; i++) {
      // Each level is spread + (i * step) % away from mid
      const offset = (BOT_SPREAD_PCT + i * BOT_LEVEL_STEP_PCT) / 100;

      const buyPrice  = midPrice * (1 - offset);
      const sellPrice = midPrice * (1 + offset);

      await this.place('buy',  buyPrice,  BOT_ORDER_SIZE);
      await this.place('sell', sellPrice, BOT_ORDER_SIZE);
    }
  }

  get orderCount() {
    return this.openOrderIds.size;
  }
}

module.exports = OrderManager;
