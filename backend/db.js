const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Simple connection test
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ DB Error:', err.message);
  else console.log('✅ Postgres Connected');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};