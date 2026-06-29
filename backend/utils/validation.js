/**
 * utils/validation.js — Shared validation helpers.
 */

'use strict';

const Decimal = require('./decimal');

/**
 * Parses a value into a Decimal, returning null on invalid input.
 * @param {any} value
 * @returns {Decimal|null}
 */
const toDecimal = (value) => {
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
};

/**
 * Validates that a value is a positive Decimal within bounds.
 * @param {any} value
 * @param {string} [maxStr] Optional max (e.g. '1e12')
 * @returns {{ valid: boolean, decimal?: Decimal, error?: string }}
 */
const validatePositiveDecimal = (value, maxStr) => {
  const d = toDecimal(value);
  if (!d) return { valid: false, error: 'must be a valid number' };
  if (d.lte(0)) return { valid: false, error: 'must be a positive number' };
  if (maxStr && d.gt(maxStr)) return { valid: false, error: 'exceeds maximum allowed' };
  return { valid: true, decimal: d };
};

/**
 * Parses a pair string ('BTC/USDT') into base and quote currencies.
 * @param {string} pair
 * @returns {{ baseCurrency: string, quoteCurrency: string }}
 */
const parsePair = (pair) => {
  const [base, quote] = pair.split('/');
  if (!base || !quote) throw new Error(`Invalid trading pair: ${pair}`);
  return { baseCurrency: base, quoteCurrency: quote };
};

module.exports = { toDecimal, validatePositiveDecimal, parsePair };
