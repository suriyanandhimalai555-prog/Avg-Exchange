/**
 * binanceStreamService.js — Binance WebSocket market data (Singleton)
 *
 * Opens ONE combined stream connection carrying 4 stream types for every
 * supported trading pair:
 *   {sym}@ticker, {sym}@depth10@100ms, {sym}@trade, {sym}@kline_1m
 *
 * Events emitted to all socket.io clients:
 *   binance:ticker, binance:depth, binance:trade, binance:kline
 */

'use strict';

const WebSocket = require('ws');
const { SYMBOLS } = require('../config/pairs');

const BINANCE_WS     = 'wss://stream.binance.com:9443/stream';
const KLINE_INTERVAL = '1m';
const RECONNECT_INIT = 2_000;
const RECONNECT_MAX  = 30_000;

class BinanceStreamService {
  constructor() {
    this._io             = null;
    this._ws             = null;
    this._destroyed      = false;
    this._reconnectDelay = RECONNECT_INIT;
    this._tickers        = {};
  }

  static getInstance() {
    if (!BinanceStreamService._instance) {
      BinanceStreamService._instance = new BinanceStreamService();
    }
    return BinanceStreamService._instance;
  }

  // ── Public API ────────────────────────────────────────────────

  init(io) {
    this._io = io;
    this._connect();
  }

  getTicker(symbol) {
    return this._tickers[symbol] ?? null;
  }

  getAllTickers() {
    return this._tickers;
  }

  destroy() {
    this._destroyed = true;
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.terminate();
      this._ws = null;
    }
  }

  // ── Internal ──────────────────────────────────────────────────

  _buildStreamList() {
    const streams = [];
    for (const sym of SYMBOLS) {
      const s = sym.toLowerCase() + 'usdt';
      streams.push(`${s}@ticker`);
      streams.push(`${s}@depth10@100ms`);
      streams.push(`${s}@trade`);
      streams.push(`${s}@kline_${KLINE_INTERVAL}`);
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
      console.log('[binance] stream connected');
      this._reconnectDelay = RECONNECT_INIT;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.stream && msg.data) this._dispatch(msg.stream, msg.data);
      } catch (_) {}
    });

    ws.on('close', (code) => {
      if (!this._destroyed) {
        console.warn(`[binance] closed (${code}) — reconnecting in ${this._reconnectDelay / 1000}s`);
        this._scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
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

    const pairRaw    = stream.slice(0, at);
    const streamType = stream.slice(at + 1);

    if (!pairRaw.endsWith('usdt')) return;
    const symbol = pairRaw.slice(0, -4).toUpperCase();

    if (streamType === 'ticker')             this._onTicker(symbol, data);
    else if (streamType.startsWith('depth')) this._onDepth(symbol, data);
    else if (streamType === 'trade')         this._onTrade(symbol, data);
    else if (streamType.startsWith('kline')) this._onKline(symbol, data);
  }

  _onTicker(symbol, d) {
    const ticker = {
      symbol,
      price:     parseFloat(d.c),
      open24h:   parseFloat(d.o),
      high24h:   parseFloat(d.h),
      low24h:    parseFloat(d.l),
      volume24h: parseFloat(d.v),
      change24h: parseFloat(d.P),
      ts:        d.E,
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
      isBuyerMaker: d.m,
      time:         d.T,
    });
  }

  _onKline(symbol, d) {
    const k = d.k;
    this._io?.emit('binance:kline', {
      symbol,
      interval: k.i,
      time:     k.t,
      open:     parseFloat(k.o),
      high:     parseFloat(k.h),
      low:      parseFloat(k.l),
      close:    parseFloat(k.c),
      volume:   parseFloat(k.v),
      closed:   k.x,
    });
  }
}

BinanceStreamService._instance = null;
module.exports = BinanceStreamService.getInstance();
