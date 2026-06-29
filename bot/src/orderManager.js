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
   * On startup: fetch ALL open orders for this pair from the exchange and
   * cancel every one. Cleans up ghost orders left from previous bot sessions
   * that recoverFromDB() loaded into the engine.
   *
   * Uses the paginated /orders endpoint with status+pair+limit filters so we
   * always see every stale order — not just the 50 most recent across all
   * pairs (which is what the default UI-sized response gives).
   */
  async cancelAllOpen() {
    const res = await this.client.get('/api/trade/orders', {
      params: { status: 'open,partially_filled', pair: this.pair, limit: 1000 },
    }).catch(() => null);
    if (!res || res.status !== 200) return;

    const stale = res.data || [];
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
   * Fetch available balances for this pair's base and quote currencies.
   * Returns { base, quote } as floats, or null if the API call fails — in which
   * case placeGrid() falls back to its original blind behavior.
   */
  async getBalances() {
    const [base, quote] = this.pair.split('/');
    const res = await this.client.get('/api/user/balance').catch(() => null);
    if (!res || res.status !== 200 || !res.data) return null;
    return {
      base:  Number(res.data?.[base]?.available)  || 0,
      quote: Number(res.data?.[quote]?.available) || 0,
    };
  }

  /**
   * Place a grid of orders on both sides — inventory-aware.
   *
   * Before placing, fetches current balances and:
   *   1. Applies a light skew (±0.1% max) to mid-price so the side that needs
   *      to fill becomes more competitive. Too much quote → shift mid up (buys
   *      get more aggressive). Too much base → shift mid down (sells get more
   *      aggressive). Skew is zero when inventory is within ±10% of balanced.
   *   2. Skips any individual order whose cost exceeds the remaining budget for
   *      that side, instead of letting the backend reject it with a 400.
   *
   * @param {number} midPrice  current market price
   */
  async placeGrid(midPrice) {
    const { BOT_SPREAD_PCT, BOT_LEVELS, BOT_LEVEL_STEP_PCT, BOT_ORDER_VALUE_USD } = config;
    const [base, quote] = this.pair.split('/');

    const balances = await this.getBalances();

    // ── Inventory skew ─────────────────────────────────────────────────────
    // Imbalance ∈ [-0.5, +0.5]: +0.5 = all quote, -0.5 = all base.
    // Scale to ±0.1% mid shift, with a 10% dead-zone around balanced.
    let skewPct = 0;
    if (balances) {
      const quoteValue = balances.quote;
      const baseValue  = balances.base * midPrice;
      const total      = quoteValue + baseValue;
      if (total > 0) {
        const imbalance = (quoteValue / total) - 0.5;
        const DEADZONE  = 0.1;
        const MAX_SKEW  = 0.001; // 0.1%
        if (Math.abs(imbalance) > DEADZONE) {
          skewPct = imbalance * 2 * MAX_SKEW; // imbalance ∈ ±0.5 → skew ∈ ±MAX_SKEW
        }
      }
    }
    const skewedMid = midPrice * (1 + skewPct);
    if (skewPct !== 0) {
      console.log(`[${this.pair}] Inventory skew: ${(skewPct * 100).toFixed(3)}% (quote=${balances.quote.toFixed(2)} ${quote}, base=${balances.base.toFixed(6)} ${base})`);
    }

    // Derive coin quantity from target USD value so orders are always meaningful
    // regardless of the coin price (e.g. $10 = 91 DOGE at $0.11, or 0.0001 BTC at $95k)
    const orderSize = BOT_ORDER_VALUE_USD / midPrice;

    // Track cumulative reservations as we place — backend hasn't locked these
    // yet because requests are sequential and we want to avoid over-committing.
    let usedQuote = 0;
    let usedBase  = 0;
    let skippedBuys = 0;
    let skippedSells = 0;

    for (let i = 0; i < BOT_LEVELS; i++) {
      const offset = (BOT_SPREAD_PCT + i * BOT_LEVEL_STEP_PCT) / 100;

      const buyPrice  = skewedMid * (1 - offset);
      const sellPrice = skewedMid * (1 + offset);

      // BUY: needs (buyPrice * orderSize) quote currency
      const buyCost = buyPrice * orderSize;
      if (!balances || (balances.quote - usedQuote) >= buyCost) {
        await this.place('buy', buyPrice, orderSize);
        if (balances) usedQuote += buyCost;
      } else {
        skippedBuys++;
      }

      // SELL: needs orderSize of base currency
      if (!balances || (balances.base - usedBase) >= orderSize) {
        await this.place('sell', sellPrice, orderSize);
        if (balances) usedBase += orderSize;
      } else {
        skippedSells++;
      }
    }

    if (skippedBuys > 0) {
      console.log(`  [BUY] ${skippedBuys} level(s) skipped — low ${quote} (available: ${(balances.quote - usedQuote).toFixed(2)})`);
    }
    if (skippedSells > 0) {
      console.log(`  [SELL] ${skippedSells} level(s) skipped — low ${base} (available: ${(balances.base - usedBase).toFixed(6)})`);
    }
  }

  get orderCount() {
    return this.openOrderIds.size;
  }
}

module.exports = OrderManager;
