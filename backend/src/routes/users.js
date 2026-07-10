const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('../utils/logger');
router.use(authenticate);
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const offset = (page-1)*limit;
    const where = role ? 'WHERE role=$1' : '';
    const params = role ? [role, limit, offset] : [limit, offset];
    const result = await query(`SELECT id,email,first_name,last_name,role,organization,is_active,created_at,last_login FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    const count = await query(`SELECT COUNT(*) FROM users ${where}`, role ? [role] : []);
    res.json({ users: result.rows, total: parseInt(count.rows[0].count) });
  } catch { res.status(500).json({ error: 'Failed to fetch users' }); }
});

// Create a new user directly (admin only — no organisation scoping required)
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { email, firstName, lastName, role = 'student', phone, organization } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, first name and last name are required' });
    }
    const allowedRoles = ['admin', 'org_admin', 'examiner', 'student'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const existing = await query('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'A user with this email already exists' });

    const tempPassword = crypto.randomBytes(6).toString('hex') + 'Aa1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const result = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, organization, phone, is_email_verified, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)
      RETURNING id, email, first_name, last_name, role, organization, created_at
    `, [email.toLowerCase(), passwordHash, firstName, lastName, role, organization || null, phone || null]);

    res.status(201).json({
      user: result.rows[0],
      tempPassword,
      message: `User created. Temporary password: ${tempPassword}`,
    });
  } catch (err) {
    logger.error('createUser:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Reset a user's password — generates a new temporary password (admin only)
router.post('/:id/reset-password', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const userCheck = await query('SELECT id, email, first_name, last_name FROM users WHERE id=$1', [id]);
    if (!userCheck.rows.length) return res.status(404).json({ error: 'User not found' });

    const tempPassword = crypto.randomBytes(6).toString('hex') + 'Aa1!';
    const hash = await bcrypt.hash(tempPassword, 12);
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, id]);

    res.json({
      tempPassword,
      user: userCheck.rows[0],
      message: 'Password reset. Share this temporary password with the user securely.',
    });
  } catch (err) {
    logger.error('resetUserPassword:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });
    const { firstName, lastName, phone, organization, isActive } = req.body;
    await query('UPDATE users SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name), phone=COALESCE($3,phone), organization=COALESCE($4,organization), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6',
      [firstName, lastName, phone, organization, isActive, id]);
    res.json({ message: 'User updated' });
  } catch { res.status(500).json({ error: 'Failed to update user' }); }
});
module.exports = router;
