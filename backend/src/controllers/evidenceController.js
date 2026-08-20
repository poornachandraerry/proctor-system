const { query } = require('../config/database');
const { saveScreenshot } = require('../services/storageService');
const logger = require('../utils/logger');

// Student's own client uploads a snapshot at the moment a violation fires.
// Saved as capture_type='violation' so it's distinguishable from any future
// periodic captures, and linked to the most recent matching alert (if any)
// by writing the file path into that alert's evidence JSONB.
async function uploadEvidence(req, res) {
  try {
    const { sessionId } = req.params;
    const { imageBase64, alertType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Image data required' });

    // Confirm this session belongs to the requesting user (students can only
    // upload evidence for their own active session).
    const sess = await query('SELECT id, user_id FROM exam_sessions WHERE id=$1', [sessionId]);
    if (!sess.rows.length) return res.status(404).json({ error: 'Session not found' });
    if (sess.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Not your session' });

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const filePath = await saveScreenshot(cleanBase64, sessionId);
    if (!filePath) return res.status(500).json({ error: 'Failed to save evidence image' });

    const inserted = await query(
      `INSERT INTO session_screenshots (session_id, file_path, capture_type, ai_analysis)
       VALUES ($1,$2,'violation',$3) RETURNING id, file_path, captured_at`,
      [sessionId, filePath, JSON.stringify({ alertType: alertType || null })]
    );

    // Best-effort link to the most recent matching alert from the last 10s.
    if (alertType) {
      await query(
        `UPDATE proctoring_alerts SET evidence = evidence || $1::jsonb
         WHERE id = (
           SELECT id FROM proctoring_alerts
           WHERE session_id=$2 AND alert_type=$3 AND timestamp > NOW() - INTERVAL '10 seconds'
           ORDER BY timestamp DESC LIMIT 1
         )`,
        [JSON.stringify({ screenshot: filePath }), sessionId, alertType]
      );
    }

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    logger.error('uploadEvidence error:', err.message);
    res.status(500).json({ error: 'Failed to upload evidence' });
  }
}

async function getSessionEvidence(req, res) {
  try {
    const { sessionId } = req.params;
    const result = await query(
      'SELECT id, file_path, capture_type, ai_analysis, flagged, captured_at FROM session_screenshots WHERE session_id=$1 ORDER BY captured_at ASC',
      [sessionId]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('getSessionEvidence error:', err.message);
    res.status(500).json({ error: 'Failed to load evidence' });
  }
}

module.exports = { uploadEvidence, getSessionEvidence };
