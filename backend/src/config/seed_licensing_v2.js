require('dotenv').config();
const { pool } = require('./database');

async function seed() {
  try {
    console.log('Seeding Option C INR plans...');

    const plans = [
      {
        name: 'Free Trial',
        slug: 'trial',
        description: '14-day fully featured trial. No credit card required.',
        price_monthly: 0, price_yearly: 0, price_setup: 0,
        max_examiners: 2, max_students: 50,
        max_concurrent_sessions: 10, max_active_exams: 5,
        max_storage_gb: 1,
        ai_proctoring: true, ai_question_gen: true,
        custom_branding: false, sandbox_access: true,
        api_access: false, priority_support: false,
      },
      {
        name: 'Starter',
        slug: 'starter',
        description: 'Perfect for small coaching centres, training institutes and schools.',
        price_monthly: 3999, price_yearly: 39990, price_setup: 0,
        max_examiners: 5, max_students: 500,
        max_concurrent_sessions: 50, max_active_exams: 30,
        max_storage_gb: 10,
        ai_proctoring: true, ai_question_gen: false,
        custom_branding: false, sandbox_access: true,
        api_access: false, priority_support: false,
      },
      {
        name: 'Professional',
        slug: 'professional',
        description: 'For mid-size colleges, universities and corporate training teams.',
        price_monthly: 11999, price_yearly: 119990, price_setup: 0,
        max_examiners: 20, max_students: 2000,
        max_concurrent_sessions: 200, max_active_exams: 9999,
        max_storage_gb: 50,
        ai_proctoring: true, ai_question_gen: true,
        custom_branding: true, sandbox_access: true,
        api_access: false, priority_support: false,
      },
      {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'Unlimited scale for large universities, government bodies and corporates.',
        price_monthly: 39999, price_yearly: 399990, price_setup: 25000,
        max_examiners: 9999, max_students: 99999,
        max_concurrent_sessions: 9999, max_active_exams: 9999,
        max_storage_gb: 500,
        ai_proctoring: true, ai_question_gen: true,
        custom_branding: true, sandbox_access: true,
        api_access: true, priority_support: true,
      },
      {
        name: 'Sandbox Demo',
        slug: 'sandbox',
        description: 'Demo environment for prospect evaluation only.',
        price_monthly: 0, price_yearly: 0, price_setup: 0,
        max_examiners: 3, max_students: 20,
        max_concurrent_sessions: 10, max_active_exams: 5,
        max_storage_gb: 1,
        ai_proctoring: true, ai_question_gen: true,
        custom_branding: false, sandbox_access: true,
        api_access: false, priority_support: false,
      },
    ];

    // UPSERT each plan by slug — never deletes, so foreign keys stay intact
    for (const p of plans) {
      await pool.query(`
        INSERT INTO license_plans (
          name, slug, description,
          price_monthly, price_yearly, price_setup,
          max_examiners, max_students,
          max_concurrent_sessions, max_active_exams,
          max_storage_gb, currency,
          ai_proctoring, ai_question_gen, custom_branding,
          sandbox_access, api_access, priority_support,
          is_active
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'INR',$12,$13,$14,$15,$16,$17,true)
        ON CONFLICT (slug) DO UPDATE SET
          name                   = EXCLUDED.name,
          description            = EXCLUDED.description,
          price_monthly          = EXCLUDED.price_monthly,
          price_yearly           = EXCLUDED.price_yearly,
          price_setup            = EXCLUDED.price_setup,
          max_examiners          = EXCLUDED.max_examiners,
          max_students           = EXCLUDED.max_students,
          max_concurrent_sessions= EXCLUDED.max_concurrent_sessions,
          max_active_exams       = EXCLUDED.max_active_exams,
          max_storage_gb         = EXCLUDED.max_storage_gb,
          currency               = 'INR',
          ai_proctoring          = EXCLUDED.ai_proctoring,
          ai_question_gen        = EXCLUDED.ai_question_gen,
          custom_branding        = EXCLUDED.custom_branding,
          sandbox_access         = EXCLUDED.sandbox_access,
          api_access             = EXCLUDED.api_access,
          priority_support       = EXCLUDED.priority_support,
          is_active              = true
      `, [
        p.name, p.slug, p.description,
        p.price_monthly, p.price_yearly, p.price_setup,
        p.max_examiners, p.max_students,
        p.max_concurrent_sessions, p.max_active_exams,
        p.max_storage_gb,
        p.ai_proctoring, p.ai_question_gen, p.custom_branding,
        p.sandbox_access, p.api_access, p.priority_support,
      ]);
      console.log(`  ✓ ${p.name}`);
    }

    console.log('\n✅ All 5 INR plans upserted successfully!');
    console.log('─'.repeat(55));
    console.log('Plans created/updated (INR, excl. 18% GST):');
    console.log('  Free Trial      — ₹0          (10 concurrent,  50 students)');
    console.log('  Starter         — ₹3,999/mo   (50 concurrent, 500 students)');
    console.log('  Professional    — ₹11,999/mo  (200 concurrent, 2,000 students)');
    console.log('  Enterprise      — ₹39,999/mo  (Unlimited)');
    console.log('  Sandbox Demo    — ₹0          (Demo only)');
    console.log('─'.repeat(55));
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
