const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/questionBankController');

router.use(authenticate);

// Banks — students see public; staff manage
router.get('/',    ctrl.getBanks);
router.get('/:id', ctrl.getBank);
router.post('/',         authorize('admin','org_admin','examiner'), ctrl.createBank);
router.put('/:id',       authorize('admin','org_admin','examiner'), ctrl.updateBank);
router.delete('/:id',    authorize('admin','org_admin','examiner'), ctrl.deleteBank);

// Bank questions
router.get('/:id/questions',        ctrl.getBankQuestions);
router.post('/:id/questions',       authorize('admin','org_admin','examiner'), ctrl.addBankQuestion);
router.post('/:id/questions/bulk',  authorize('admin','org_admin','examiner'), ctrl.bulkAddBankQuestions);
router.put('/:id/questions/:qid',   authorize('admin','org_admin','examiner'), ctrl.updateBankQuestion);
router.delete('/:id/questions/:qid',authorize('admin','org_admin','examiner'), ctrl.deleteBankQuestion);

// Generate exam from bank (examiner/admin)
router.post('/generate-exam', authorize('admin','org_admin','examiner'), ctrl.generateExamFromBank);

// Practice tests (all authenticated users)
router.post('/practice/generate',          ctrl.generatePracticeTest);
router.post('/practice/:sessionId/submit', ctrl.submitPracticeTest);
router.get('/practice/history',            ctrl.getPracticeHistory);

module.exports = router;
