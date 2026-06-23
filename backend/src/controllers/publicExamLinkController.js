const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

// ── Look up exam by its public link token ──────────────────
// Returns enough info for the registration page to render correctly:
// title, schedule, access_type, and (if domain-restricted) the list
// of allowed domains so the frontend can show a helpful hint.
async function getExamByPublicLink(req, res) {
  try {
    const { token } = req.params;
    const examRes = await query(`
      SELECT e.id, e.title, e.description, e.instructions, e.start_time,
        e.duration_minutes, e.status, e.access_type, e.registration_open,
        o.name as org_name
      FROM exams e
      LEFT JOIN users creator ON e.created_by = creator.id
      LEFT JOIN organizations o ON creator.org_id = o.id
      WHERE e.public_link_token = $1
    `, [token]);

    if (!examRes.rows.length) return res.status(404).json({ error: 'Invalid or expired exam link' });
    const exam = examRes.rows[0];

    if (exam.status !== 'published') {
      return res.status(410).json({ error: 'This exam is not currently available for registration' });
    }
    if (exam.registration_open === false) {
      return res.status(410).json({ error: 'Registration for this exam has been closed by the examiner' });
    }

    let allowedDomains = [];
    if (exam.access_type === 'domain_whitelist') {
      const domRes = await query('SELECT domain FROM exam_domain_whitelist WHERE exam_id=$1', [exam.id]);
      allowedDomains = domRes.rows.map(r => r.domain);
    }

    res.json({
      examId: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      startTime: exam.start_time,
      durationMinutes: exam.duration_minutes,
      accessType: exam.access_type,
      allowedDomains,
      orgName: exam.org_name,
    });
  } catch (err) {
    logger.error('getExamByPublicLink:', err.message);
    res.status(500).json({ error: 'Failed to load exam details' });
  }
}

// ── Validate a candidate email against the exam's access rules ──
// Called live as the visitor types their email, before they submit
// the full registration form, so they get instant feedback.
async function validateEmailForPublicLink(req, res) {
  try {
    const { token } = req.params;
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ allowed: false, reason: 'Enter a valid email address' });

    const examRes = await query('SELECT id, access_type FROM exams WHERE public_link_token=$1', [token]);
    if (!examRes.rows.length) return res.status(404).json({ allowed: false, reason: 'Invalid exam link' });
    const exam = examRes.rows[0];

    if (exam.access_type === 'open') {
      return res.json({ allowed: true });
    }

    if (exam.access_type === 'domain_whitelist') {
      const domain = email.toLowerCase().split('@')[1];
      const domRes = await query(
        'SELECT 1 FROM exam_domain_whitelist WHERE exam_id=$1 AND domain=$2',
        [exam.id, domain]
      );
      if (!domRes.rows.length) {
        const allDomains = await query('SELECT domain FROM exam_domain_whitelist WHERE exam_id=$1', [exam.id]);
        const list = allDomains.rows.map(r => '@' + r.domain).join(', ');
        return res.json({
          allowed: false,
          reason: `Only emails from ${list || 'an approved domain'} can register for this exam`,
        });
      }
      return res.json({ allowed: true });
    }

    if (exam.access_type === 'email_whitelist') {
      const wlRes = await query(
        'SELECT 1 FROM exam_email_whitelist WHERE exam_id=$1 AND email=$2',
        [exam.id, email.toLowerCase()]
      );
      if (!wlRes.rows.length) {
        return res.json({ allowed: false, reason: 'This email is not on the invited candidates list. Please use the link sent to your invited email address, or contact the examiner.' });
      }
      return res.json({ allowed: true });
    }

    return res.json({ allowed: true });
  } catch (err) {
    logger.error('validateEmailForPublicLink:', err.message);
    res.status(500).json({ allowed: false, reason: 'Validation failed, please try again' });
  }
}

// ── Self-signup + auto-enroll via public link ──────────────
async function registerViaPublicLink(req, res) {
  try {
    const { token } = req.params;
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email and password are all required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const examRes = await query(`
      SELECT e.id, e.title, e.status, e.registration_open, e.access_type, e.created_by,
        creator.org_id as creator_org_id
      FROM exams e
      LEFT JOIN users creator ON e.created_by = creator.id
      WHERE e.public_link_token = $1
    `, [token]);
    if (!examRes.rows.length) return res.status(404).json({ error: 'Invalid or expired exam link' });
    const exam = examRes.rows[0];

    if (exam.status !== 'published') return res.status(410).json({ error: 'This exam is not currently open for registration' });
    if (exam.registration_open === false) return res.status(410).json({ error: 'Registration for this exam has been closed' });

    const normalizedEmail = email.toLowerCase().trim();

    // ── Re-validate access rules server-side (never trust the client) ──
    if (exam.access_type === 'domain_whitelist') {
      const domain = normalizedEmail.split('@')[1];
      const domRes = await query(
        'SELECT 1 FROM exam_domain_whitelist WHERE exam_id=$1 AND domain=$2',
        [exam.id, domain]
      );
      if (!domRes.rows.length) {
        return res.status(403).json({ error: `Your email domain (@${domain}) is not authorised to register for this exam` });
      }
    } else if (exam.access_type === 'email_whitelist') {
      const wlRes = await query(
        'SELECT 1 FROM exam_email_whitelist WHERE exam_id=$1 AND email=$2',
        [exam.id, normalizedEmail]
      );
      if (!wlRes.rows.length) {
        return res.status(403).json({ error: 'This email is not on the invited candidates list for this exam' });
      }
    }
    // access_type === 'open' → no restriction, anyone may register

    // ── Find or create the student account ──────────────────
    let userRes = await query('SELECT id, password_hash, org_id FROM users WHERE email=$1', [normalizedEmail]);
    let userId;

    if (userRes.rows.length) {
      // Existing account — verify password matches before enrolling
      const existing = userRes.rows[0];
      const validPwd = await bcrypt.compare(password, existing.password_hash);
      if (!validPwd) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please enter the correct password for this email, or use a different email address.',
        });
      }
      userId = existing.id;
    } else {
      const hash = await bcrypt.hash(password, 12);
      // New self-signed-up students inherit the exam creator's org when the
      // exam is org-scoped (open access within an org); this keeps them
      // visible to that org's examiners/org_admin for future management.
      const assignedOrgId = exam.access_type === 'open' ? exam.creator_org_id : null;
      const newUser = await query(`
        INSERT INTO users (email, password_hash, first_name, last_name, role, org_id, is_email_verified, is_active)
        VALUES ($1,$2,$3,$4,'student',$5,true,true) RETURNING id
      `, [normalizedEmail, hash, firstName, lastName, assignedOrgId]);
      userId = newUser.rows[0].id;
    }

    // ── Enroll in the exam (idempotent) ──────────────────────
    await query(
      'INSERT INTO exam_enrollments (exam_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [exam.id, userId]
    );

    // If they were on an email whitelist, mark as registered
    if (exam.access_type === 'email_whitelist') {
      await query(
        'UPDATE exam_email_whitelist SET registered=true WHERE exam_id=$1 AND email=$2',
        [exam.id, normalizedEmail]
      );
    }

    res.json({
      message: 'Registration successful! You can now log in and take this exam.',
      examId: exam.id,
      examTitle: exam.title,
      email: normalizedEmail,
    });
  } catch (err) {
    logger.error('registerViaPublicLink:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
}

module.exports = {
  getExamByPublicLink,
  validateEmailForPublicLink,
  registerViaPublicLink,
};
