/**
 * middleware/rateLimiters.js — Centralized rate limiter definitions.
 *
 * All rate limiters live here so limits are visible in one place.
 * Routes import the specific limiter they need.
 */

'use strict';

const rateLimit = require('express-rate-limit');

const userKeyGenerator = (req) => String(req.user?.id || 'anon');
const skipAdmins = (req) => req.user?.is_admin === true;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Caps wrong OTP guesses per email so an attacker who knows the password
// cannot brute-force the 6-digit code by rotating IPs. Only failed attempts
// (HTTP >= 400) count, so a legitimate user typing the right code is unaffected.
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many incorrect codes. Please request a new one.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => String(req.body?.email || '').toLowerCase().trim() || 'anon',
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const orderLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  message: { error: 'Too many orders — slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
  skip: skipAdmins,
});

const cancelLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  message: { error: 'Too many cancel requests — slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
  skip: skipAdmins,
});

const invoiceLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many invoice requests — please wait' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
});

module.exports = {
  authLimiter,
  otpVerifyLimiter,
  forgotPasswordLimiter,
  orderLimiter,
  cancelLimiter,
  invoiceLimiter,
};
