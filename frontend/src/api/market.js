/**
 * api/market.js — Market data endpoints.
 */

import client from './client';

export const getMarkets   = (params) => client.get('/api/markets', { params });
export const getPairs      = ()      => client.get('/api/markets/pairs');
export const getLivePrices = ()      => client.get('/api/markets/live');
export const getStaticCoin = ()     => client.get('/api/markets/static-coin');
export const getCryptoListings = (params) => client.get('/api/crypto/listings', { params });
