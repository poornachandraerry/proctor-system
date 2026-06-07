const { query, transaction } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getOrgLimits, checkStudentLimit, checkExaminerLimit } = require('../services/licensingEnforcer');

// Get org admin's own organisation details + usage
async function getMyOrg(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.query.orgId : req.user.org_id;
    if (!orgId) return res.status(400).json({ error: 'No organisation assigned' });

    const org = await query(`
      SELECT o.*, lp.name as plan_name, lp.currency,
        lp.max_examiners, lp.max_students, lp.max_concurrent_sessions,
        lp.max_active_exams, lp.ai_proctoring, lp.ai_question_gen, lp.custom_branding,
        COALESCE(o.max_concurrent_override, lp.max_concurrent_sessions) as effective_concurrent,
        COALESCE(o.max_students_override,   lp.max_students)            as effective_students,
        COALESCE(o.max_examiners_override,  lp.max_examiners)           as effective_examiners
      FROM organizations o
      JOIN license_plans lp ON o.plan_id = lp.id
      WHERE o.id = $1
    `, [orgId]);
    if (!org.rows.length) return res.status(404).json({ error: 'Organisation not found' });

    const [students, examiners, orgAdmins, activeExams, liveSessions] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE org_id=$1 AND role='student'  AND is_active=true`, [orgId]),
      query(`SELECT COUNT(*) FROM users WHERE org_id=$1 AND role='examiner' AND is_active=true`, [orgId]),
      query(`SELECT COUNT(*) FROM users WHERE org_id=$1 AND role='org_admin'AND is_active=true`, [orgId]),
      query(`SELECT COUNT(*) FROM exams e JOIN users u ON e.created_by=u.id WHERE u.org_id=$1 AND e.status IN ('published','active')`, [orgId]),
      query(`SELECT COUNT(*) FROM exam_sessions es JOIN users u ON es.user_id=u.id WHERE u.org_id=$1 AND es.status='active'`, [orgId]),
    ]);

    res.json({
      org: org.rows[0],
      usage: {
        students:   parseInt(students.rows[0].count),
        examiners:  parseInt(examiners.rows[0].count),
        orgAdmins:  parseInt(orgAdmins.rows[0].count),
        activeExams:parseInt(activeExams.rows[0].count),
        liveSessions:parseInt(liveSessions.rows[0].count),
      }
    });
  } catch (err) {
    logger.error('getMyOrg:', err);
    res.status(500).json({ error: 'Failed to get organisation' });
  }
}

// List all users in the org
async function getOrgUsers(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.query.orgId : req.user.org_id;
    const { role, search, page=1, limit=50 } = req.query;
    const offset = (page-1)*limit;
    const conditions = [`u.org_id = $1`];
    const params = [orgId];
    if (role) { params.push(role); conditions.push(`u.role = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
    params.push(limit, offset);
    const result = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role,
             u.is_active, u.created_at, u.last_login,
             u.phone, u.profile_picture
      FROM users u
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.role, u.first_name
      LIMIT $${params.length-1} OFFSET $${params.length}
    `, params);
    const cnt = await query(
      `SELECT COUNT(*) FROM users u WHERE ${conditions.join(' AND ')}`,
      params.slice(0, -2)
    );
    res.json({ users: result.rows, total: parseInt(cnt.rows[0].count) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch users' }); }
}

// Add a new user to the org (create account directly)
async function addOrgUser(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.body.orgId : req.user.org_id;
    if (!orgId) return res.status(400).json({ error: 'No organisation' });
    const { email, firstName, lastName, role='student', phone, sendInvite=false } = req.body;
    if (!email || !firstName || !lastName) return res.status(400).json({ error: 'Email, first and last name required' });
    const allowedRoles = ['student','examiner','org_admin'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    // Enforce plan limits
    const limits = await getOrgLimits(req.user.id);
    if (limits) {
      if (role === 'student') {
        const check = await checkStudentLimit(orgId, limits.max_students);
        if (!check.allowed) return res.status(429).json({ error: check.reason, code:'STUDENT_LIMIT' });
      }
      if (role === 'examiner') {
        const check = await checkExaminerLimit(orgId, limits.max_examiners);
        if (!check.allowed) return res.status(429).json({ error: check.reason, code:'EXAMINER_LIMIT' });
      }
    }

    // Check email not taken
    const existing = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    // Generate temp password
    const tempPassword = crypto.randomBytes(6).toString('hex') + 'Aa1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, org_id, phone, is_email_verified, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)
      RETURNING id, email, first_name, last_name, role, created_at
    `, [email.toLowerCase(), passwordHash, firstName, lastName, role, orgId, phone||null]);

    await query('INSERT INTO org_activity_logs (org_id,user_id,action,details) VALUES ($1,$2,$3,$4)',
      [orgId, req.user.id, 'user_added', JSON.stringify({ email, role })]);

    res.status(201).json({
      user: result.rows[0],
      tempPassword,
      message: `User created. Temporary password: ${tempPassword}`
    });
  } catch (err) {
    logger.error('addOrgUser:', err);
    res.status(500).json({ error: 'Failed to add user' });
  }
}

