require('dotenv').config();
const { pool } = require('./database');

// Fix for a gap in the migration chain: license_plans is missing several
// columns that both seed_licensing.js / seed_licensing_v2.js and
// licensingEnforcer.js expect to exist. None of the prior migrations
// (base, fix, schema_upgrade, v2, sandbox_fix) ever added them.
const sql = `
ALTER TABLE license_plans
  ADD COLUMN IF NOT EXISTS max_exams INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS max_storage_gb INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ai_proctoring BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_question_gen BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_branding BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_access BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_access BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_support BOOLEAN DEFAULT false;
`;

async function migrate() {
  try {
    console.log('Running licensing missing-columns fix migration...');
    await pool.query(sql);
    console.log('✅ license_plans missing columns added');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
