require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const isHostedDb =
  process.env.DB_HOST &&
  process.env.DB_HOST !== 'localhost' &&
  process.env.DB_HOST !== '127.0.0.1';

const pool = new Pool({
  host:                    process.env.DB_HOST,
  port:                    parseInt(process.env.DB_PORT) || 5432,
  database:                process.env.DB_NAME,
  user:                    process.env.DB_USER,
  password:                process.env.DB_PASSWORD,
  max:                     1,
  connectionTimeoutMillis: 15000,
  ssl: isHostedDb ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  console.log('Running v7 migration (public exam registration links)...');
  let client;
  try {
    client = await pool.connect();
    console.log('✓ Connected\n');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  try {
    // Add a permanent public link token to every exam
    await client.query(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS public_link_token VARCHAR(64) UNIQUE
    `);
    console.log('✓ [1/2] exams.public_link_token column added');

    // Backfill existing exams that don't have a token yet
    const existing = await client.query(`SELECT id FROM exams WHERE public_link_token IS NULL`);
    for (const row of existing.rows) {
      const token = crypto.randomBytes(20).toString('hex');
      await client.query(`UPDATE exams SET public_link_token=$1 WHERE id=$2`, [token, row.id]);
    }
    console.log(`✓ [2/2] Backfilled tokens for ${existing.rows.length} existing exam(s)`);

    console.log('\n✅ v7 migration complete!');
    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration step failed:', err.message);
    if (client) client.release();
    process.exit(1);
  }
}

migrate().catch(err => { console.error('❌ Unexpected error:', err); process.exit(1); });
