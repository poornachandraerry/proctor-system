const { query, transaction } = require('../config/database');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getOrgUsageStats } = require('../services/licensingEnforcer');

// ── Helpers ────────────────────────────────────────────────
function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// ── PLANS ──────────────────────────────────────────────────
async function getPlans(req, res) {
  try {
    const r = await query('SELECT * FROM license_plans WHERE is_active=true ORDER BY price_monthly ASC');
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch plans' }); }
}

async function createPlan(req, res) {
  try {
    const {
      name, slug, description, priceMonthly, priceYearly, priceSetup,
      maxExaminers, maxStudents, maxConcurrentSessions, maxActiveExams,
      maxStorageGb, aiProctoring, aiQuestionGen, customBranding,
      sandboxAccess, apiAccess, prioritySupport
    } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
    const r = await query(`
      INSERT INTO license_plans (
        name, slug, description, price_monthly, price_yearly, price_setup,
        max_examiners, max_students, max_concurrent_sessions, max_active_exams,
        max_storage_gb, currency, ai_proctoring, ai_question_gen,
        custom_branding, sandbox_access, api_access, priority_support
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'INR',$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [name, slug, description,
        priceMonthly||0, priceYearly||0, priceSetup||0,
        maxExaminers||5, maxStudents||100, maxConcurrentSessions||50, maxActiveExams||30,
        maxStorageGb||5,
        aiProctoring||false, aiQuestionGen||false, customBranding||false,
        sandboxAccess||false, apiAccess||false, prioritySupport||false]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Plan slug already exists' });
    res.status(500).json({ error: 'Failed to create plan' });
  }
}

async function updatePlan(req, res) {
  try {
    const { id } = req.params;
    const map = {
      name:'name', description:'description', priceMonthly:'price_monthly',
      priceYearly:'price_yearly', priceSetup:'price_setup',
      maxExaminers:'max_examiners', maxStudents:'max_students',
      maxConcurrentSessions:'max_concurrent_sessions', maxActiveExams:'max_active_exams',
      maxStorageGb:'max_storage_gb', aiProctoring:'ai_proctoring',
      aiQuestionGen:'ai_question_gen', customBranding:'custom_branding',
      sandboxAccess:'sandbox_access', apiAccess:'api_access',
      prioritySupport:'priority_support', isActive:'is_active'
    };
    const sets = [], vals = [];
    for (const [k, col] of Object.entries(map)) {
      if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${col}=$${vals.length}`); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(id);
    const r = await query(`UPDATE license_plans SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to update plan' }); }
}

// ── ORGANIZATIONS ──────────────────────────────────────────
async function getOrgs(req, res) {
  try {
    const { status, page=1, limit=20 } = req.query;
    const offset = (page-1)*limit;
    const conditions = ['1=1'];
    const params = [];
    if (status) { params.push(status); conditions.push(`o.license_status=$${params.length}`); }
    const where = 'WHERE ' + conditions.join(' AND ');
    params.push(limit, offset);
    const r = await query(`
      SELECT o.*,
        lp.name as plan_name, lp.price_monthly, lp.currency,
        lp.max_concurrent_sessions, lp.max_students, lp.max_examiners, lp.max_active_exams,
        COALESCE(o.max_concurrent_override, lp.max_concurrent_sessions) as effective_concurrent,
        COALESCE(o.max_students_override,   lp.max_students)            as effective_students,
        (SELECT COUNT(*) FROM users WHERE org_id=o.id) as user_count,
        (SELECT COUNT(*) FROM users WHERE org_id=o.id AND role='student')  as student_count,
        (SELECT COUNT(*) FROM users WHERE org_id=o.id AND role='examiner') as examiner_count,
        (SELECT COUNT(*) FROM exam_sessions es JOIN users u ON es.user_id=u.id
           WHERE u.org_id=o.id AND es.status='active') as live_sessions
      FROM organizations o
      LEFT JOIN license_plans lp ON o.plan_id=lp.id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    const cnt = await query(`SELECT COUNT(*) FROM organizations o ${where}`, params.slice(0,-2));
    res.json({ orgs: r.rows, total: parseInt(cnt.rows[0].count) });
  } catch (err) {
    logger.error('getOrgs:', err.message);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
}

async function getOrg(req, res) {
  try {
    const r = await query(`
      SELECT o.*,
        lp.name as plan_name, lp.currency, lp.price_monthly, lp.price_yearly,
        lp.max_examiners, lp.max_students, lp.max_concurrent_sessions, lp.max_active_exams,
        lp.ai_proctoring, lp.ai_question_gen, lp.custom_branding,
        lp.sandbox_access, lp.api_access, lp.priority_support,
        COALESCE(o.max_concurrent_override, lp.max_concurrent_sessions) as effective_concurrent,
        COALESCE(o.max_students_override,   lp.max_students)            as effective_students,
        COALESCE(o.max_examiners_override,  lp.max_examiners)           as effective_examiners,
        COALESCE(o.max_active_exams_override,lp.max_active_exams)       as effective_active_exams
      FROM organizations o
      LEFT JOIN license_plans lp ON o.plan_id=lp.id
      WHERE o.id=$1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Organization not found' });
    const org = r.rows[0];
    // Live usage stats
    const usage = await getOrgUsageStats(org.id);
    res.json({ ...org, usage });
  } catch { res.status(500).json({ error: 'Failed to fetch org' }); }
}

async function createOrg(req, res) {
  try {
    const {
      name, slug, domain, contactName, contactEmail, contactPhone,
      address, city, state, country, pincode, gstNumber, panNumber,
      planId, billingCycle, trialDays, notes
    } = req.body;
    if (!name || !slug || !planId) return res.status(400).json({ error: 'Name, slug and plan required' });
    const licKey  = crypto.randomBytes(24).toString('hex').toUpperCase();
    const trialEnd = new Date(Date.now() + (parseInt(trialDays)||14)*86400000);
    const r = await query(`
      INSERT INTO organizations (
        name, slug, domain, contact_name, contact_email, contact_phone,
        address, city, state, country, pincode, gst_number, pan_number,
        plan_id, license_key, license_status, license_starts_at,
        trial_ends_at, billing_cycle, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'trial',NOW(),$16,$17,$18,$19)
      RETURNING *
    `, [name, slug, domain, contactName, contactEmail, contactPhone,
        address, city, state, country||'India', pincode, gstNumber, panNumber,
        planId, licKey, trialEnd, billingCycle||'monthly', notes, req.user.id]);
    await query('INSERT INTO org_activity_logs (org_id, user_id, action, details) VALUES ($1,$2,$3,$4)',
      [r.rows[0].id, req.user.id, 'org_created', JSON.stringify({ name, planId })]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Organisation slug already exists' });
    logger.error('createOrg:', err.message);
    res.status(500).json({ error: 'Failed to create organization' });
  }
}

async function updateOrg(req, res) {
  try {
    const { id } = req.params;
    const {
      name, domain, contactName, contactEmail, contactPhone,
      address, city, state, country, pincode, gstNumber, panNumber,
      planId, licenseStatus, licenseExpiresAt, billingCycle, notes, primaryColor,
      maxConcurrentOverride, maxStudentsOverride, maxExaminersOverride, maxActiveExamsOverride
    } = req.body;
    await query(`
      UPDATE organizations SET
        name=COALESCE($1,name), domain=COALESCE($2,domain),
        contact_name=COALESCE($3,contact_name), contact_email=COALESCE($4,contact_email),
        contact_phone=COALESCE($5,contact_phone), address=COALESCE($6,address),
        city=COALESCE($7,city), state=COALESCE($8,state), country=COALESCE($9,country),
        pincode=COALESCE($10,pincode), gst_number=COALESCE($11,gst_number),
        pan_number=COALESCE($12,pan_number), plan_id=COALESCE($13,plan_id),
        license_status=COALESCE($14,license_status),
        license_expires_at=COALESCE($15,license_expires_at),
        billing_cycle=COALESCE($16,billing_cycle), notes=COALESCE($17,notes),
        primary_color=COALESCE($18,primary_color),
        max_concurrent_override=COALESCE($19,max_concurrent_override),
        max_students_override=COALESCE($20,max_students_override),
        max_examiners_override=COALESCE($21,max_examiners_override),
        max_active_exams_override=COALESCE($22,max_active_exams_override),
        updated_at=NOW()
      WHERE id=$23
    `, [name, domain, contactName, contactEmail, contactPhone,
        address, city, state, country, pincode, gstNumber, panNumber,
        planId, licenseStatus, licenseExpiresAt, billingCycle, notes, primaryColor,
        maxConcurrentOverride||null, maxStudentsOverride||null,
        maxExaminersOverride||null, maxActiveExamsOverride||null, id]);
    await query('INSERT INTO org_activity_logs (org_id,user_id,action) VALUES ($1,$2,$3)',
      [id, req.user.id, 'org_updated']);
    res.json({ message: 'Organization updated' });
  } catch { res.status(500).json({ error: 'Failed to update organization' }); }
}

async function suspendOrg(req, res) {
  try {
    const { id } = req.params;
    await query("UPDATE organizations SET license_status='suspended',updated_at=NOW() WHERE id=$1", [id]);
    // Terminate all active sessions
    await query(`
      UPDATE exam_sessions SET status='terminated', proctor_notes='Organisation suspended'
      WHERE status='active' AND user_id IN (SELECT id FROM users WHERE org_id=$1)
    `, [id]);
    await query('INSERT INTO org_activity_logs (org_id,user_id,action,details) VALUES ($1,$2,$3,$4)',
      [id, req.user.id, 'org_suspended', JSON.stringify({ reason: req.body.reason })]);
    res.json({ message: 'Organization suspended' });
  } catch { res.status(500).json({ error: 'Failed to suspend' }); }
}

async function activateOrg(req, res) {
  try {
    const { id } = req.params;
    const { expiresAt } = req.body;
    await query(
      "UPDATE organizations SET license_status='active', license_expires_at=COALESCE($1,license_expires_at), updated_at=NOW() WHERE id=$2",
      [expiresAt||null, id]
    );
    await query('INSERT INTO org_activity_logs (org_id,user_id,action) VALUES ($1,$2,$3)',
      [id, req.user.id, 'org_activated']);
    res.json({ message: 'Organization activated' });
  } catch { res.status(500).json({ error: 'Failed to activate' }); }
}

async function regenerateLicenseKey(req, res) {
  try {
    const { id } = req.params;
    const newKey = crypto.randomBytes(24).toString('hex').toUpperCase();
    await query('UPDATE organizations SET license_key=$1,updated_at=NOW() WHERE id=$2', [newKey, id]);
    res.json({ licenseKey: newKey });
  } catch { res.status(500).json({ error: 'Failed to regenerate key' }); }
}

// ── LIVE USAGE (concurrent meter) ─────────────────────────
async function getOrgLiveUsage(req, res) {
  try {
    const { id } = req.params;
    const org = await query(`
      SELECT o.id, o.name,
        COALESCE(o.max_concurrent_override, lp.max_concurrent_sessions) as max_concurrent,
        COALESCE(o.max_students_override,   lp.max_students)            as max_students,
        COALESCE(o.max_examiners_override,  lp.max_examiners)           as max_examiners,
        COALESCE(o.max_active_exams_override,lp.max_active_exams)       as max_active_exams
      FROM organizations o JOIN license_plans lp ON o.plan_id=lp.id WHERE o.id=$1
    `, [id]);
    if (!org.rows.length) return res.status(404).json({ error: 'Org not found' });
    const limits = org.rows[0];
    const usage  = await getOrgUsageStats(id);
    // Live session details
    const liveSessions = await query(`
      SELECT es.id, es.started_at, es.risk_score,
        u.first_name || ' ' || u.last_name as student_name,
        e.title as exam_title
      FROM exam_sessions es
      JOIN users u ON es.user_id=u.id
      JOIN exams e ON es.exam_id=e.id
      WHERE u.org_id=$1 AND es.status='active'
      ORDER BY es.started_at DESC
    `, [id]);
    res.json({ limits, usage, liveSessions: liveSessions.rows });
  } catch { res.status(500).json({ error: 'Failed to get live usage' }); }
}

// ── SANDBOX ────────────────────────────────────────────────
async function createSandbox(req, res) {
  try {
    const { orgId, demoName, welcomeMessage, presetType, expiresInDays, maxAccesses } = req.body;
    if (!orgId || !demoName) return res.status(400).json({ error: 'orgId and demoName required' });
    const token     = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + (expiresInDays||7)*86400000);
    await query(
      "UPDATE organizations SET is_sandbox=true, sandbox_expires_at=$1, sandbox_created_by=$2 WHERE id=$3",
      [expiresAt, req.user.id, orgId]
    );
    const r = await query(`
      INSERT INTO sandbox_demos (org_id, demo_name, demo_url_token, welcome_message, preset_type, expires_at, max_accesses, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [orgId, demoName, token, welcomeMessage, presetType||'standard', expiresAt, maxAccesses||50, req.user.id]);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.status(201).json({ ...r.rows[0], demoUrl: `${baseUrl}/demo/${token}` });
  } catch (err) {
    logger.error('createSandbox:', err.message);
    res.status(500).json({ error: 'Failed to create sandbox' });
  }
}

async function getSandboxes(req, res) {
  try {
    const { orgId } = req.query;
    const where  = orgId ? 'WHERE sd.org_id=$1' : '';
    const params = orgId ? [orgId] : [];
    const r = await query(`
      SELECT sd.*, o.name as org_name,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM sandbox_demos sd
      JOIN organizations o ON sd.org_id=o.id
      LEFT JOIN users u ON sd.created_by=u.id
      ${where} ORDER BY sd.created_at DESC
    `, params);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.json(r.rows.map(s => ({ ...s, demoUrl: `${baseUrl}/demo/${s.demo_url_token}` })));
  } catch { res.status(500).json({ error: 'Failed to fetch sandboxes' }); }
}

async function accessSandbox(req, res) {
  try {
    const { token } = req.params;
    const r = await query(`
      SELECT sd.*, o.name as org_name, o.primary_color, o.logo_url,
        lp.ai_proctoring, lp.ai_question_gen
      FROM sandbox_demos sd
      JOIN organizations o ON sd.org_id=o.id
      LEFT JOIN license_plans lp ON o.plan_id=lp.id
      WHERE sd.demo_url_token=$1 AND sd.is_active=true
    `, [token]);
    if (!r.rows.length) return res.status(404).json({ error: 'Demo not found or disabled' });
    const demo = r.rows[0];
    if (demo.expires_at && new Date(demo.expires_at) < new Date())
      return res.status(410).json({ error: 'This demo link has expired' });
    if (demo.access_count >= demo.max_accesses)
      return res.status(429).json({ error: 'Demo access limit reached' });
    await query('UPDATE sandbox_demos SET access_count=access_count+1 WHERE id=$1', [demo.id]);
    res.json(demo);
  } catch { res.status(500).json({ error: 'Failed to access sandbox' }); }
}

async function toggleSandbox(req, res) {
  try {
    const { id } = req.params;
    const r = await query('SELECT is_active FROM sandbox_demos WHERE id=$1', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const newState = !r.rows[0].is_active;
    await query('UPDATE sandbox_demos SET is_active=$1 WHERE id=$2', [newState, id]);
    res.json({ isActive: newState });
  } catch { res.status(500).json({ error: 'Failed to toggle sandbox' }); }
}

// ── GST INVOICES ───────────────────────────────────────────
async function getInvoices(req, res) {
  try {
    const { orgId } = req.query;
    const where  = orgId ? 'WHERE gi.org_id=$1' : '';
    const params = orgId ? [orgId] : [];
    const r = await query(`
      SELECT gi.*, o.name as org_name, o.gst_number, o.state
      FROM gst_invoices gi
      JOIN organizations o ON gi.org_id=o.id
      ${where} ORDER BY gi.created_at DESC LIMIT 200
    `, params);
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch invoices' }); }
}

async function createInvoice(req, res) {
  try {
    const { orgId, planName, baseAmount, billingStart, billingEnd, dueDate, notes, isIgst } = req.body;
    if (!orgId || !baseAmount) return res.status(400).json({ error: 'orgId and baseAmount required' });
    const invNum  = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const base    = parseFloat(baseAmount);
    const cgst    = isIgst ? 0 : base * 0.09;
    const sgst    = isIgst ? 0 : base * 0.09;
    const igst    = isIgst ? base * 0.18 : 0;
    const total   = base + cgst + sgst + igst;
    const r = await query(`
      INSERT INTO gst_invoices (
        org_id,
        invoice_number,
        plan_name,
        base_amount,
        cgst_rate,
        sgst_rate,
        igst_rate,
        cgst_amount,
        sgst_amount,
        igst_amount,
        total_amount,
        billing_period_start,
        billing_period_end,
        due_date,
        notes
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,
        $8,$9,$10,
        $11,$12,$13,$14,$15
      )
      RETURNING *
    `, [
      orgId,
      invNum,
      planName,
      base,
      isIgst ? 0 : 9,
      isIgst ? 0 : 9,
      isIgst ? 18 : 0,
      cgst,
      sgst,
      igst,
      total,
      billingStart,
      billingEnd,
      dueDate,
      notes
    ]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    logger.error('createInvoice:', err.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
}

async function markInvoicePaid(req, res) {
  try {
    const { id } = req.params;
    const { paymentMethod, paymentReference } = req.body;
    await query(
      "UPDATE gst_invoices SET status='paid', paid_at=NOW(), payment_method=$1, payment_reference=$2 WHERE id=$3",
      [paymentMethod, paymentReference, id]
    );
    res.json({ message: 'Invoice marked as paid' });
  } catch { res.status(500).json({ error: 'Failed to update invoice' }); }
}

// ── OVERVIEW ───────────────────────────────────────────────
async function getLicensingOverview(req, res) {
  try {
    const [orgsByStatus, revenue, expiring, sandboxes, topOrgs] = await Promise.all([
      query(`SELECT license_status, COUNT(*) as count FROM organizations GROUP BY license_status`),
      query(`SELECT
        COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM NOW()) THEN total_amount END),0) as this_month,
        COALESCE(SUM(CASE WHEN status='paid' THEN total_amount END),0) as total_collected,
        COALESCE(SUM(CASE WHEN status='pending' THEN total_amount END),0) as pending
        FROM gst_invoices`),
      query(`SELECT id, name, license_expires_at, license_status, trial_ends_at
        FROM organizations
        WHERE (license_expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days')
           OR (license_status='trial' AND trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '7 days')
        ORDER BY LEAST(COALESCE(license_expires_at,'9999-01-01'), COALESCE(trial_ends_at,'9999-01-01')) ASC
        LIMIT 8`),
      query(`SELECT COUNT(*) as count FROM sandbox_demos WHERE is_active=true AND expires_at > NOW()`),
      query(`SELECT o.name, o.license_status,
        (SELECT COUNT(*) FROM exam_sessions es JOIN users u ON es.user_id=u.id WHERE u.org_id=o.id AND es.status='active') as live_sessions
        FROM organizations o ORDER BY live_sessions DESC LIMIT 5`),
    ]);
    res.json({
      orgsByStatus:      orgsByStatus.rows,
      revenue:           revenue.rows[0],
      expiringLicenses:  expiring.rows,
      activeSandboxes:   parseInt(sandboxes.rows[0].count),
      topOrgs:           topOrgs.rows,
    });
  } catch (err) {
    logger.error('getLicensingOverview:', err.message);
    res.status(500).json({ error: 'Failed to get overview' });
  }
}

module.exports = {
  getPlans, createPlan, updatePlan,
  getOrgs, getOrg, createOrg, updateOrg, suspendOrg, activateOrg, regenerateLicenseKey,
  getOrgLiveUsage,
  createSandbox, getSandboxes, accessSandbox, toggleSandbox,
  getInvoices, createInvoice, markInvoicePaid,
  getLicensingOverview,
};

// Create org admin credentials for a given org
async function createOrgAdminUser(req, res) {
  try {
    const { id } = req.params; // org id
    const { email, firstName, lastName, phone } = req.body;
    if (!email || !firstName || !lastName) return res.status(400).json({ error: 'Email, first and last name required' });

    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const existing = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const tempPassword = crypto.randomBytes(6).toString('hex') + 'Org1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const result = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, org_id, phone, is_email_verified, is_active)
      VALUES ($1,$2,$3,$4,'org_admin',$5,$6,true,true)
      RETURNING id, email, first_name, last_name, role
    `, [email.toLowerCase(), passwordHash, firstName, lastName, id, phone||null]);

    await query('INSERT INTO org_activity_logs (org_id,user_id,action,details) VALUES ($1,$2,$3,$4)',
      [id, req.user.id, 'org_admin_created', JSON.stringify({ email })]);

    res.status(201).json({ user: result.rows[0], tempPassword, message: `Org admin created. Share these credentials with ${firstName}.` });
  } catch (err) {
    logger.error('createOrgAdminUser:', err.message);
    res.status(500).json({ error: 'Failed to create org admin' });
  }
}

module.exports = Object.assign(module.exports, { createOrgAdminUser });
