/**
 * api/payment.js — Payment/deposit endpoints.
 */

import client from './client';

export const createInvoice    = (data)     => client.post('/api/payment/invoice', data);
export const createWhitelabel = (data)     => client.post('/api/payment/whitelabel', data);
export const getPaymentStatus = (trackId)  => client.get(`/api/payment/status/${trackId}`);
export const getDepositAddress = (currency, network) =>
  client.get(`/api/payment/address/${currency}/${network}`);
export const getNetworks      = ()         => client.get('/api/payment/networks');
