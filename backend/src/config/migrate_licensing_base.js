require('dotenv').config();
const { pool } = require('./database');

const sql = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- LICENSE PLANS
-- =====================================================

CREATE TABLE IF NOT EXISTS license_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(100) NOT NULL UNIQUE,

  description TEXT,

  monthly_price DECIMAL(10,2) DEFAULT 0,

  max_students INTEGER DEFAULT 100,

  max_examiners INTEGER DEFAULT 10,

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- ORGANIZATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(255) NOT NULL,

  contact_email VARCHAR(255),

  contact_person VARCHAR(255),

  phone VARCHAR(50),

  license_plan_id UUID REFERENCES license_plans(id),

  license_status VARCHAR(20) DEFAULT 'trial',

  license_expires_at TIMESTAMP,

  trial_ends_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- USER ORG LINK
-- =====================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- =====================================================
-- SANDBOX DEMOS
-- =====================================================

CREATE TABLE IF NOT EXISTS sandbox_demos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  organization_name VARCHAR(255),

  contact_email VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW(),

  expires_at TIMESTAMP,

  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_org_license_status
ON organizations(license_status);

CREATE INDEX IF NOT EXISTS idx_org_license_expiry
ON organizations(license_expires_at);
`;

async function migrate() {
  try {
    console.log('Running licensing base migration...');
    await pool.query(sql);
    console.log('✅ Licensing base migration complete');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();