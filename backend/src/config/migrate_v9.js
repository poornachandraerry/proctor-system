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
  { name: 'question_banks.price_per_attempt column',
    sql: `ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS price_per_attempt DECIMAL(8,2) DEFAULT 0` },

  // One row = one paid practice attempt. Created with status='created' when
  // a Razorpay order is opened, flipped to 'paid' only after the payment
  // signature is verified server-side, then consumed (consumed_at set,
  // practice_session_id linked) the moment it funds a generated practice
  // test. A student needs exactly one unconsumed 'paid' row per attempt on
  // a priced bank — never a running balance, matching "pay ₹20, use once".
  { name: 'bank_payment_credits table', sql: `CREATE TABLE IF NOT EXISTS bank_payment_credits (
      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
      bank_id             UUID REFERENCES question_banks(id) ON DELETE CASCADE,
      amount              DECIMAL(8,2) NOT NULL,
      currency            VARCHAR(10) DEFAULT 'INR',
      razorpay_order_id   VARCHAR(100),
      razorpay_payment_id VARCHAR(100),
      razorpay_signature  VARCHAR(255),
      status              VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
      consumed_at         TIMESTAMP,
      practice_session_id UUID,
      created_at          TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'practice_sessions.credit_id column',
    sql: `ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS credit_id UUID REFERENCES bank_payment_credits(id)` },

  { name: 'idx_bank_credits_user_bank',
    sql: `CREATE INDEX IF NOT EXISTS idx_bank_credits_user_bank ON bank_payment_credits(user_id, bank_id, status)` },
  { name: 'idx_bank_credits_order',
    sql: `CREATE INDEX IF NOT EXISTS idx_bank_credits_order ON bank_payment_credits(razorpay_order_id)` },
];

async function migrate() {
  console.log('Running v9 migration (question bank pay-per-practice-attempt)...');
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
