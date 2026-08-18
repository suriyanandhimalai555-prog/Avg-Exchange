/**
 * useTradeSocket — real-time WebSocket feed for a trading pair.
 *
 * Internal exchange events (from our own matching engine):
 *   depth_update, balance_update
 *
 * Binance market-data events (broadcast to every client):
 *   binance:ticker, binance:depth, binance:trade, binance:kline
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/client';
import { getBaseSymbol } from '../constants/pairs';
import * as EVENTS from '../constants/socket';

/**
 * @param {object}   options
 * @param {string}   options.pair              e.g. 'BTC/USDT'
 * @param {number}   options.userId            logged-in user ID
 * @param {function} options.onDepthUpdate     ({ asks, bids })
 * @param {function} options.onBalanceUpdate   ()
 * @param {function} options.onReconnect       ()
 * @param {function} options.onBinanceTicker   (data) — every symbol
 * @param {function} options.onBinanceDepth    (data) — filtered to pair
 * @param {function} options.onBinanceTrade    (data) — filtered to pair
 * @param {function} options.onBinanceKline    (data) — filtered to pair
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

  const symbol = pair ? getBaseSymbol(pair) : null;

  // Keep the latest callbacks in a ref so the socket handlers (registered once
  // per [userId, pair]) always invoke the current props instead of the stale
  // closures captured when the effect first ran.
  const handlersRef = useRef({});
  handlersRef.current = {
    onDepthUpdate, onBalanceUpdate, onReconnect,
    onBinanceTicker, onBinanceDepth, onBinanceTrade, onBinanceKline,
  };

  useEffect(() => {
    isFirstRef.current = true;
    const socket = io(API_URL, {
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      if (userId) socket.emit(EVENTS.SUBSCRIBE, { userId });
      const { onReconnect } = handlersRef.current;
      if (!isFirstRef.current && typeof onReconnect === 'function') {
        onReconnect();
      }
      isFirstRef.current = false;
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on(EVENTS.DEPTH_UPDATE, (data) => {
      const { onDepthUpdate } = handlersRef.current;
      if (data.pair === pair && typeof onDepthUpdate === 'function') {
        onDepthUpdate({ asks: data.asks, bids: data.bids });
      }
    });

    socket.on(EVENTS.BALANCE_UPDATE, () => {
      const { onBalanceUpdate } = handlersRef.current;
      if (typeof onBalanceUpdate === 'function') onBalanceUpdate();
    });

    socket.on(EVENTS.BINANCE_TICKER, (data) => {
      const { onBinanceTicker } = handlersRef.current;
      if (typeof onBinanceTicker === 'function') onBinanceTicker(data);
    });

    socket.on(EVENTS.BINANCE_DEPTH, (data) => {
      const { onBinanceDepth } = handlersRef.current;
      if (data.symbol === symbol && typeof onBinanceDepth === 'function') {
        onBinanceDepth(data);
      }
    });

    socket.on(EVENTS.BINANCE_TRADE, (data) => {
      const { onBinanceTrade } = handlersRef.current;
      if (data.symbol === symbol && typeof onBinanceTrade === 'function') {
        onBinanceTrade(data);
      }
    });

    socket.on(EVENTS.BINANCE_KLINE, (data) => {
      const { onBinanceKline } = handlersRef.current;
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
