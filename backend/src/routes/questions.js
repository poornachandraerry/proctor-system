const router = require('express').Router();
const { getQuestions, createQuestion, updateQuestion, deleteQuestion, bulkCreateQuestions } = require('../controllers/questionController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/:examId/questions', getQuestions);
router.post('/:examId/questions', authorize('admin', 'examiner'), createQuestion);
router.post('/:examId/questions/bulk', authorize('admin', 'examiner'), bulkCreateQuestions);
router.put('/:examId/questions/:id', authorize('admin', 'examiner'), updateQuestion);
router.delete('/:examId/questions/:id', authorize('admin', 'examiner'), deleteQuestion);

module.exports = router;
