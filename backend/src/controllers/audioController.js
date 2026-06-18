const { query } = require('../config/database');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/audio', req.params.sessionId || 'unknown');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}.webm`),
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/mpeg'].includes(file.mimetype);
    cb(ok ? null : new Error('Invalid audio format'), ok);
  },
});

const uploadMiddleware = upload.single('audio');

async function uploadAudioClip(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file received' });
    const { sessionId } = req.params;
    const { clipIndex, durationS } = req.body;

    const sess = await query('SELECT id, user_id FROM exam_sessions WHERE id=$1', [sessionId]);
    if (!sess.rows.length) return res.status(404).json({ error: 'Session not found' });
    if (sess.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    const filePath = `/uploads/audio/${sessionId}/${req.file.filename}`;
    const r = await query(`
      INSERT INTO session_audio_clips
        (session_id, file_path, duration_s, file_size, clip_index)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [sessionId, filePath, parseInt(durationS) || 0,
        req.file.size, parseInt(clipIndex) || 0]);

    res.json({ clip: r.rows[0] });
  } catch (err) {
    logger.error('uploadAudioClip:', err.message);
    res.status(500).json({ error: 'Failed to upload audio clip' });
  }
}

async function getSessionAudio(req, res) {
  try {
    const r = await query(
      'SELECT * FROM session_audio_clips WHERE session_id=$1 ORDER BY clip_index ASC',
      [req.params.sessionId]
    );
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    res.json(r.rows.map(clip => ({ ...clip, url: `${baseUrl}${clip.file_path}` })));
  } catch { res.status(500).json({ error: 'Failed to get audio clips' }); }
}

async function flagAudioClip(req, res) {
  try {
    await query(
      'UPDATE session_audio_clips SET flagged=true, flag_reason=$1 WHERE id=$2',
      [req.body.flagReason || 'Flagged by proctor', req.params.clipId]
    );
    res.json({ message: 'Clip flagged' });
  } catch { res.status(500).json({ error: 'Failed to flag clip' }); }
}

module.exports = { uploadMiddleware, uploadAudioClip, getSessionAudio, flagAudioClip };
