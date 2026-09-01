const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/questionBankController');
const payments = require('../controllers/bankPaymentController');
const { generateBankQuestionsTemplate } = require('../services/bankExcelService');

router.use(authenticate);

// Download blank question upload template (staff only)
router.get('/questions/template', authorize('admin','org_admin','examiner'), async (req, res) => {
  try {
    const buffer = await generateBankQuestionsTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ProctorAIQ_QuestionBank_Upload_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Banks — students see public; staff manage
router.get('/',    ctrl.getBanks);
router.get('/:id', ctrl.getBank);
router.post('/',         authorize('admin','org_admin','examiner'), ctrl.createBank);
router.put('/:id',       authorize('admin','org_admin','examiner'), ctrl.updateBank);
router.delete('/:id',    authorize('admin','org_admin','examiner'), ctrl.deleteBank);

// Bank questions — raw question text/answers are staff-only. Students
// never get this endpoint: they only ever see questions inside a practice
// test they've generated (and paid for, if priced), never the bank itself.
router.get('/:id/questions',        authorize('admin','org_admin','examiner'), ctrl.getBankQuestions);
router.get('/:id/topics',           ctrl.getBankTopics); // topic names only — safe for students, used to build the practice-test filter form
router.post('/:id/questions',       authorize('admin','org_admin','examiner'), ctrl.addBankQuestion);
router.post('/:id/questions/bulk',  authorize('admin','org_admin','examiner'), ctrl.bulkAddBankQuestions);
router.put('/:id/questions/:qid',   authorize('admin','org_admin','examiner'), ctrl.updateBankQuestion);
router.delete('/:id/questions/:qid',authorize('admin','org_admin','examiner'), ctrl.deleteBankQuestion);

// Generate exam from bank (examiner/admin)
router.post('/generate-exam', authorize('admin','org_admin','examiner'), ctrl.generateExamFromBank);

// Pay-per-practice-attempt (Razorpay — checkout includes UPI/QR automatically)
router.post('/:id/payment/order',  payments.createBankCreditOrder);
router.post('/:id/payment/verify', payments.verifyBankCreditPayment);

// Practice tests (all authenticated users)
router.post('/practice/generate',          ctrl.generatePracticeTest);
router.post('/practice/:sessionId/submit', ctrl.submitPracticeTest);
router.get('/practice/:sessionId/pdf',     ctrl.getPracticeResultPdf);
router.get('/practice/history',            ctrl.getPracticeHistory);

module.exports = router;
