require('dotenv').config();
const { pool } = require('./database');

const sql = `
-- Add concurrent session limit and INR pricing to license_plans
ALTER TABLE license_plans
  ADD COLUMN IF NOT EXISTS max_concurrent_sessions INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_active_exams INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(5) DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS price_setup DECIMAL(10,2) DEFAULT 0;

-- Add org-level concurrent tracking
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_concurrent_override INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_students_override INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_examiners_override INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_active_exams_override INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(15),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- Concurrent session tracking table (live monitoring)
CREATE TABLE IF NOT EXISTS concurrent_session_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_concurrent_org_active
  ON concurrent_session_log(org_id, is_active);

-- License usage snapshots (for analytics)
CREATE TABLE IF NOT EXISTS license_usage_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMP DEFAULT NOW(),
  concurrent_sessions INTEGER DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  total_examiners INTEGER DEFAULT 0,
  active_exams INTEGER DEFAULT 0
);

-- GST invoices (Indian market compliance)
CREATE TABLE IF NOT EXISTS gst_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE DEFAULT CURRENT_DATE,
  billing_period_start DATE,
  billing_period_end DATE,
  plan_name VARCHAR(100),
  base_amount DECIMAL(10,2) NOT NULL,
  cgst_rate DECIMAL(5,2) DEFAULT 9.00,
  sgst_rate DECIMAL(5,2) DEFAULT 9.00,
  igst_rate DECIMAL(5,2) DEFAULT 0.00,
  cgst_amount DECIMAL(10,2) DEFAULT 0,
  sgst_amount DECIMAL(10,2) DEFAULT 0,
  igst_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_reference VARCHAR(100),
  paid_at TIMESTAMP,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gst_invoices_org ON gst_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_gst_invoices_status ON gst_invoices(status);
`;

async function migrate() {
  try {
    console.log('Running licensing v2 migrations (INR + concurrent)...');
    await pool.query(sql);
    console.log('✅ Licensing v2 tables created!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
