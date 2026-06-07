const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/question-media');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
      'audio/mpeg','audio/wav','audio/ogg','audio/mp3',
      'video/mp4','video/webm','video/ogg',
      'application/pdf'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  }
});

router.use(authenticate, authorize('admin','org_admin','examiner'));

// Upload a media file for a question
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { questionId, examId, altText } = req.body;

    const mime = req.file.mimetype;
    const assetType = mime.startsWith('image/') ? 'image'
      : mime.startsWith('audio/') ? 'audio'
      : mime.startsWith('video/') ? 'video' : 'image';

    const filePath = `/uploads/question-media/${req.file.filename}`;

    const result = await query(`
      INSERT INTO question_assets (question_id, exam_id, asset_type, file_name, file_path, mime_type, file_size, alt_text, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [questionId||null, examId||null, assetType, req.file.originalname,
        filePath, mime, req.file.size, altText||'', req.user.id]);

    res.json({
      asset: result.rows[0],
      url: `${process.env.BACKEND_URL || 'http://localhost:5000'}${filePath}`,
      embedHtml: assetType === 'image'
        ? `<img src="${filePath}" alt="${altText||''}" class="q-image" />`
        : assetType === 'audio'
        ? `<audio controls src="${filePath}" class="q-audio"></audio>`
        : `<video controls src="${filePath}" class="q-video"></video>`
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Get all assets for a question
router.get('/question/:questionId', async (req, res) => {
  try {
    const r = await query('SELECT * FROM question_assets WHERE question_id=$1 ORDER BY created_at', [req.params.questionId]);
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to get assets' }); }
});

// Delete an asset
router.delete('/:assetId', async (req, res) => {
  try {
    const r = await query('SELECT file_path FROM question_assets WHERE id=$1', [req.params.assetId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' });
    const fullPath = path.join(__dirname, '../..', r.rows[0].file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await query('DELETE FROM question_assets WHERE id=$1', [req.params.assetId]);
    res.json({ message: 'Asset deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete asset' }); }
});

// Update question with rich HTML content
router.patch('/question/:questionId/rich-content', async (req, res) => {
  try {
    const { questionHtml, optionsHtml } = req.body;
    await query(`
      UPDATE questions SET
        question_html=$1, options_html=$2, has_rich_content=true
      WHERE id=$3
    `, [questionHtml, JSON.stringify(optionsHtml||[]), req.params.questionId]);
    res.json({ message: 'Rich content saved' });
  } catch { res.status(500).json({ error: 'Failed to save rich content' }); }
});

module.exports = router;
