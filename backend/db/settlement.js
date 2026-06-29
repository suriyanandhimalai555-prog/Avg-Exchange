/**
 * db/settlement.js — ACID trade settlement.
 *
 * Settles a single fill inside an existing transaction client.
 * Must be called between BEGIN and COMMIT by the caller.
 *
 * Deadlock prevention: balance rows are always updated in
 * ascending user_id order (lower id first).
 */

'use strict';

const Decimal = require('../utils/decimal');

/**
 * @param {import('pg').PoolClient} client
 * @param {object} fill
 */
const settleFill = async (client, {
  buyOrderId, sellOrderId,
  buyerId, sellerId,
  pair, baseCurrency, quoteCurrency,
  fillPrice, fillQty,
  buyLimitPrice,
}) => {
  const dFillPrice     = new Decimal(fillPrice);
  const dFillQty       = new Decimal(fillQty);
  const dBuyLimitPrice = new Decimal(buyLimitPrice);

  const cost   = dFillPrice.mul(dFillQty);
  const locked = dBuyLimitPrice.mul(dFillQty);
  const refund = Decimal.max(locked.minus(cost), new Decimal(0));

  // Deadlock guard: always update lower user_id first
  const [firstId, secondId] = buyerId < sellerId
    ? [buyerId, sellerId]
    : [sellerId, buyerId];

  const applyBalance = async (uid) => {
    if (uid === buyerId) {
      // Buyer: deduct locked quote (capped), return refund, credit base
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
      // Seller: deduct locked base (capped), credit quote
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

  // Update order remaining quantities & statuses
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

  // Record the immutable trade
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

module.exports = { settleFill };
