/**
 * walletService.js — Withdrawal processing.
 *
 * Currently stubbed: deducts balance and returns success.
 * Replace the STUB section with blockchain API (Fireblocks, web3, BitGo).
 */

'use strict';

const Decimal = require('../utils/decimal');
const db      = require('../db');

/**
 * Process a withdrawal request.
 * Deducts `amount` of `currency` from available balance.
 * Does NOT send funds on-chain yet.
 */
const processWithdrawal = async (userId, currency, amount, toAddress) => {
  if (!userId || !currency || !amount || !toAddress) {
    throw new Error('userId, currency, amount, and toAddress are required');
  }

  const dAmount = new Decimal(amount);
  if (dAmount.lte(0)) {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT available_balance
         FROM balances
        WHERE user_id = $1 AND currency = $2
        FOR UPDATE`,
      [userId, currency]
    );

    if (rows.length === 0 || new Decimal(rows[0].available_balance).lt(dAmount)) {
      throw new Error(`Insufficient ${currency} balance for withdrawal`);
    }

    await client.query(
      `UPDATE balances
          SET available_balance = available_balance - $1,
              updated_at        = NOW()
        WHERE user_id = $2 AND currency = $3`,
      [dAmount.toFixed(10), userId, currency]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // STUB — replace with live blockchain broadcast
  const stubTxHash = `STUB_${Date.now()}_${userId}`;
  console.log(`[wallet] STUB withdrawal — user ${userId}: ${amount} ${currency} -> ${toAddress} (${stubTxHash})`);

  return {
    success: true,
    txHash: stubTxHash,
    message: 'Withdrawal recorded (blockchain broadcast not yet wired)',
  };
};

module.exports = { processWithdrawal };
