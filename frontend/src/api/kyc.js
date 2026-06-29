/**
 * api/kyc.js — KYC endpoints.
 */

import client from './client';

export const getKycStatus  = ()     => client.get('/api/kyc/status');
export const getUploadUrl  = (params) => client.get('/api/kyc/upload-url', { params });
export const submitKyc     = (data) => client.post('/api/kyc/submit', data);
