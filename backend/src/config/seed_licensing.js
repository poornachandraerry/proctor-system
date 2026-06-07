require('dotenv').config();
const { pool } = require('./database');
const crypto = require('crypto');

async function seed() {
  try {
    console.log('Seeding license plans...');

    // Seed license plans
    const plans = [
      { name: 'Free Trial', slug: 'trial', desc: '14-day trial with limited features', price_m: 0, price_y: 0, examiners: 2, students: 30, exams: 5, storage: 1, ai: false, ai_q: false, brand: false, sandbox: false, api: false, support: false },
      { name: 'Starter', slug: 'starter', desc: 'Perfect for small institutes and coaching centers', price_m: 49, price_y: 490, examiners: 5, students: 200, exams: 30, storage: 10, ai: true, ai_q: false, brand: false, sandbox: true, api: false, support: false },
      { name: 'Professional', slug: 'professional', desc: 'For mid-size colleges and training organizations', price_m: 149, price_y: 1490, examiners: 20, students: 1000, exams: 200, storage: 50, ai: true, ai_q: true, brand: true, sandbox: true, api: false, support: false },
      { name: 'Enterprise', slug: 'enterprise', desc: 'Full-scale deployment for universities and large orgs', price_m: 499, price_y: 4990, examiners: 100, students: 10000, exams: 9999, storage: 500, ai: true, ai_q: true, brand: true, sandbox: true, api: true, support: true },
      { name: 'Sandbox Demo', slug: 'sandbox', desc: 'Demo environment for prospect evaluation', price_m: 0, price_y: 0, examiners: 3, students: 20, exams: 5, storage: 1, ai: true, ai_q: true, brand: false, sandbox: true, api: false, support: false },
    ];

    let planIds = {};
    for (const p of plans) {
      const r = await pool.query(`
        INSERT INTO license_plans (name, slug, description, price_monthly, price_yearly,
          max_examiners, max_students, max_exams, max_storage_gb,
          ai_proctoring, ai_question_gen, custom_branding, sandbox_access, api_access, priority_support)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (slug) DO UPDATE SET name=$1, price_monthly=$4 RETURNING id, slug
      `, [p.name, p.slug, p.desc, p.price_m, p.price_y,
          p.examiners, p.students, p.exams, p.storage,
          p.ai, p.ai_q, p.brand, p.sandbox, p.api, p.support]);
      planIds[p.slug] = r.rows[0].id;
    }
    console.log('✅ License plans seeded');

    // Get superadmin user id
    const adminRes = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    const adminId = adminRes.rows[0]?.id;

    // Create demo org
    const licKey = crypto.randomBytes(24).toString('hex');
    const demoOrg = await pool.query(`
      INSERT INTO organizations (name, slug, domain, contact_name, contact_email,
        plan_id, license_key, license_status, license_starts_at, license_expires_at,
        trial_ends_at, is_sandbox, sandbox_expires_at, sandbox_created_by, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW() + INTERVAL '30 days',
              NOW() + INTERVAL '14 days', true, NOW() + INTERVAL '7 days', $9, $9)
      ON CONFLICT (slug) DO NOTHING RETURNING id
    `, ['Demo University', 'demo-university', 'demo.proctorai.com',
        'Demo Admin', 'demo@university.edu',
        planIds['sandbox'], licKey, 'trial', adminId]);

    if (demoOrg.rows.length > 0) {
      const orgId = demoOrg.rows[0].id;
      const demoToken = crypto.randomBytes(24).toString('hex');
      await pool.query(`
        INSERT INTO sandbox_demos (org_id, demo_name, demo_url_token, welcome_message,
          preset_type, expires_at, created_by)
        VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '7 days',$6)
        ON CONFLICT DO NOTHING
      `, [orgId, 'Demo University — AI Proctoring Showcase', demoToken,
          'Welcome to ProctorAI! This is a live demo with AI proctoring enabled. Explore all features with sample data.',
          'standard', adminId]);
      console.log(`✅ Demo sandbox created`);
      console.log(`   Demo URL token: ${demoToken}`);
    }

    console.log('\n✅ Licensing seed complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Licensing seed failed:', err.message);
    process.exit(1);
  }
}
seed();
