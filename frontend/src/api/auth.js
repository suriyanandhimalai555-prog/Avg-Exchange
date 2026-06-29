/**
 * api/auth.js — Authentication endpoints.
 */

import client from './client';

export const login              = (data) => client.post('/api/user/login', data);
export const verifyLoginOtp     = (data) => client.post('/api/user/verify-login-otp', data);
export const signup             = (data) => client.post('/api/user/signup', data);
export const verifySignupOtp    = (data) => client.post('/api/user/verify-signup-otp', data);
export const logout             = ()     => client.post('/api/user/logout');
export const getMe              = ()     => client.get('/api/user/me');
export const changePassword     = (data) => client.post('/api/user/change-password', data);
export const forgotPassword     = (data) => client.post('/api/user/forgot-password', data);
export const resetPassword      = (data) => client.post('/api/user/reset-password', data);
