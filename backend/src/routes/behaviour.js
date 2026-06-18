const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { bulkLogEvents, getSessionBehaviour } = require('../controllers/behaviourController');

router.use(authenticate);
router.post('/bulk-log',              bulkLogEvents);
router.get('/session/:sessionId',     authorize('admin','org_admin','examiner'), getSessionBehaviour);

module.exports = router;
