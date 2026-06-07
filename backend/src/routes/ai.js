const router = require('express').Router();
const { analyzeFrame, analyzeSession, generateQuestion } = require('../controllers/aiController');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);
router.post('/analyze-frame', analyzeFrame);
router.get('/analyze-session/:sessionId', authorize('admin','examiner'), analyzeSession);
router.post('/generate-questions', authorize('admin','examiner'), generateQuestion);
module.exports = router;
