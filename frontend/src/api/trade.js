/**
 * api/trade.js — Trading endpoints.
 */

import client from './client';

export const placeOrder     = (data)     => client.post('/api/trade/order', data);
export const cancelOrder    = (orderId)  => client.delete(`/api/trade/order/${orderId}`);
export const getOrders      = ()         => client.get('/api/trade/orders');
export const getTrades      = ()         => client.get('/api/trade/trades');
export const getOrderBook   = (pair)     => client.get('/api/trade/orderbook', { params: { pair } });
