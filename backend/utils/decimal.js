/**
 * utils/decimal.js — Pre-configured Decimal.js instance.
 *
 * All financial arithmetic must use this to avoid IEEE-754 drift.
 * Centralized so precision settings are never inconsistent.
 */

'use strict';

const Decimal = require('decimal.js');

Decimal.set({
  precision: 28,
  rounding:  Decimal.ROUND_HALF_UP,
  toExpPos:  28,
  toExpNeg:  -28,
});

module.exports = Decimal;
