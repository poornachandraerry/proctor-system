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
  { name: 'exam_sessions.continuous_speech_count column',
    sql: `ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS continuous_speech_count INTEGER DEFAULT 0` },

  { name: 'exams.guidelines_ack_required column',
    sql: `ALTER TABLE exams ADD COLUMN IF NOT EXISTS guidelines_ack_required BOOLEAN DEFAULT true` },

  { name: 'exam_sessions.guidelines_ack_at column',
    sql: `ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS guidelines_ack_at TIMESTAMP` },
];

async function migrate() {
  console.log('Running v8 migration (continuous speech detection + exam guidelines acknowledgement)...');
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
