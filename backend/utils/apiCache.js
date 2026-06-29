/**
 * utils/apiCache.js — Reusable in-memory cache for external API proxies.
 *
 * Used by marketRoutes (CoinGecko) and cryptoRoutes (CoinMarketCap)
 * to share a single caching pattern instead of duplicating it.
 */

'use strict';

const DEFAULT_TTL_MS = 60_000; // 60 seconds

class ApiCache {
  /**
   * @param {number} [ttlMs] Time-to-live in milliseconds
   */
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this._ttlMs = ttlMs;
    this._store = new Map(); // key -> { data, fetchedAt }
  }

  /**
   * Returns cached data if fresh, or null.
   * @param {string} key
   * @returns {{ data: any, age: number } | null}
   */
  get(key) {
    const hit = this._store.get(key);
    if (!hit) return null;

    const age = Date.now() - hit.fetchedAt;
    if (age < this._ttlMs) {
      return { data: hit.data, age, stale: false };
    }
    return { data: hit.data, age, stale: true };
  }

  /**
   * Store data in cache.
   * @param {string} key
   * @param {any} data
   */
  set(key, data) {
    this._store.set(key, { data, fetchedAt: Date.now() });
  }

  /**
   * Wraps an async fetch function with cache-aside logic.
   * Returns { data, cacheStatus: 'HIT' | 'MISS' | 'STALE age=Xs' }.
   *
   * @param {string} key
   * @param {() => Promise<any>} fetchFn
   * @returns {Promise<{ data: any, cacheStatus: string }>}
   */
  async wrap(key, fetchFn) {
    const cached = this.get(key);

    if (cached && !cached.stale) {
      return { data: cached.data, cacheStatus: 'HIT' };
    }

    try {
      const data = await fetchFn();
      this.set(key, data);
      return { data, cacheStatus: 'MISS' };
    } catch (err) {
      // Return stale cache rather than an error
      if (cached) {
        const ageS = Math.round(cached.age / 1000);
        return { data: cached.data, cacheStatus: `STALE age=${ageS}s` };
      }
      throw err;
    }
  }
}

module.exports = ApiCache;
