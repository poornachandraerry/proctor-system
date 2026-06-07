const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/licensingController');

// Public — sandbox access link (no auth)
router.get('/sandbox/access/:token', ctrl.accessSandbox);

// All other routes require superadmin
router.use(authenticate, authorize('admin'));

router.get('/overview',           ctrl.getLicensingOverview);

// Plans
router.get('/plans',              ctrl.getPlans);
router.post('/plans',             ctrl.createPlan);
router.put('/plans/:id',          ctrl.updatePlan);

// Organisations
router.get('/orgs',               ctrl.getOrgs);
router.post('/orgs',              ctrl.createOrg);
router.get('/orgs/:id',           ctrl.getOrg);
router.put('/orgs/:id',           ctrl.updateOrg);
router.post('/orgs/:id/suspend',  ctrl.suspendOrg);
router.post('/orgs/:id/activate', ctrl.activateOrg);
router.post('/orgs/:id/regen-key',ctrl.regenerateLicenseKey);
router.get('/orgs/:id/live',      ctrl.getOrgLiveUsage);

// Sandboxes
router.get('/sandboxes',          ctrl.getSandboxes);
router.post('/sandboxes',         ctrl.createSandbox);
router.patch('/sandboxes/:id/toggle', ctrl.toggleSandbox);

// GST Invoices
router.get('/invoices',           ctrl.getInvoices);
router.post('/invoices',          ctrl.createInvoice);
router.patch('/invoices/:id/pay', ctrl.markInvoicePaid);

module.exports = router;

// Create org admin account for a client org
const { createOrgAdminUser } = require('../controllers/licensingController');
router.post('/orgs/:id/create-admin', createOrgAdminUser);
