const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/publicExamLinkController');
const { regeneratePublicLink } = require('../controllers/examController');

// ── Public — no auth required ──────────────────────────────
router.get('/:token',              ctrl.getExamByPublicLink);
router.post('/:token/validate',    ctrl.validateEmailForPublicLink);
router.post('/:token/register',    ctrl.registerViaPublicLink);

// ── Authenticated — examiner regenerates their own exam's link ──
router.post('/exam/:id/regenerate', authenticate, authorize('admin','org_admin','examiner'), regeneratePublicLink);

module.exports = router;
