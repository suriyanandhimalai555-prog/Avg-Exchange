/**
 * services/tradeNotificationService.js — Trade completion email notifications.
 *
 * Extracted from tradeRoutes to keep route handlers focused on HTTP concerns.
 * Emails only on ORDER COMPLETION, never on individual fills.
 */

'use strict';

const Decimal = require('../utils/decimal');
const db      = require('../db');
const email   = require('./emailService');

/**
 * Send trade notification emails after fills complete.
 * Fire-and-forget — never throws to the caller.
 *
 * @param {object} params
 * @param {object[]} params.executedTrades
 * @param {string} params.side
 * @param {string} params.pair
 * @param {string} params.type
 * @param {number} params.userId
 * @param {number} params.quantityLeft
 */
async function sendTradeNotifications({ executedTrades, side, pair, type, userId, quantityLeft }) {
  if (executedTrades.length === 0) return;

  try {
    const counterpartyRole = side === 'buy' ? 'sell' : 'buy';

    // Aggregate fills for the placing user
    let totalFillQty   = new Decimal(0);
    let totalFillValue = new Decimal(0);
    let lastExecutedAt = null;
    for (const t of executedTrades) {
      totalFillQty   = totalFillQty.plus(t.quantity);
      totalFillValue = totalFillValue.plus(new Decimal(t.price).mul(t.quantity));
      lastExecutedAt = t.executed_at;
    }

    // Placing user: market orders always, limit orders only when fully filled
    const orderComplete = type === 'market' || quantityLeft === 0;
    if (orderComplete) {
      const userRes = await db.query('SELECT email, is_admin FROM "User" WHERE id = $1', [userId]);
      const usr = userRes.rows[0];
      if (usr?.email && !usr.is_admin) {
        const avgPrice = totalFillValue.div(totalFillQty);
        email.sendTradeNotification(usr.email, {
          price:       avgPrice.toFixed(10),
          quantity:    totalFillQty.toFixed(10),
          executed_at: lastExecutedAt,
        }, side, pair);
      }
    }

    // Counterparties — only when their resting order is fully consumed
    for (const t of executedTrades) {
      const cpId      = side === 'buy' ? t.seller_id   : t.buyer_id;
      const cpOrderId = side === 'buy' ? t.sell_order_id : t.buy_order_id;

      const [orderRes, cpRes] = await Promise.all([
        db.query('SELECT status FROM orders WHERE id = $1', [cpOrderId]),
        db.query('SELECT email, is_admin FROM "User" WHERE id = $1', [cpId]),
      ]);

      if (orderRes.rows[0]?.status !== 'filled') continue;
      const cp = cpRes.rows[0];
      if (cp?.email && !cp.is_admin) {
        email.sendTradeNotification(cp.email, t, counterpartyRole, pair);
      }
    }
  } catch (err) {
    console.error('[trade] Failed to send notification emails:', err.message);
  }
}

module.exports = { sendTradeNotifications };
