/**
 * db/pool.js — PostgreSQL connection pool and query helpers.
 *
 * This is the only file that touches `pg` directly.
 * Every other module imports from db/index.js which re-exports these.
 */

'use strict';

const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max:                    config.dbMaxConnections,
  connectionTimeoutMillis: config.dbConnectionTimeout,
  idleTimeoutMillis:       config.dbIdleTimeout,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW()', (err) => {
  if (err) console.error('[db] Connection error:', err.message);
  else console.log('[db] Postgres connected');
});

const query = (text, params) => pool.query(text, params);

const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
