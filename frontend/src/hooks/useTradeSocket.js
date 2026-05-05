/**
 * useTradeSocket — real-time WebSocket feed for a trading pair.
 *
 * Internal exchange events (from our own matching engine):
 *   depth_update   { pair, asks, bids }   — full book snapshot after every change
 *   balance_update { userId }             — your balance changed, re-fetch it
 *
 * Binance market-data events (broadcast to every client):
 *   binance:ticker  { symbol, price, change24h, high24h, low24h, volume24h, ts }
 *   binance:depth   { symbol, bids, asks }  — top-10 Binance reference book
 *   binance:trade   { symbol, price, qty, isBuyerMaker, time }
 *   binance:kline   { symbol, interval, time, open, high, low, close, volume, closed }
 *
 * Binance events are unfiltered on the server — every client receives all
 * symbols. Filter by `symbol` in your callback (the hook does it for you for
 * depth / trade / kline since those are pair-specific).
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import API_URL from '../config/api';

/**
 * @param {object}   options
 * @param {string}   options.pair              e.g. 'BTC/USDT'
 * @param {number}   options.userId            logged-in user ID
 * @param {function} options.onDepthUpdate     ({ asks, bids }) — internal book changed
 * @param {function} options.onBalanceUpdate   () — re-fetch your balances
 * @param {function} options.onReconnect       () — re-fetch book after reconnect
 *
 * @param {function} options.onBinanceTicker   (data) — fires for EVERY symbol
 * @param {function} options.onBinanceDepth    (data) — filtered to current pair's symbol
 * @param {function} options.onBinanceTrade    (data) — filtered to current pair's symbol
 * @param {function} options.onBinanceKline    (data) — filtered to current pair's symbol
 */
const useTradeSocket = ({
  pair,
  userId,
  onDepthUpdate,
  onBalanceUpdate,
  onReconnect,
  onBinanceTicker,
  onBinanceDepth,
  onBinanceTrade,
  onBinanceKline,
} = {}) => {
  const socketRef  = useRef(null);
  const isFirstRef = useRef(true);
  const [connected, setConnected] = useState(false);

  // Derive the base symbol from the pair string, e.g. 'BTC/USDT' → 'BTC'
  const symbol = pair ? pair.split('/')[0] : null;

  useEffect(() => {
    isFirstRef.current = true;
    const socket = io(API_URL, { withCredentials: true });
    socketRef.current = socket;

    // ── Connection lifecycle ───────────────────────────────────
    socket.on('connect', () => {
      setConnected(true);
      if (userId) socket.emit('subscribe', { userId });
      if (!isFirstRef.current && typeof onReconnect === 'function') {
        onReconnect();
      }
      isFirstRef.current = false;
    });

    socket.on('disconnect', () => setConnected(false));

    // ── Internal exchange events ───────────────────────────────
    socket.on('depth_update', (data) => {
      if (data.pair === pair && typeof onDepthUpdate === 'function') {
        onDepthUpdate({ asks: data.asks, bids: data.bids });
      }
    });

    socket.on('balance_update', () => {
      if (typeof onBalanceUpdate === 'function') onBalanceUpdate();
    });

    // ── Binance market-data events ─────────────────────────────
    // Ticker fires for every tracked symbol — consumers decide which to use.
    socket.on('binance:ticker', (data) => {
      if (typeof onBinanceTicker === 'function') onBinanceTicker(data);
    });

    // Depth, trade and kline are filtered to the active trading pair.
    socket.on('binance:depth', (data) => {
      if (data.symbol === symbol && typeof onBinanceDepth === 'function') {
        onBinanceDepth(data);
      }
    });

    socket.on('binance:trade', (data) => {
      if (data.symbol === symbol && typeof onBinanceTrade === 'function') {
        onBinanceTrade(data);
      }
    });

    socket.on('binance:kline', (data) => {
      if (data.symbol === symbol && typeof onBinanceKline === 'function') {
        onBinanceKline(data);
      }
    });

    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pair]);

  return { connected };
};

export default useTradeSocket;
