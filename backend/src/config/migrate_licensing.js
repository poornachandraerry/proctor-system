require('dotenv').config();
const { pool } = require('./database');

const sql = `
-- License Plans (what you sell)
CREATE TABLE IF NOT EXISTS license_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0,
  max_examiners INTEGER DEFAULT 5,
  max_students INTEGER DEFAULT 100,
  max_exams INTEGER DEFAULT 20,
  max_storage_gb INTEGER DEFAULT 5,
  ai_proctoring BOOLEAN DEFAULT false,
  ai_question_gen BOOLEAN DEFAULT false,
  custom_branding BOOLEAN DEFAULT false,
  sandbox_access BOOLEAN DEFAULT false,
  api_access BOOLEAN DEFAULT false,
  priority_support BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organizations / Client Tenants
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  domain VARCHAR(255),
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#6366f1',
  contact_name VARCHAR(200),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(30),
  address TEXT,
  country VARCHAR(100),
  plan_id UUID REFERENCES license_plans(id),
  license_key VARCHAR(64) UNIQUE,
  license_status VARCHAR(20) DEFAULT 'trial' CHECK (license_status IN ('trial','active','suspended','expired','cancelled')),
  license_starts_at TIMESTAMP DEFAULT NOW(),
  license_expires_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  billing_cycle VARCHAR(10) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  seats_used_examiners INTEGER DEFAULT 0,
  seats_used_students INTEGER DEFAULT 0,
  is_sandbox BOOLEAN DEFAULT false,
  sandbox_expires_at TIMESTAMP,
  sandbox_created_by UUID,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add org_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- License invoices / payments tracking
CREATE TABLE IF NOT EXISTS license_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES license_plans(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  billing_period_start TIMESTAMP,
  billing_period_end TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled','refunded')),
  invoice_number VARCHAR(50) UNIQUE,
  notes TEXT,
  paid_at TIMESTAMP,
  due_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature flags per org (overrides)
CREATE TABLE IF NOT EXISTS org_feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL,
  feature_value JSONB DEFAULT 'true',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, feature_key)
);

-- Org activity logs
CREATE TABLE IF NOT EXISTS org_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sandbox demos
CREATE TABLE IF NOT EXISTS sandbox_demos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  demo_name VARCHAR(200) NOT NULL,
  demo_url_token VARCHAR(64) UNIQUE NOT NULL,
  welcome_message TEXT,
  preset_type VARCHAR(30) DEFAULT 'standard',
  is_active BOOLEAN DEFAULT true,
  access_count INTEGER DEFAULT 0,
  max_accesses INTEGER DEFAULT 50,
  expires_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_orgs_license_status ON organizations(license_status);
CREATE INDEX IF NOT EXISTS idx_orgs_plan ON organizations(plan_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON license_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_token ON sandbox_demos(demo_url_token);

-- Update trigger for orgs
DO $$ BEGIN
  CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

async function migrate() {
  try {
    console.log('Running licensing migrations...');
    await pool.query(sql);
    console.log('✅ Licensing tables created!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
