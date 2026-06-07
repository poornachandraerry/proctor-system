const router = require('express').Router();
const { authenticate, authorizeOrgAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/orgAdminController');

router.use(authenticate, authorizeOrgAdmin);

router.get('/my-org',              ctrl.getMyOrg);
router.get('/users',               ctrl.getOrgUsers);
router.post('/users',              ctrl.addOrgUser);
router.put('/users/:id',           ctrl.updateOrgUser);
router.delete('/users/:id',        ctrl.removeOrgUser);
router.post('/users/:id/reset-password', ctrl.resetUserPassword);
router.post('/users/bulk',         ctrl.bulkAddUsers);
router.get('/activity',            ctrl.getOrgActivity);

module.exports = router;
