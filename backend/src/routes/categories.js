const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/categoryController');

router.use(authenticate, authorize('admin'));

router.get('/',       ctrl.getAllCategories);
router.post('/',      ctrl.createCategory);
router.put('/:id',    ctrl.updateCategory);
router.delete('/:id', ctrl.deleteCategory);

module.exports = router;
