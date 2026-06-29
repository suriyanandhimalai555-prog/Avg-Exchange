/**
 * db/funds.js — Atomic fund locking and unlocking.
 *
 * These operations protect against double-spending by using
 * SELECT ... FOR UPDATE row locks inside SQL transactions.
 */

'use strict';

const Decimal = require('../utils/decimal');
const { pool } = require('./pool');

/**
 * Atomically moves `amount` from available_balance -> locked_balance.
 *
 * Two modes:
 *   1. Standalone  — pass no `client`; opens its own BEGIN/COMMIT.
 *   2. Composable  — pass an existing `client` that already has BEGIN running.
 *                    The caller is responsible for COMMIT/ROLLBACK.
 *
 * @param {number} userId
 * @param {string} currency
 * @param {number|string} amount  must be > 0
 * @param {import('pg').PoolClient} [externalClient]
 */
const lockFunds = async (userId, currency, amount, externalClient = null) => {
  const D = new Decimal(amount);
  const standalone = !externalClient;
  const client = externalClient || await pool.connect();

  try {
    if (standalone) await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT available_balance
         FROM balances
        WHERE user_id = $1 AND currency = $2
        FOR UPDATE`,
      [userId, currency]
    );

    if (rows.length === 0) {
      throw new Error(`No ${currency} balance found for user ${userId}`);
    }

    const available = new Decimal(rows[0].available_balance);
    if (available.lt(D)) {
      throw new Error(
        `Insufficient ${currency} balance (have ${available.toFixed(8)}, need ${D.toFixed(8)})`
      );
    }

    await client.query(
      `UPDATE balances
          SET available_balance = available_balance - $1,
              locked_balance    = locked_balance    + $1,
              updated_at        = NOW()
        WHERE user_id = $2 AND currency = $3`,
      [D.toFixed(10), userId, currency]
    );

    if (standalone) await client.query('COMMIT');
  } catch (err) {
    if (standalone) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (standalone) client.release();
  }
};

/**
 * Moves `amount` back from locked_balance -> available_balance.
 * Clamped to actual locked amount to prevent money creation.
 */
const unlockFunds = async (userId, currency, amount) => {
  const D = new Decimal(amount);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT locked_balance
         FROM balances
        WHERE user_id = $1 AND currency = $2
        FOR UPDATE`,
      [userId, currency]
    );

    if (rows.length === 0) {
      throw new Error(`No ${currency} balance found for user ${userId}`);
    }

    const locked = new Decimal(rows[0].locked_balance);
    const toUnlock = Decimal.min(D, locked);

    if (toUnlock.lte(0)) {
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `UPDATE balances
          SET locked_balance    = locked_balance    - $1,
              available_balance = available_balance + $1,
              updated_at        = NOW()
        WHERE user_id = $2 AND currency = $3`,
      [toUnlock.toFixed(10), userId, currency]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { lockFunds, unlockFunds };
