require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('❌ DB Error:', err.message);
  else console.log('✅ Postgres Connected');
});

// Simple query helper — for reads and non-transactional writes
const query = (text, params) => pool.query(text, params);

// Acquire a raw client for multi-statement transactions
const getClient = () => pool.connect();

/**
 * Atomically moves `amount` of `currency` from available_balance → locked_balance.
 * Throws if the user has insufficient available funds.
 *
 * @param {number} userId
 * @param {string} currency  e.g. 'USDT', 'BTC'
 * @param {number} amount    must be > 0
 */
const lockFunds = async (userId, currency, amount) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row so concurrent requests queue up rather than double-spending
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

    const available = parseFloat(rows[0].available_balance);
    if (available < amount) {
      throw new Error(`Insufficient ${currency} balance (have ${available}, need ${amount})`);
    }

    await client.query(
      `UPDATE balances
          SET available_balance = available_balance - $1,
              locked_balance    = locked_balance    + $1,
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
};

/**
 * Moves `amount` of `currency` back from locked_balance → available_balance.
 * Used when an open order is cancelled.
 */
const unlockFunds = async (userId, currency, amount) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE balances
          SET locked_balance    = GREATEST(locked_balance    - $1, 0),
              available_balance = available_balance + $1,
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
};

/**
 * Settles a single fill inside an existing transaction client.
 * Must be called between BEGIN and COMMIT by the caller.
 *
 * For a BUY fill at `fillPrice`:
 *   - Buyer's locked quota-currency decreases by buyLimitPrice × fillQty
 *   - Buyer's available quota-currency increases by (buyLimitPrice − fillPrice) × fillQty  (refund)
 *   - Buyer's available base-currency increases by fillQty
 *   - Seller's locked base-currency decreases by fillQty
 *   - Seller's available quota-currency increases by fillPrice × fillQty
 *
 * @param {import('pg').PoolClient} client
 * @param {object} fill
 */
const settleFill = async (client, {
  buyOrderId, sellOrderId,
  buyerId, sellerId,
  pair, baseCurrency, quoteCurrency,
  fillPrice, fillQty,
  buyLimitPrice,   // the price the buyer originally locked funds at
}) => {
  const cost    = fillPrice    * fillQty;   // actual USDT leaving the buyer
  const locked  = buyLimitPrice * fillQty;  // USDT originally locked
  const refund  = locked - cost;            // excess locked funds returned to buyer

  // ── Buyer ──────────────────────────────────────────────────
  // GREATEST(...,0) guards against floating-point dust going negative
  await client.query(
    `UPDATE balances
        SET locked_balance    = GREATEST(locked_balance    - $1, 0),
            available_balance = GREATEST(available_balance + $2, 0),
            updated_at        = NOW()
      WHERE user_id = $3 AND currency = $4`,
    [locked, refund, buyerId, quoteCurrency]
  );
  await client.query(
    `INSERT INTO balances (user_id, currency, available_balance)
          VALUES ($1, $2, $3)
     ON CONFLICT (user_id, currency)
     DO UPDATE SET available_balance = balances.available_balance + $3,
                   updated_at        = NOW()`,
    [buyerId, baseCurrency, fillQty]
  );

  // ── Seller ─────────────────────────────────────────────────
  await client.query(
    `UPDATE balances
        SET locked_balance = GREATEST(locked_balance - $1, 0),
            updated_at     = NOW()
      WHERE user_id = $2 AND currency = $3`,
    [fillQty, sellerId, baseCurrency]
  );
  await client.query(
    `INSERT INTO balances (user_id, currency, available_balance)
          VALUES ($1, $2, $3)
     ON CONFLICT (user_id, currency)
     DO UPDATE SET available_balance = balances.available_balance + $3,
                   updated_at        = NOW()`,
    [sellerId, quoteCurrency, cost]
  );

  // ── Update order remaining quantities & statuses ───────────
  await client.query(
    `UPDATE orders
        SET remaining_quantity = remaining_quantity - $1,
            status             = CASE
                                   WHEN remaining_quantity - $1 <= 0
                                   THEN 'filled'::order_status
                                   ELSE 'partially_filled'::order_status
                                 END,
            updated_at         = NOW()
      WHERE id = ANY($2::int[])`,
    [fillQty, [buyOrderId, sellOrderId]]
  );

  // ── Record the immutable trade ─────────────────────────────
  const { rows } = await client.query(
    `INSERT INTO trades
           (buy_order_id, sell_order_id, buyer_id, seller_id, pair, price, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [buyOrderId, sellOrderId, buyerId, sellerId, pair, fillPrice, fillQty]
  );

  return rows[0];
};

module.exports = { query, getClient, lockFunds, unlockFunds, settleFill };
