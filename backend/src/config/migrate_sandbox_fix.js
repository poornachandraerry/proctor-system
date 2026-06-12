require('dotenv').config();
const { pool } = require('./database');

const sql = `
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS sandbox_expires_at TIMESTAMP;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS sandbox_created_by UUID;
`;

async function migrate() {
  try {
    console.log('Running sandbox fix migration...');
    await pool.query(sql);
    console.log('✅ Sandbox fix migration complete');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();