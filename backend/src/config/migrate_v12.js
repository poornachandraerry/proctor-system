require('dotenv').config();
const { Pool } = require('pg');

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

const statements = [
  // 0 = no free trial offered for this bank. Only meaningful on priced
  // banks — free banks (price_per_attempt = 0) are already fully free.
  { name: 'question_banks.free_trial_questions column',
    sql: `ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS free_trial_questions INTEGER DEFAULT 5` },

  // One row = this student has used their one free trial on this bank.
  // The unique constraint is what actually enforces "only once" — even
  // under a race of two simultaneous requests, only one insert can win.
  { name: 'bank_free_trials table', sql: `CREATE TABLE IF NOT EXISTS bank_free_trials (
      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
      bank_id             UUID REFERENCES question_banks(id) ON DELETE CASCADE,
      practice_session_id UUID,
      created_at          TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, bank_id)
    )` },

  { name: 'idx_bank_free_trials_user_bank',
    sql: `CREATE INDEX IF NOT EXISTS idx_bank_free_trials_user_bank ON bank_free_trials(user_id, bank_id)` },
];

async function migrate() {
  console.log('Running v12 migration (freemium free trial per question bank)...');
  let client;
  try {
    client = await pool.connect();
    console.log('✓ Connected\n');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  let success = 0;
  for (let i = 0; i < statements.length; i++) {
    const { name, sql } = statements[i];
    try {
      await client.query(sql);
      console.log(`✓ [${i+1}/${statements.length}] ${name}`);
      success++;
    } catch (err) {
      console.error(`✗ [${i+1}/${statements.length}] ${name} FAILED: ${err.message}`);
    }
  }

  console.log(`\n${success}/${statements.length} statements succeeded`);
  client.release();
  await pool.end();
  process.exit(success === statements.length ? 0 : 1);
}

migrate().catch(err => { console.error('❌ Unexpected error:', err); process.exit(1); });
