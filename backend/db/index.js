/**
 * db/index.js — Unified database interface.
 *
 * Re-exports pool helpers + financial operations from focused modules.
 * All other files import from 'db' (this file) — never from sub-modules directly.
 */

'use strict';

const { pool, query, getClient } = require('./pool');
const { lockFunds, unlockFunds } = require('./funds');
const { settleFill }             = require('./settlement');

module.exports = {
  pool,
  query,
  getClient,
  lockFunds,
  unlockFunds,
  settleFill,
};
