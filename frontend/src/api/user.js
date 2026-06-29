/**
 * api/user.js — User balance and profile endpoints.
 */

import client from './client';

export const getBalance     = ()         => client.get('/api/user/balance');
export const adminDeposit   = (data)     => client.post('/api/user/deposit', data);
