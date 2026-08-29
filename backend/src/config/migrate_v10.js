require('dotenv').config();
const { Pool } = require('pg');

const isHostedDb =
  process.env.DB_HOST &&
  process.env.DB_HOST !== 'localhost' &&
  process.env.DB_HOST !== '127.0.0.1';

const pool = new Pool({
  host:                    process.env.DB_HOST,
  port:                    parseInt(process.env.DB_PORT) || 5432,
  database:                process.env.DB_NAME,
  user:                    process.env.DB_USER,
  password:                process.env.DB_PASSWORD,
  max:                     1,
  connectionTimeoutMillis: 15000,
  ssl: isHostedDb ? { rejectUnauthorized: false } : false,
});

const statements = [
  // Deliberately separate from users.role (admin/org_admin/examiner/student),
  // which is a PERMISSION level checked throughout the app. This is a
  // target-exam LABEL for students only — "what are you preparing for" —
  // fully admin-manageable so new ones (CAT, MAT, whatever comes next) never
  // require a code change or touch any authorization logic.
  { name: 'student_categories table', sql: `CREATE TABLE IF NOT EXISTS student_categories (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        VARCHAR(100) UNIQUE NOT NULL,
      slug        VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      is_active   BOOLEAN DEFAULT true,
      created_by  UUID REFERENCES users(id),
      created_at  TIMESTAMP DEFAULT NOW()
    )` },

  { name: 'users.category_id column',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES student_categories(id)` },

  { name: 'question_banks.target_category_id column',
    sql: `ALTER TABLE question_banks ADD COLUMN IF NOT EXISTS target_category_id UUID REFERENCES student_categories(id)` },

  // Starter set covering common Indian + international entrance/competitive
  // exams — a reasonable default, not a fixed list; admins add/rename/retire
  // these freely from the Categories admin page.
  { name: 'seed starter categories', sql: `
    INSERT INTO student_categories (name, slug, description) VALUES
      ('CAT Aspirant',  'cat',        'Common Admission Test — MBA entrance'),
      ('MAT Aspirant',  'mat',        'Management Aptitude Test — MBA entrance'),
      ('GATE Aspirant', 'gate',       'Graduate Aptitude Test in Engineering'),
      ('Bank PO/Clerk', 'bank-po',    'Bank PO and Clerk recruitment exams'),
      ('SSC Aspirant',  'ssc',        'Staff Selection Commission exams'),
      ('UPSC Aspirant', 'upsc',       'Civil Services / UPSC exams'),
      ('NEET Aspirant', 'neet',       'National Eligibility cum Entrance Test — medical'),
      ('JEE Aspirant',  'jee',        'Joint Entrance Examination — engineering'),
      ('GRE Aspirant',  'gre',        'Graduate Record Examination — study abroad'),
      ('GMAT Aspirant', 'gmat',       'Graduate Management Admission Test — study abroad')
    ON CONFLICT (slug) DO NOTHING
  ` },

  { name: 'idx_users_category', sql: `CREATE INDEX IF NOT EXISTS idx_users_category ON users(category_id)` },
  { name: 'idx_banks_category', sql: `CREATE INDEX IF NOT EXISTS idx_banks_category ON question_banks(target_category_id)` },
];

async function migrate() {
  console.log('Running v10 migration (student categories)...');
  let client;
  try {
    client = await pool.connect();
    console.log('✓ Connected\n');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  let success = 0;
  for (let i = 0; i < statements.length; i++) {
    const { name, sql } = statements[i];
    try {
      await client.query(sql);
      console.log(`✓ [${i+1}/${statements.length}] ${name}`);
      success++;
    } catch (err) {
      console.error(`✗ [${i+1}/${statements.length}] ${name} FAILED: ${err.message}`);
    }
  }

  console.log(`\n${success}/${statements.length} statements succeeded`);
  client.release();
  await pool.end();
  process.exit(success === statements.length ? 0 : 1);
}

migrate().catch(err => { console.error('❌ Unexpected error:', err); process.exit(1); });
