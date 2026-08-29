const router = require('express').Router();
const { login, register, refreshAccessToken, getMe } = require('../controllers/authController');
const { getPublicCategories } = require('../controllers/categoryController');
const { authenticate } = require('../middleware/auth');
router.post('/login', login);
router.post('/register', register);
router.post('/refresh', refreshAccessToken);
router.get('/me', authenticate, getMe);
router.get('/categories', getPublicCategories); // public — needed on the registration form before login
module.exports = router;
