require('dotenv').config();
const { Pool } = require('pg');

// Render-hosted PostgreSQL requires SSL. Render's certs are not in the
// standard CA trust store from inside this environment, so we accept
// the connection without strict verification (this is normal practice
// for connecting to Render/Heroku-style managed Postgres from app code).
const pool = new Pool({
  host:                    process.env.DB_HOST,
  port:                    parseInt(process.env.DB_PORT) || 5432,
  database:                process.env.DB_NAME,
  user:                    process.env.DB_USER,
  password:                process.env.DB_PASSWORD,
  max:                     1,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});

const statements = [
  { name: 'question_banks table', sql: `CREATE TABLE IF NOT EXISTS question_banks (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        VARCHAR(255) NOT NULL,
      description TEXT,
      subject     VARCHAR(100),
      module      VARCHAR(100),
      created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
      org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
      is_public   BOOLEAN DEFAULT false,
      tags        JSONB DEFAULT '[]',
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'bank_questions table', sql: `CREATE TABLE IF NOT EXISTS bank_questions (
      id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      bank_id        UUID REFERENCES question_banks(id) ON DELETE CASCADE,
      question_text  TEXT NOT NULL,
      question_html  TEXT,
      question_type  VARCHAR(30) NOT NULL DEFAULT 'mcq',
      options        JSONB,
      correct_answer JSONB,
      marks          DECIMAL(5,2) DEFAULT 1,
      negative_marks DECIMAL(4,2) DEFAULT 0,
      difficulty     VARCHAR(10) DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
      topic          VARCHAR(255),
      tags           JSONB DEFAULT '[]',
      explanation    TEXT,
      time_limit_secs INTEGER,
      created_at     TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'practice_sessions table', sql: `CREATE TABLE IF NOT EXISTS practice_sessions (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      student_id    UUID REFERENCES users(id) ON DELETE CASCADE,
      bank_id       UUID REFERENCES question_banks(id) ON DELETE CASCADE,
      question_ids  JSONB NOT NULL,
      num_questions INTEGER NOT NULL,
      duration_mins INTEGER NOT NULL,
      difficulty    VARCHAR(10),
      started_at    TIMESTAMP DEFAULT NOW(),
      submitted_at  TIMESTAMP,
      status        VARCHAR(20) DEFAULT 'active',
      answers       JSONB DEFAULT '{}',
      score         DECIMAL(6,2),
      total_marks   DECIMAL(6,2),
      created_at    TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'question_behaviour_log table', sql: `CREATE TABLE IF NOT EXISTS question_behaviour_log (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      session_id      UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
      question_id     UUID REFERENCES questions(id) ON DELETE CASCADE,
      event_type      VARCHAR(40) NOT NULL,
      event_data      JSONB DEFAULT '{}',
      time_on_question INTEGER DEFAULT 0,
      timestamp       TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'answers.first_viewed_at column',  sql: `ALTER TABLE answers ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMP` },
  { name: 'answers.last_activity_at column', sql: `ALTER TABLE answers ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP` },
  { name: 'answers.change_count column',     sql: `ALTER TABLE answers ADD COLUMN IF NOT EXISTS change_count INTEGER DEFAULT 0` },
  { name: 'answers.focus_lost_count column', sql: `ALTER TABLE answers ADD COLUMN IF NOT EXISTS focus_lost_count INTEGER DEFAULT 0` },

  { name: 'session_audio_clips table', sql: `CREATE TABLE IF NOT EXISTS session_audio_clips (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      session_id  UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
      file_path   TEXT NOT NULL,
      duration_s  INTEGER DEFAULT 0,
      file_size   INTEGER DEFAULT 0,
      clip_index  INTEGER DEFAULT 0,
      flagged     BOOLEAN DEFAULT false,
      flag_reason TEXT,
      captured_at TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'idx_bank_questions_bank',  sql: `CREATE INDEX IF NOT EXISTS idx_bank_questions_bank ON bank_questions(bank_id)` },
  { name: 'idx_bank_questions_diff',  sql: `CREATE INDEX IF NOT EXISTS idx_bank_questions_diff ON bank_questions(bank_id, difficulty)` },
  { name: 'idx_qbehaviour_session',   sql: `CREATE INDEX IF NOT EXISTS idx_qbehaviour_session ON question_behaviour_log(session_id)` },
  { name: 'idx_qbehaviour_question',  sql: `CREATE INDEX IF NOT EXISTS idx_qbehaviour_question ON question_behaviour_log(session_id, question_id)` },
  { name: 'idx_practice_student',     sql: `CREATE INDEX IF NOT EXISTS idx_practice_student ON practice_sessions(student_id)` },
  { name: 'idx_audio_session',        sql: `CREATE INDEX IF NOT EXISTS idx_audio_session ON session_audio_clips(session_id)` },
];

async function migrate() {
  console.log('='.repeat(60));
  console.log('ProctorAI v5 Migration (SSL-enabled for hosted Postgres)');
  console.log('='.repeat(60));
  console.log(`DB Host: ${process.env.DB_HOST}`);
  console.log(`DB Name: ${process.env.DB_NAME}`);
  console.log(`DB Port: ${process.env.DB_PORT || 5432}`);
  console.log(`DB User: ${process.env.DB_USER}`);
  console.log('SSL: enabled (rejectUnauthorized: false)');
  console.log('='.repeat(60));

  let client;
  try {
    console.log('\nStep 0: Testing connection...');
    client = await pool.connect();
    console.log('✓ Connected successfully\n');
  } catch (connErr) {
    console.error('❌ COULD NOT CONNECT TO DATABASE');
    console.error('Error code:', connErr.code);
    console.error('Error message:', connErr.message);
    process.exit(1);
  }

  let successCount = 0;
  for (let i = 0; i < statements.length; i++) {
    const { name, sql } = statements[i];
    try {
      await client.query(sql);
      console.log(`✓ [${i + 1}/${statements.length}] ${name}`);
      successCount++;
    } catch (err) {
      console.error(`✗ [${i + 1}/${statements.length}] ${name} FAILED`);
      console.error(`   Error code: ${err.code || 'none'}`);
      console.error(`   Error message: ${err.message}`);
      try { client.release(); } catch {}
      try {
        client = await pool.connect();
        console.log('   ↻ Reconnected, continuing...\n');
      } catch {
        console.error('   ❌ Could not reconnect. Stopping.');
        process.exit(1);
      }
    }
  }

  try {
    await client.query(`
      CREATE TRIGGER update_qbanks_updated_at BEFORE UPDATE ON question_banks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('✓ Trigger created');
  } catch (trigErr) {
    if (trigErr.message.includes('already exists')) {
      console.log('✓ Trigger already exists (fine)');
    } else {
      console.log('⚠ Trigger skipped (not required for v5 features):', trigErr.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  if (successCount === statements.length) {
    console.log(`✅ ALL ${statements.length} STATEMENTS SUCCEEDED`);
  } else {
    console.log(`⚠️  ${successCount}/${statements.length} statements succeeded`);
  }
  console.log('='.repeat(60));

  client.release();
  await pool.end();
  process.exit(successCount === statements.length ? 0 : 1);
}

migrate().catch(err => {
  console.error('\n❌ UNEXPECTED ERROR:', err);
  process.exit(1);
});
