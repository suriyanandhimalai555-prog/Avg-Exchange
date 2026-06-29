/**
 * Fetch all direct referrals for a specific user by their email address.
 *
 * Usage:
 *   node scripts/get-referrals.js user@example.com
 */

require('dotenv').config();
const db = require('../db');

async function getReferrals(email) {
  if (!email) {
    console.error('Usage: node scripts/get-referrals.js <email>');
    process.exit(1);
  }

  try {
    // 1. Look up the parent user
    const userRes = await db.query(
      'SELECT id, name, email, referral_code, referral_count FROM "User" WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    const parent = userRes.rows[0];
    console.log(`\nParent User:`);
    console.log(`  ID            : ${parent.id}`);
    console.log(`  Name          : ${parent.name || '—'}`);
    console.log(`  Email         : ${parent.email}`);
    console.log(`  Referral Code : ${parent.referral_code || '—'}`);
    console.log(`  Direct Count  : ${parent.referral_count}`);

    // 2. Fetch all direct referrals
    const referralRes = await db.query(
      `SELECT id, name, email, created_at, referral_count
         FROM "User"
        WHERE referred_by = $1
        ORDER BY created_at DESC`,
      [parent.id]
    );

    const referrals = referralRes.rows;

    if (referrals.length === 0) {
      console.log(`\nNo direct referrals found for this user.\n`);
    } else {
      console.log(`\nDirect Referrals (${referrals.length}):`);
      console.log(`─`.repeat(80));
      console.log(`${'ID'.padEnd(6)} | ${'Name'.padEnd(20)} | ${'Email'.padEnd(30)} | ${'Joined'.padEnd(20)}`);
      console.log(`─`.repeat(80));

      referrals.forEach(ref => {
        const joined = new Date(ref.created_at).toLocaleString();
        console.log(
          `${String(ref.id).padEnd(6)} | ` +
          `${(ref.name || '—').padEnd(20)} | ` +
          `${ref.email.padEnd(30)} | ` +
          `${joined}`
        );
      });
      console.log(`─`.repeat(80));
      console.log('');
    }

  } catch (err) {
    console.error('\nError fetching referrals:', err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

getReferrals(process.argv[2]);
