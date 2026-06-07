require('dotenv').config();
const { pool } = require('./database');

const sql = `
-- Add org_admin role to users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'org_admin', 'examiner', 'student'));

-- Rich content fields on questions
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_html    TEXT,
  ADD COLUMN IF NOT EXISTS question_assets  JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS options_html     JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS has_rich_content BOOLEAN DEFAULT false;

-- Media/file assets table (images, audio, video attached to questions)
CREATE TABLE IF NOT EXISTS question_assets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id  UUID REFERENCES questions(id) ON DELETE CASCADE,
  exam_id      UUID REFERENCES exams(id) ON DELETE CASCADE,
  asset_type   VARCHAR(20) NOT NULL CHECK (asset_type IN ('image','audio','video','formula','table')),
  file_name    VARCHAR(255),
  file_path    TEXT NOT NULL,
  mime_type    VARCHAR(100),
  file_size    INTEGER DEFAULT 0,
  alt_text     TEXT,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_assets_question ON question_assets(question_id);
CREATE INDEX IF NOT EXISTS idx_question_assets_exam     ON question_assets(exam_id);

-- Org admin invitations (so org_admin can invite users to their org)
CREATE TABLE IF NOT EXISTS org_invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20) DEFAULT 'student',
  token       VARCHAR(64) UNIQUE NOT NULL,
  invited_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMP,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org   ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON org_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);
`;

async function migrate() {
  try {
    console.log('Running v3 migrations (org_admin + rich questions)...');
    await pool.query(sql);
    console.log('✅ v3 migrations complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
