require('dotenv').config();
const { Pool } = require('pg');
const Decimal  = require('decimal.js');

// Full precision — no exponential notation, 28 significant digits
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP, toExpPos: 28, toExpNeg: -28 });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 15_000,  // 15 s — Railway can be slow on cold start
  idleTimeoutMillis:       30_000,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('❌ DB Error:', err.message);
  else console.log('✅ Postgres Connected');
});

// Simple query helper — for reads and non-transactional writes
const query = (text, params) => pool.query(text, params);

// Acquire a raw client for multi-statement transactions
const getClient = () => pool.connect();

/**
 * Atomically moves `amount` from available_balance → locked_balance.
 *
 * Can be called in two modes:
 *   1. Standalone  — pass no `client`; opens its own BEGIN/COMMIT.
 *   2. Composable  — pass an existing `client` that already has BEGIN running.
 *                    The caller is responsible for COMMIT/ROLLBACK.
 *
 * This allows lockFunds + INSERT INTO orders to share a single transaction,
 * preventing "funds locked but order lost" on mid-request crashes.
 *
 * @param {number} userId
 * @param {string} currency
 * @param {number|string} amount  must be > 0
 * @param {import('pg').PoolClient} [externalClient]
 */
const lockFunds = async (userId, currency, amount, externalClient = null) => {
  const D      = new Decimal(amount);
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
      throw new Error(`Insufficient ${currency} balance (have ${available.toFixed(8)}, need ${D.toFixed(8)})`);
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
 * Moves `amount` back from locked_balance → available_balance.
 * Used when an open order is cancelled.
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
    // Only unlock what is actually locked — prevents money creation
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

/**
 * Settles a single fill inside an existing transaction client.
 * Must be called between BEGIN and COMMIT by the caller.
 *
 * All arithmetic uses Decimal.js to avoid IEEE-754 drift.
 *
 * To prevent deadlocks when two fills involve the same pair of users in
 * opposite roles simultaneously, balance rows are always updated in
 * ascending user_id order (lower id first).
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
  const dFillPrice     = new Decimal(fillPrice);
  const dFillQty       = new Decimal(fillQty);
  const dBuyLimitPrice = new Decimal(buyLimitPrice);

  const cost   = dFillPrice.mul(dFillQty);          // actual quote leaving buyer
  const locked = dBuyLimitPrice.mul(dFillQty);       // quote originally locked
  // Refund is always ≥ 0 — if fill was at a worse price than limit (can't happen
  // for limits, but can for market orders), clamp to 0 rather than going negative.
  const refund = Decimal.max(locked.minus(cost), new Decimal(0));

  // ── Deadlock guard: always update lower user_id first ─────────
  // This ensures two concurrent fills between the same pair of users
  // always acquire row locks in the same order, preventing deadlocks.
  const [firstId, secondId] = buyerId < sellerId
    ? [buyerId, sellerId]
    : [sellerId, buyerId];

  // Helper: apply one user's balance changes within the deadlock-safe ordering
  const applyBalance = async (uid) => {
    if (uid === buyerId) {
      // Buyer: deduct locked quote (capped to actual locked), return refund to available, credit base
      await client.query(
        `UPDATE balances
            SET locked_balance    = locked_balance - LEAST($1, locked_balance),
                available_balance = available_balance + $2,
                updated_at        = NOW()
          WHERE user_id = $3 AND currency = $4`,
        [locked.toFixed(10), refund.toFixed(10), buyerId, quoteCurrency]
      );
      await client.query(
        `INSERT INTO balances (user_id, currency, available_balance)
              VALUES ($1, $2, $3)
         ON CONFLICT (user_id, currency)
         DO UPDATE SET available_balance = balances.available_balance + $3,
                       updated_at        = NOW()`,
        [buyerId, baseCurrency, dFillQty.toFixed(10)]
      );
    } else {
      // Seller: deduct locked base (capped to actual locked), credit quote to available
      await client.query(
        `UPDATE balances
            SET locked_balance = locked_balance - LEAST($1, locked_balance),
                updated_at     = NOW()
          WHERE user_id = $2 AND currency = $3`,
        [dFillQty.toFixed(10), sellerId, baseCurrency]
      );
      await client.query(
        `INSERT INTO balances (user_id, currency, available_balance)
              VALUES ($1, $2, $3)
         ON CONFLICT (user_id, currency)
         DO UPDATE SET available_balance = balances.available_balance + $3,
                       updated_at        = NOW()`,
        [sellerId, quoteCurrency, cost.toFixed(10)]
      );
    }
  };

  await applyBalance(firstId);
  await applyBalance(secondId);

  // ── Update order remaining quantities & statuses ───────────
  await client.query(
    `UPDATE orders
        SET remaining_quantity = GREATEST(remaining_quantity - $1, 0),
            status             = CASE
                                   WHEN remaining_quantity - $1 <= 0
                                   THEN 'filled'::order_status
                                   ELSE 'partially_filled'::order_status
                                 END,
            updated_at         = NOW()
      WHERE id = ANY($2::int[])`,
    [dFillQty.toFixed(10), [buyOrderId, sellOrderId]]
  );

  // ── Record the immutable trade ─────────────────────────────
  const { rows } = await client.query(
    `INSERT INTO trades
           (buy_order_id, sell_order_id, buyer_id, seller_id, pair, price, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [buyOrderId, sellOrderId, buyerId, sellerId, pair,
     dFillPrice.toFixed(10), dFillQty.toFixed(10)]
  );

  return rows[0];
};

module.exports = { query, getClient, lockFunds, unlockFunds, settleFill };
