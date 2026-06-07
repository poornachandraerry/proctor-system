const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/examAccessController');

// ── Public routes (no auth) ────────────────────────────────
router.get('/register/:token',   ctrl.registerViaToken);
router.post('/register/:token',  ctrl.confirmRegistration);

// ── Authenticated routes ───────────────────────────────────
router.use(authenticate);

// Access check — any logged in user
router.get('/check/:examId', ctrl.checkExamAccess);

// ── Staff only ─────────────────────────────────────────────
router.use(authorize('admin', 'org_admin', 'examiner'));

// Email whitelist — ORDER MATTERS: specific routes before parameterised
router.get('/:examId/emails',                       ctrl.getEmailWhitelist);
router.post('/:examId/emails/bulk',                 ctrl.bulkUploadEmails);         // before /:email
router.post('/:examId/emails',                      ctrl.addEmailsToWhitelist);
router.post('/:examId/emails/:email/resend',        ctrl.resendInvite);
router.delete('/:examId/emails/:email',             ctrl.removeEmailFromWhitelist);

// Domain whitelist
router.get('/:examId/domains',                      ctrl.getDomainWhitelist);
router.post('/:examId/domains',                     ctrl.addDomains);
router.delete('/:examId/domains/:domain',           ctrl.removeDomain);

module.exports = router;
