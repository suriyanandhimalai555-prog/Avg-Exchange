/**
 * useTradeSocket — real-time WebSocket feed for a trading pair.
 *
 * Events received:
 *   depth_update   { pair, asks, bids }  — full order book snapshot after every change
 *   balance_update { userId }            — targeted: your balance changed, re-fetch it
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import API_URL from '../config/api';

/**
 * @param {object}   options
 * @param {string}   options.pair            e.g. 'BTC/USDT'
 * @param {number}   options.userId          logged-in user ID (for targeted balance events)
 * @param {function} options.onDepthUpdate   called with { asks, bids } when book changes
 * @param {function} options.onBalanceUpdate called when this user's balance changes
 * @param {function} options.onReconnect     called on every reconnect (use to re-fetch book)
 */
const useTradeSocket = ({ pair, userId, onDepthUpdate, onBalanceUpdate, onReconnect } = {}) => {
  const socketRef  = useRef(null);
  const isFirstRef = useRef(true); // don't fire onReconnect on the initial connect
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    isFirstRef.current = true;
    const socket = io(API_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      if (userId) socket.emit('subscribe', { userId });
      // Re-fetch order book after a reconnect so recovered orders are visible
      if (!isFirstRef.current && typeof onReconnect === 'function') {
        onReconnect();
      }
      isFirstRef.current = false;
    });

    socket.on('disconnect', () => setConnected(false));

    // Full order book snapshot — apply directly, no HTTP round-trip
    socket.on('depth_update', (data) => {
      if (data.pair === pair && typeof onDepthUpdate === 'function') {
        onDepthUpdate({ asks: data.asks, bids: data.bids });
      }
    });

    // Targeted balance notification
    socket.on('balance_update', (data) => {
      if (typeof onBalanceUpdate === 'function') {
        onBalanceUpdate(data);
      }
    });

    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pair]);

  return { connected };
};

export default useTradeSocket;
