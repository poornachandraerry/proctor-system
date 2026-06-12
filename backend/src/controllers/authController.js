const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateTokens } = require('../middleware/auth');
const logger = require('../utils/logger');

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is disabled' });
    const valid = await bcrypt.compare(password, user.password_hash);

    console.log('LOGIN DEBUG');
    console.log('Email entered:', email);
    console.log('User found:', !!user);
    console.log('Password match:', valid);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    res.json({
      accessToken, refreshToken,
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, organization: user.organization }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function register(req, res) {
  try {
    const { email, password, firstName, lastName, role = 'student', organization } = req.body;
    if (!email || !password || !firstName || !lastName) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const allowedRole = ['student', 'examiner'].includes(role) ? role : 'student';
    const result = await query(
      'INSERT INTO users (email, password_hash, first_name, last_name, role, organization, is_email_verified) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, email, first_name, last_name, role',
      [email.toLowerCase(), passwordHash, firstName, lastName, allowedRole, organization]
    );
    const user = result.rows[0];
    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    res.status(201).json({ accessToken, refreshToken, user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role } });
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function refreshAccessToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    const jwt = require('jsonwebtoken');
    let decoded;
    try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET); } catch { return res.status(401).json({ error: 'Invalid refresh token' }); }
    const result = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
    if (!result.rows.length) return res.status(401).json({ error: 'User not found' });
    const tokens = generateTokens(result.rows[0].id, result.rows[0].role);
    res.json(tokens);
  } catch (error) { res.status(500).json({ error: 'Token refresh failed' }); }
}

async function getMe(req, res) {
  try {
    const result = await query(
      'SELECT id, email, first_name, last_name, role, organization, profile_picture, phone, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = result.rows[0];
    res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, role: u.role, organization: u.organization, profilePicture: u.profile_picture, createdAt: u.created_at, lastLogin: u.last_login });
  } catch (error) { res.status(500).json({ error: 'Failed to get user' }); }
}

module.exports = { login, register, refreshAccessToken, getMe };
