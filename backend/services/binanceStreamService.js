/**
 * binanceStreamService.js — Binance WebSocket market data (Singleton)
 *
 * Opens ONE combined stream connection carrying 4 stream types for every
 * supported trading pair:
 *
 *   {sym}@ticker          → live price, 24 h stats
 *   {sym}@depth10@100ms   → top-10 order book snapshot (100 ms cadence)
 *   {sym}@trade           → every individual trade as it happens
 *   {sym}@kline_1m        → 1-minute OHLCV candles
 *
 * Events emitted to all socket.io clients:
 *   binance:ticker  { symbol, price, open24h, high24h, low24h, volume24h, change24h, ts }
 *   binance:depth   { symbol, bids: [price,qty][], asks: [price,qty][] }
 *   binance:trade   { symbol, price, qty, isBuyerMaker, time }
 *   binance:kline   { symbol, interval, time, open, high, low, close, volume, closed }
 *
 * In-memory ticker cache is available via getTicker(symbol) / getAllTickers()
 * for REST endpoints that need the latest price without waiting for a socket event.
 */

'use strict';

const WebSocket = require('ws');

const BINANCE_WS   = 'wss://stream.binance.com:9443/stream';
const KLINE_INTV   = '1m';
const RECONNECT_INIT = 2_000;   // ms
const RECONNECT_MAX  = 30_000;  // ms

// All /USDT pairs the exchange supports — add more here as you list new coins.
const SYMBOLS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP',
  'ADA', 'DOGE', 'AVAX', 'MATIC', 'DOT',
  'LINK', 'UNI', 'ATOM', 'LTC', 'TON',
];

class BinanceStreamService {
  constructor() {
    this._io             = null;
    this._ws             = null;
    this._destroyed      = false;
    this._reconnectDelay = RECONNECT_INIT;
    /** @type {Record<string, object>} */
    this._tickers        = {};
  }

  static getInstance() {
    if (!BinanceStreamService._instance) {
      BinanceStreamService._instance = new BinanceStreamService();
    }
    return BinanceStreamService._instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Must be called once at server startup, after socket.io is ready.
   * @param {import('socket.io').Server} io
   */
  init(io) {
    this._io = io;
    this._connect();
  }

  /** Returns the latest cached ticker for a symbol, or null. */
  getTicker(symbol) {
    return this._tickers[symbol] ?? null;
  }

  /** Returns all cached tickers — used by GET /api/markets/live */
  getAllTickers() {
    return this._tickers;
  }

  /** Graceful shutdown — stops reconnect loop and closes the socket. */
  destroy() {
    this._destroyed = true;
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.terminate();
      this._ws = null;
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _buildStreamList() {
    const streams = [];
    for (const sym of SYMBOLS) {
      const s = sym.toLowerCase() + 'usdt';
      streams.push(`${s}@ticker`);
      streams.push(`${s}@depth10@100ms`);
      streams.push(`${s}@trade`);
      streams.push(`${s}@kline_${KLINE_INTV}`);
    }
    return streams;
  }

  _connect() {
    if (this._destroyed) return;

    const streams = this._buildStreamList();
    const url     = `${BINANCE_WS}?streams=${streams.join('/')}`;

    console.log(`[binance] connecting — ${streams.length} streams / ${SYMBOLS.length} pairs`);

    const ws = new WebSocket(url);
    this._ws = ws;

    ws.on('open', () => {
      console.log('[binance] ✅ stream connected');
      this._reconnectDelay = RECONNECT_INIT; // reset backoff on success
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.stream && msg.data) this._dispatch(msg.stream, msg.data);
      } catch (_) { /* ignore malformed frames */ }
    });

    ws.on('close', (code) => {
      if (!this._destroyed) {
        console.warn(`[binance] closed (${code}) — reconnecting in ${this._reconnectDelay / 1000}s`);
        this._scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      // 'close' always fires after 'error'; we handle reconnect there
      console.error('[binance] error:', err.message);
    });
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    setTimeout(() => this._connect(), this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX);
  }

  _dispatch(stream, data) {
    const at = stream.indexOf('@');
    if (at === -1) return;

    const pairRaw    = stream.slice(0, at);        // e.g. 'btcusdt'
    const streamType = stream.slice(at + 1);        // e.g. 'ticker' | 'depth10@100ms'

    if (!pairRaw.endsWith('usdt')) return;
    const symbol = pairRaw.slice(0, -4).toUpperCase(); // 'BTC'

    if (streamType === 'ticker')                this._onTicker(symbol, data);
    else if (streamType.startsWith('depth'))    this._onDepth(symbol, data);
    else if (streamType === 'trade')            this._onTrade(symbol, data);
    else if (streamType.startsWith('kline'))    this._onKline(symbol, data);
  }

  _onTicker(symbol, d) {
    const ticker = {
      symbol,
      price:     parseFloat(d.c),  // last price
      open24h:   parseFloat(d.o),
      high24h:   parseFloat(d.h),
      low24h:    parseFloat(d.l),
      volume24h: parseFloat(d.v),  // base-asset volume
      change24h: parseFloat(d.P),  // % change
      ts:        d.E,              // event time ms
    };
    this._tickers[symbol] = ticker;
    this._io?.emit('binance:ticker', ticker);
  }

  _onDepth(symbol, d) {
    this._io?.emit('binance:depth', {
      symbol,
      bids: (d.bids || []).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
      asks: (d.asks || []).map(([p, q]) => [parseFloat(p), parseFloat(q)]),
    });
  }

  _onTrade(symbol, d) {
    this._io?.emit('binance:trade', {
      symbol,
      price:        parseFloat(d.p),
      qty:          parseFloat(d.q),
      isBuyerMaker: d.m,  // true = sell aggressor (red), false = buy aggressor (green)
      time:         d.T,
    });
  }

  _onKline(symbol, d) {
    const k = d.k;
    this._io?.emit('binance:kline', {
      symbol,
      interval: k.i,
      time:     k.t,  // candle open time ms
      open:     parseFloat(k.o),
      high:     parseFloat(k.h),
      low:      parseFloat(k.l),
      close:    parseFloat(k.c),
      volume:   parseFloat(k.v),
      closed:   k.x,  // true when the candle period is finalized
    });
  }
}

BinanceStreamService._instance = null;
module.exports = BinanceStreamService.getInstance();
