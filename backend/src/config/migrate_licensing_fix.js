require('dotenv').config();
const { pool } = require('./database');

const sql = `

CREATE TABLE IF NOT EXISTS org_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  action VARCHAR(100) NOT NULL,

  details JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_activity_logs_org
ON org_activity_logs(org_id);

CREATE INDEX IF NOT EXISTS idx_org_activity_logs_action
ON org_activity_logs(action);

`;

async function migrate() {
  try {
    console.log('Running licensing fix migration...');
    await pool.query(sql);
    console.log('✅ org_activity_logs created');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();