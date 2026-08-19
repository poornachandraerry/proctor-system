require('dotenv').config();
const { pool } = require('./database');

// Fix for another migration-chain gap: license_plans.slug and
// organizations.slug were both added as plain columns (schema_upgrade)
// but never given a UNIQUE constraint/index. seed_licensing.js and
// seed_licensing_v2.js both rely on `ON CONFLICT (slug)`, which requires
// a unique constraint or index to exist on that column.
const sql = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_license_plans_slug_unique ON license_plans(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug_unique ON organizations(slug);
`;

async function migrate() {
  try {
    console.log('Adding unique indexes on slug columns...');
    await pool.query(sql);
    console.log('✅ Unique slug indexes created');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
