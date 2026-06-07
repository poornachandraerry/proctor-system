require('dotenv').config();
const { pool } = require('./database');

const sql = `
-- Email whitelist per exam (only these emails can register/take)
CREATE TABLE IF NOT EXISTS exam_email_whitelist (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id    UUID REFERENCES exams(id) ON DELETE CASCADE,
  email      VARCHAR(255) NOT NULL,
  added_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  registered BOOLEAN DEFAULT false,
  invited_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(exam_id, email)
);

-- Domain whitelist per exam (e.g. only @iitb.ac.in)
CREATE TABLE IF NOT EXISTS exam_domain_whitelist (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id  UUID REFERENCES exams(id) ON DELETE CASCADE,
  domain   VARCHAR(255) NOT NULL,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(exam_id, domain)
);

-- Add access control fields to exams
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS access_type VARCHAR(20) DEFAULT 'open'
    CHECK (access_type IN ('open','email_whitelist','domain_whitelist','invite_only')),
  ADD COLUMN IF NOT EXISTS registration_open BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS show_results_to_student BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS result_release_date TIMESTAMP;

-- Email invitation log
CREATE TABLE IF NOT EXISTS exam_invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id     UUID REFERENCES exams(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  sent_at     TIMESTAMP DEFAULT NOW(),
  opened_at   TIMESTAMP,
  registered_at TIMESTAMP,
  token       VARCHAR(64) UNIQUE NOT NULL,
  status      VARCHAR(20) DEFAULT 'sent'
    CHECK (status IN ('sent','opened','registered','expired'))
);

CREATE INDEX IF NOT EXISTS idx_email_whitelist_exam  ON exam_email_whitelist(exam_id);
CREATE INDEX IF NOT EXISTS idx_domain_whitelist_exam ON exam_domain_whitelist(exam_id);
CREATE INDEX IF NOT EXISTS idx_invitations_exam      ON exam_invitations(exam_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token     ON exam_invitations(token);
`;

async function migrate() {
  try {
    console.log('Running v4 migrations (email whitelist + domain + results)...');
    await pool.query(sql);
    console.log('✅ v4 migrations complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
