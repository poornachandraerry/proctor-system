const jwt = require('jsonwebtoken');

function signToken(payload, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = { signToken, verifyToken, signRefreshToken, verifyRefreshToken };
