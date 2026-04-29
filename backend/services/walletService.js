/**
 * walletService.js — Withdrawal processing
 *
 * Currently stubbed: deducts the balance in the database and returns success.
 * Replace the STUB section with your blockchain API call (e.g. Fireblocks, web3,
 * BitGo) when you are ready to wire live withdrawals.
 */

const db = require('../db');

/**
 * Process a withdrawal request.
 * Deducts `amount` of `currency` from the user's available balance and
 * records the intent. Does NOT send funds on-chain yet.
 *
 * @param {number} userId
 * @param {string} currency   e.g. 'BTC', 'USDT'
 * @param {number} amount
 * @param {string} toAddress  destination wallet address
 * @returns {{ success: boolean, txHash: string|null, message: string }}
 */
const processWithdrawal = async (userId, currency, amount, toAddress) => {
  if (!userId || !currency || !amount || !toAddress) {
    throw new Error('userId, currency, amount, and toAddress are required');
  }
  if (amount <= 0) {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  // ── 1. Verify and deduct balance (atomic) ─────────────────
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

    if (rows.length === 0 || parseFloat(rows[0].available_balance) < amount) {
      throw new Error(`Insufficient ${currency} balance for withdrawal`);
    }

    await client.query(
      `UPDATE balances
          SET available_balance = available_balance - $1,
              updated_at        = NOW()
        WHERE user_id = $2 AND currency = $3`,
      [amount, userId, currency]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // ── 2. STUB — replace with live blockchain broadcast ───────
  // Example (Fireblocks SDK, web3.js, etc.):
  //
  //   const tx = await blockchainClient.sendTransaction({
  //     asset: currency,
  //     amount: amount.toString(),
  //     destination: toAddress,
  //   });
  //   return { success: true, txHash: tx.id, message: 'Withdrawal submitted' };
  //
  // For now, return a placeholder tx hash so the rest of the flow works.
  const stubTxHash = `STUB_${Date.now()}_${userId}`;

  console.log(`[walletService] STUB withdrawal — user ${userId}: ${amount} ${currency} → ${toAddress} (${stubTxHash})`);

  return {
    success: true,
    txHash: stubTxHash,
    message: 'Withdrawal recorded (blockchain broadcast not yet wired)',
  };
};

module.exports = { processWithdrawal };
