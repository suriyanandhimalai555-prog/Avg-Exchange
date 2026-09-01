/**
 * config/index.js — Single source of truth for all environment-driven configuration.
 *
 * Every module reads from here instead of touching process.env directly.
 * Missing critical vars are caught at startup, not at first request.
 */

'use strict';

require('dotenv').config();

const env = (key, fallback) => {
  const val = process.env[key];
  if (val !== undefined) return val;
  if (fallback !== undefined) return fallback;
  return undefined;
};

const requireEnv = (key) => {
  const val = process.env[key];
  if (!val) {
    console.error(`FATAL: ${key} is not set. Refusing to start.`);
    process.exit(1);
  }
  return val;
};

module.exports = {
  // ── Server ────────────────────────────────────────────────────
  port:     parseInt(env('PORT', '4010'), 10),
  nodeEnv:  env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV') === 'production',

  // ── Auth ──────────────────────────────────────────────────────
  secret:          requireEnv('SECRET'),
  sessionExpiry:   '3h',
  sessionMaxAge:   3 * 60 * 60 * 1000,  // 3 hours in ms
  botSessionExpiry: '30d',
  botSessionMaxAge: 30 * 24 * 60 * 60 * 1000,
  otpExpiryMinutes: 10,
  resetCodeExpiryMinutes: 15,
  botEmail:        env('BOT_EMAIL'),
  botSecret:       env('BOT_SECRET'),

  // ── CORS ──────────────────────────────────────────────────────
  corsOrigins: env('CORS_ORIGINS')
    ? env('CORS_ORIGINS').split(',').map(o => o.trim())
    : ['http://localhost:5173'],

  // ── Database ──────────────────────────────────────────────────
  databaseUrl:         env('DATABASE_URL'),
  dbMaxConnections:    20,
  dbConnectionTimeout: 15_000,
  dbIdleTimeout:       30_000,

  // ── External APIs ─────────────────────────────────────────────
  coinmarketcapApiKey: env('COINMARKETCAP_API'),
  coingeckoApiKey:     env('COINGECKO_API_KEY'),
  oneInchApiKey:       env('ONE_INCH_API_KEY'),

  // ── AWS / S3 ──────────────────────────────────────────────────
  aws: {
    accessKeyId:     env('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
    region:          env('AWS_REGION', 'us-east-1'),
    s3Bucket:        env('AWS_S3_BUCKET'),
  },

  // ── OxaPay ────────────────────────────────────────────────────
  oxapay: {
    merchantKey: env('OXAPAY_MERCHANT_KEY'),
    sandbox:     env('OXAPAY_SANDBOX') !== 'false',
    callbackUrl: env('OXAPAY_CALLBACK_URL'),
    staticCallbackUrl: env('OXAPAY_STATIC_CALLBACK_URL'),
    returnUrl:   env('OXAPAY_RETURN_URL'),
    appUrl:      env('APP_URL', 'http://localhost:4010'),
    frontendUrl: env('FRONTEND_URL', 'http://localhost:5173'),
  },

  // ── SMTP ──────────────────────────────────────────────────────
  smtp: {
    host: env('SMTP_HOST'),
    port: parseInt(env('SMTP_PORT', '587'), 10),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM', '"AvgExchange" <noreply@avgexchange.io>'),
  },

  // ── Cookie defaults ───────────────────────────────────────────
  cookieDefaults: {
    httpOnly: true,
    secure:   true,
    sameSite: 'none',
  },
};
