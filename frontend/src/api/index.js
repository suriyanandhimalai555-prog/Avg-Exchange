/**
 * api/index.js — Barrel export for all API modules.
 */

export { default as client, API_URL, setUnauthorizedHandler } from './client';
export * as authApi    from './auth';
export * as tradeApi   from './trade';
export * as marketApi  from './market';
export * as userApi    from './user';
export * as kycApi     from './kyc';
export * as adminApi   from './admin';
export * as paymentApi from './payment';
