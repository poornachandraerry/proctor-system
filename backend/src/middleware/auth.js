const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }

    const result = await query(
      `SELECT id, email, first_name, last_name, role, organization, org_id, is_active
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
    if (!result.rows.length || !result.rows[0].is_active)
      return res.status(401).json({ error: 'User not found or inactive' });

    req.user = result.rows[0];
    next();
  } catch { res.status(500).json({ error: 'Authentication error' }); }
}

// authorize(...roles) — pass allowed roles
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// authorizeOrgAdmin — allows admin OR org_admin (scoped to their own org)
function authorizeOrgAdmin(req, res, next) {
  if (req.user.role === 'admin') return next();
  if (req.user.role === 'org_admin' && req.user.org_id) return next();
  return res.status(403).json({ error: 'Organisation admin access required' });
}

function generateTokens(userId, role) {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
}

module.exports = { authenticate, authorize, authorizeOrgAdmin, generateTokens };
