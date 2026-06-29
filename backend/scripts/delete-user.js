/**
 * Delete a user and all their data by email address.
 *
 * Usage:
 *   node scripts/delete-user.js user@example.com
 *
 * What gets deleted (in order):
 *   1. trades        — no CASCADE; must go before orders
 *   2. orders        — no CASCADE; must go before User row
 *   3. User row      — all remaining tables CASCADE automatically:
 *                      balances, kyc_submissions, payment_invoices,
 *                      deposit_addresses, static_deposit_log,
 *                      password_reset_tokens, otp_tokens
 *
 * Safety: runs everything inside a single transaction — if anything
 * fails, the database is left untouched.
 */

require('dotenv').config();
const db = require('../db');

async function deleteUser(email) {
  if (!email) {
    console.error('Usage: node scripts/delete-user.js <email>');
    process.exit(1);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Look up the user
    const { rows } = await client.query(
      'SELECT id, name, email, is_admin FROM "User" WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const user = rows[0];
    console.log(`\nFound user:`);
    console.log(`  ID    : ${user.id}`);
    console.log(`  Name  : ${user.name || '—'}`);
    console.log(`  Email : ${user.email}`);
    console.log(`  Admin : ${user.is_admin}`);

    // Refuse to delete admin accounts — prevents accidental lockout
    if (user.is_admin) {
      console.error('\nRefusing to delete an admin account. Remove admin status first.');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const id = user.id;

    // 2. Delete trades (references orders — must go first)
    const tradesRes = await client.query(
      'DELETE FROM trades WHERE buyer_id = $1 OR seller_id = $1',
      [id]
    );
    console.log(`\n  Deleted trades        : ${tradesRes.rowCount}`);

    // 3. Delete orders (references User — no CASCADE)
    const ordersRes = await client.query(
      'DELETE FROM orders WHERE user_id = $1',
      [id]
    );
    console.log(`  Deleted orders        : ${ordersRes.rowCount}`);

    // 4. Delete the User row — all remaining tables cascade
    await client.query('DELETE FROM "User" WHERE id = $1', [id]);
    console.log(`  Deleted user row`);
    console.log(`  Cascaded              : balances, kyc_submissions, payment_invoices,`);
    console.log(`                          deposit_addresses, static_deposit_log,`);
    console.log(`                          password_reset_tokens, otp_tokens`);

    await client.query('COMMIT');
    console.log(`\nUser ${email} (id=${id}) deleted successfully.\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nTransaction rolled back. No data was changed.');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

deleteUser(process.argv[2]);
