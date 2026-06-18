const { Pool } = require('pg');
const logger = require('../utils/logger');

// Auto-detect whether SSL is needed: hosted providers like Render, Heroku,
// Supabase, AWS RDS, etc. require SSL. Local PostgreSQL on localhost does not.
const isHostedDb =
  process.env.DB_HOST &&
  process.env.DB_HOST !== 'localhost' &&
  process.env.DB_HOST !== '127.0.0.1';

const pool = new Pool({
  host:                   process.env.DB_HOST     || 'localhost',
  port:                   parseInt(process.env.DB_PORT) || 5432,
  database:               process.env.DB_NAME     || 'proctorai_db',
  user:                   process.env.DB_USER     || 'postgres',
  password:               process.env.DB_PASSWORD || '',
  max:                    20,
  idleTimeoutMillis:      30000,
  connectionTimeoutMillis:10000,
  keepAlive:              true,
  ssl:                    isHostedDb ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

async function connectDB() {
  try {
    const client = await pool.connect();
    logger.info(`PostgreSQL connected successfully (SSL: ${isHostedDb ? 'on' : 'off'}, host: ${process.env.DB_HOST || 'localhost'})`);
    client.release();
    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    throw error;
  }
}

async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    logger.error('Query error:', { text: text.slice(0, 80), error: error.message });
    throw error;
  }
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, connectDB, query, transaction };
