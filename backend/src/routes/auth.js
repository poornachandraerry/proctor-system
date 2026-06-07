const router = require('express').Router();
const { login, register, refreshAccessToken, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
router.post('/login', login);
router.post('/register', register);
router.post('/refresh', refreshAccessToken);
router.get('/me', authenticate, getMe);
module.exports = router;
