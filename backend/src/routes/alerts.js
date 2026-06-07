const router = require('express').Router();
const { getAlerts, reviewAlert, getAlertSummary } = require('../controllers/alertController');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate, authorize('admin','examiner'));
router.get('/', getAlerts);
router.get('/summary', getAlertSummary);
router.patch('/:id/review', reviewAlert);
module.exports = router;
