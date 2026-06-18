const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { uploadMiddleware, uploadAudioClip, getSessionAudio, flagAudioClip } = require('../controllers/audioController');

router.use(authenticate);
router.post('/session/:sessionId/upload', uploadMiddleware, uploadAudioClip);
router.get('/session/:sessionId',         authorize('admin','org_admin','examiner'), getSessionAudio);
router.patch('/clip/:clipId/flag',        authorize('admin','org_admin','examiner'), flagAudioClip);

module.exports = router;
