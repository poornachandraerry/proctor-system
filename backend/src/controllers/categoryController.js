const { query } = require('../config/database');
const logger = require('../utils/logger');

const slugify = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Public — no auth required, since the registration page needs this before
// a student has an account, and the login-adjacent register form is the
// primary place a category gets picked.
async function getPublicCategories(req, res) {
  try {
    const r = await query(
      'SELECT id, name, slug, description FROM student_categories WHERE is_active=true ORDER BY name ASC'
    );
    res.json(r.rows);
  } catch (err) {
    logger.error('getPublicCategories:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

// Admin view — includes inactive categories and usage counts, so an admin
// can see what's safe to delete vs. what should just be deactivated.
async function getAllCategories(req, res) {
  try {
    const r = await query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM users WHERE category_id=c.id) as user_count,
        (SELECT COUNT(*) FROM question_banks WHERE target_category_id=c.id) as bank_count
      FROM student_categories c ORDER BY c.name ASC
    `);
    res.json(r.rows);
  } catch (err) {
    logger.error('getAllCategories:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

async function createCategory(req, res) {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Category name required' });
    const slug = slugify(name);
    const existing = await query('SELECT id FROM student_categories WHERE slug=$1', [slug]);
    if (existing.rows.length) return res.status(409).json({ error: 'A category with this name already exists' });
    const r = await query(
      'INSERT INTO student_categories (name, slug, description, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [name.trim(), slug, description || null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    logger.error('createCategory:', err.message);
    res.status(500).json({ error: 'Failed to create category' });
  }
}

async function updateCategory(req, res) {
  try {
    const { name, description, isActive } = req.body;
    await query(`
      UPDATE student_categories SET
        name=COALESCE($1,name), description=COALESCE($2,description), is_active=COALESCE($3,is_active)
      WHERE id=$4
    `, [name || null, description !== undefined ? description : null, isActive !== undefined ? isActive : null, req.params.id]);
    res.json({ message: 'Category updated' });
  } catch (err) {
    logger.error('updateCategory:', err.message);
    res.status(500).json({ error: 'Failed to update category' });
  }
}

// Hard delete is blocked once a category is actually in use — deactivating
// is the safe path there (keeps existing users/banks pointing at a real
// row instead of orphaning a foreign key), so the delete button only
// offers what won't break data that already references it.
async function deleteCategory(req, res) {
  try {
    const usage = await query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE category_id=$1) as user_count,
        (SELECT COUNT(*) FROM question_banks WHERE target_category_id=$1) as bank_count
    `, [req.params.id]);
    const { user_count, bank_count } = usage.rows[0];
    if (parseInt(user_count) > 0 || parseInt(bank_count) > 0) {
      return res.status(400).json({
        error: `This category is in use by ${user_count} user(s) and ${bank_count} question bank(s) — deactivate it instead of deleting.`,
        code: 'CATEGORY_IN_USE',
      });
    }
    await query('DELETE FROM student_categories WHERE id=$1', [req.params.id]);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    logger.error('deleteCategory:', err.message);
    res.status(500).json({ error: 'Failed to delete category' });
  }
}

module.exports = { getPublicCategories, getAllCategories, createCategory, updateCategory, deleteCategory };
