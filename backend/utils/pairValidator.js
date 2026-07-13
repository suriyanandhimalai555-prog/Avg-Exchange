/**
 * utils/pairValidator.js — Dynamic trading pair validation.
 *
 * Checks against the static SUPPORTED_PAIRS whitelist first,
 * then falls back to the admin-configured static coin (DB lookup with TTL cache).
 */

'use strict';

const { SUPPORTED_PAIRS } = require('../config/pairs');
const db = require('../db');

let _staticCoinPair  = null;
let _staticCoinFetch = 0;
const STATIC_COIN_TTL = 30_000;

const isValidPair = async (pair) => {
  if (typeof pair !== 'string') return false;
  if (SUPPORTED_PAIRS.has(pair)) return true;

  const now = Date.now();
  if (_staticCoinPair && now - _staticCoinFetch < STATIC_COIN_TTL) {
    return pair === _staticCoinPair;
  }

  try {
    const { rows } = await db.query(
      `SELECT symbol FROM static_coin_config WHERE enabled = TRUE LIMIT 1`
    );
    _staticCoinPair  = rows[0] ? `${rows[0].symbol}/USDT` : null;
    _staticCoinFetch = now;
  } catch (err) {
    throw err;
  }

  return pair === _staticCoinPair;
};

module.exports = { isValidPair };
