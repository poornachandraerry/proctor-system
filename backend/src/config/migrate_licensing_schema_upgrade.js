require('dotenv').config();
const { pool } = require('./database');

const sql = `

-- =====================================================
-- ORGANIZATIONS UPGRADE
-- =====================================================

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS plan_id UUID;

UPDATE organizations
SET plan_id = license_plan_id
WHERE plan_id IS NULL;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS domain VARCHAR(255);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India';

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS license_key VARCHAR(100);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS license_starts_at TIMESTAMP;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20);

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- =====================================================
-- LICENSE PLANS UPGRADE
-- =====================================================

ALTER TABLE license_plans
ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

ALTER TABLE license_plans
ADD COLUMN IF NOT EXISTS price_monthly DECIMAL(10,2) DEFAULT 0;

UPDATE license_plans
SET price_monthly = monthly_price
WHERE price_monthly = 0;

ALTER TABLE license_plans
ADD COLUMN IF NOT EXISTS price_yearly DECIMAL(10,2) DEFAULT 0;

ALTER TABLE license_plans
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- =====================================================
-- SANDBOX DEMOS UPGRADE
-- =====================================================

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS org_id UUID;

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS demo_name VARCHAR(255);

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS demo_url_token VARCHAR(255);

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS welcome_message TEXT;

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS preset_type VARCHAR(50);

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS max_accesses INTEGER DEFAULT 50;

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;

ALTER TABLE sandbox_demos
ADD COLUMN IF NOT EXISTS created_by UUID;

`;

async function migrate() {
  try {
    console.log('Running licensing schema upgrade...');
    await pool.query(sql);
    console.log('✅ Licensing schema upgrade completed');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();