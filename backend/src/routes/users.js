const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
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
