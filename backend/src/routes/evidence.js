const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { uploadEvidence, getSessionEvidence } = require('../controllers/evidenceController');

router.use(authenticate);
router.post('/session/:sessionId/upload', uploadEvidence);
router.get('/session/:sessionId',         authorize('admin','org_admin','examiner'), getSessionEvidence);

module.exports = router;
