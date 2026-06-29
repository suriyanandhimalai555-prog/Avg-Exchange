/**
 * api/admin.js — Admin dashboard endpoints.
 */

import client from './client';

export const getStats         = ()       => client.get('/api/admin/stats');
export const getUsers         = ()       => client.get('/api/admin/users');
export const getUserDetail    = (id)     => client.get(`/api/admin/users/${id}`);
export const toggleAdmin      = (id)     => client.patch(`/api/admin/users/${id}/toggle-admin`);
export const addBalance       = (id, data) => client.post(`/api/admin/users/${id}/add-balance`, data);
export const getKycList       = ()       => client.get('/api/admin/kyc');
export const approveKyc       = (id)     => client.post(`/api/admin/kyc/${id}/approve`);
export const rejectKyc        = (id, note) => client.post(`/api/admin/kyc/${id}/reject`, { note });
export const getOrders        = (params) => client.get('/api/admin/orders', { params });
export const getStaticCoin    = ()       => client.get('/api/admin/static-coin');
export const updateStaticCoin = (data)   => client.put('/api/admin/static-coin', data);

// Referrals
export const getReferrals     = (params) => client.get('/api/admin/referrals', { params });
export const getReferralTree  = (userId) => client.get(`/api/admin/referrals/${userId}/tree`);
