/**
 * constants/socket.js — Socket.io event names.
 *
 * Centralizes event name strings to prevent typos.
 */

// Server -> Client events
export const DEPTH_UPDATE     = 'depth_update';
export const BALANCE_UPDATE   = 'balance_update';
export const ADMIN_REFRESH    = 'admin:refresh';

// Binance market data
export const BINANCE_TICKER   = 'binance:ticker';
export const BINANCE_DEPTH    = 'binance:depth';
export const BINANCE_TRADE    = 'binance:trade';
export const BINANCE_KLINE    = 'binance:kline';

// Client -> Server events
export const SUBSCRIBE        = 'subscribe';