// Update user in org
async function updateOrgUser(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.body.orgId : req.user.org_id;
    const { id } = req.params;
    // Verify user belongs to this org
    const userCheck = await query('SELECT org_id, role FROM users WHERE id=$1', [id]);
    if (!userCheck.rows.length) return res.status(404).json({ error: 'User not found' });
    if (req.user.role !== 'admin' && userCheck.rows[0].org_id !== orgId)
      return res.status(403).json({ error: 'User not in your organisation' });

    const { firstName, lastName, phone, isActive, role } = req.body;
    await query(`
      UPDATE users SET
        first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
        phone=COALESCE($3,phone), is_active=COALESCE($4,is_active),
        role=COALESCE($5,role), updated_at=NOW()
      WHERE id=$6
    `, [firstName, lastName, phone, isActive, role, id]);

    res.json({ message: 'User updated successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to update user' }); }
}

// Remove user from org (deactivate, don't delete)
async function removeOrgUser(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.query.orgId : req.user.org_id;
    const { id } = req.params;
    const userCheck = await query('SELECT org_id, role, email FROM users WHERE id=$1', [id]);
    if (!userCheck.rows.length) return res.status(404).json({ error: 'User not found' });
    if (req.user.role !== 'admin' && userCheck.rows[0].org_id !== orgId)
      return res.status(403).json({ error: 'User not in your organisation' });
    if (userCheck.rows[0].role === 'admin')
      return res.status(403).json({ error: 'Cannot remove system admin' });

    await query('UPDATE users SET is_active=false, org_id=NULL WHERE id=$1', [id]);
    await query('INSERT INTO org_activity_logs (org_id,user_id,action,details) VALUES ($1,$2,$3,$4)',
      [orgId, req.user.id, 'user_removed', JSON.stringify({ removedUserId: id, email: userCheck.rows[0].email })]);
    res.json({ message: 'User removed from organisation' });
  } catch (err) { res.status(500).json({ error: 'Failed to remove user' }); }
}

// Reset a user's password (org admin sets temp password)
async function resetUserPassword(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.body.orgId : req.user.org_id;
    const { id } = req.params;
    const userCheck = await query('SELECT org_id FROM users WHERE id=$1', [id]);
    if (!userCheck.rows.length) return res.status(404).json({ error: 'User not found' });
    if (req.user.role !== 'admin' && userCheck.rows[0].org_id !== orgId)
      return res.status(403).json({ error: 'User not in your organisation' });

    const tempPassword = crypto.randomBytes(6).toString('hex') + 'Aa1!';
    const hash = await bcrypt.hash(tempPassword, 12);
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, id]);
    res.json({ tempPassword, message: 'Password reset. Share this with the user.' });
  } catch (err) { res.status(500).json({ error: 'Failed to reset password' }); }
}

// Bulk import users via CSV/JSON array
async function bulkAddUsers(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.body.orgId : req.user.org_id;
    const { users } = req.body;
    if (!Array.isArray(users) || !users.length) return res.status(400).json({ error: 'Users array required' });

    const results = [], errors = [];
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      try {
        if (!u.email || !u.firstName || !u.lastName) {
          errors.push({ row: i+1, error: 'Missing email, firstName or lastName' }); continue;
        }
        const existing = await query('SELECT id FROM users WHERE email=$1', [u.email.toLowerCase()]);
        if (existing.rows.length) { errors.push({ row: i+1, email: u.email, error: 'Email already registered' }); continue; }
        const tempPass = crypto.randomBytes(5).toString('hex') + 'Aa1!';
        const hash = await bcrypt.hash(tempPass, 10);
        const r = await query(
          `INSERT INTO users (email,password_hash,first_name,last_name,role,org_id,is_email_verified,is_active)
           VALUES ($1,$2,$3,$4,$5,$6,true,true) RETURNING id, email, first_name, last_name, role`,
          [u.email.toLowerCase(), hash, u.firstName, u.lastName, u.role||'student', orgId]
        );
        results.push({ ...r.rows[0], tempPassword: tempPass });
      } catch (e) { errors.push({ row: i+1, email: u.email, error: e.message }); }
    }

    await query('INSERT INTO org_activity_logs (org_id,user_id,action,details) VALUES ($1,$2,$3,$4)',
      [orgId, req.user.id, 'bulk_users_added', JSON.stringify({ count: results.length })]);

    res.json({ added: results.length, errors: errors.length, results, errors });
  } catch (err) { res.status(500).json({ error: 'Bulk add failed' }); }
}

// Get org activity log
async function getOrgActivity(req, res) {
  try {
    const orgId = req.user.role === 'admin' ? req.query.orgId : req.user.org_id;
    const result = await query(`
      SELECT al.*, u.first_name || ' ' || u.last_name as actor_name, u.email as actor_email
      FROM org_activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.org_id = $1 ORDER BY al.created_at DESC LIMIT 100
    `, [orgId]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Failed to get activity' }); }
}

module.exports = {
  getMyOrg, getOrgUsers, addOrgUser, updateOrgUser,
  removeOrgUser, resetUserPassword, bulkAddUsers, getOrgActivity
};
