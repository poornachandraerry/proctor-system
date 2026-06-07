require('dotenv').config();
const { pool } = require('./database');

const migrations = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'examiner', 'student')),
  organization VARCHAR(255),
  profile_picture TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  is_email_verified BOOLEAN DEFAULT false,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  instructions TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  total_marks INTEGER NOT NULL DEFAULT 100,
  pass_percentage DECIMAL(5,2) DEFAULT 40.00,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'active', 'completed', 'archived')),
  exam_type VARCHAR(20) DEFAULT 'standard',
  settings JSONB DEFAULT '{}',
  proctoring_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(30) NOT NULL,
  options JSONB,
  correct_answer JSONB,
  marks INTEGER NOT NULL DEFAULT 1,
  negative_marks DECIMAL(4,2) DEFAULT 0,
  explanation TEXT,
  difficulty VARCHAR(10) DEFAULT 'medium',
  topic VARCHAR(255),
  time_limit_seconds INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'enrolled',
  UNIQUE(exam_id, user_id)
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  ip_address VARCHAR(45),
  user_agent TEXT,
  browser_info JSONB DEFAULT '{}',
  tab_switches INTEGER DEFAULT 0,
  fullscreen_exits INTEGER DEFAULT 0,
  copy_paste_attempts INTEGER DEFAULT 0,
  focus_lost_count INTEGER DEFAULT 0,
  total_suspicious_events INTEGER DEFAULT 0,
  risk_score DECIMAL(5,2) DEFAULT 0,
  ai_analysis_summary TEXT,
  proctor_notes TEXT,
  is_flagged BOOLEAN DEFAULT false,
  face_detected_pct DECIMAL(5,2) DEFAULT 100,
  multiple_faces_detected INTEGER DEFAULT 0,
  gaze_away_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  answer_data JSONB,
  is_correct BOOLEAN,
  marks_obtained DECIMAL(6,2) DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  answered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_id, question_id)
);

CREATE TABLE IF NOT EXISTS proctoring_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) DEFAULT 'medium',
  description TEXT,
  evidence JSONB DEFAULT '{}',
  ai_confidence DECIMAL(5,2),
  is_reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  reviewer_action VARCHAR(20),
  reviewer_notes TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_screenshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  capture_type VARCHAR(20) DEFAULT 'periodic',
  ai_analysis JSONB DEFAULT '{}',
  flagged BOOLEAN DEFAULT false,
  captured_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam ON exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_proctoring_alerts_session ON proctoring_alerts(session_id);
CREATE INDEX IF NOT EXISTS idx_proctoring_alerts_exam ON proctoring_alerts(exam_id);
CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
\$\$ LANGUAGE plpgsql;

DO \$\$ BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;

DO \$\$ BEGIN
  CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;

DO \$\$ BEGIN
  CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON exam_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
`;

async function migrate() {
  try {
    console.log('Running database migrations...');
    await pool.query(migrations);
    console.log('Migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
