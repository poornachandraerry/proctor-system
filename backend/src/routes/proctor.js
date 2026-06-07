const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate, authorize('admin', 'examiner'));

// Get exam proctor overview
router.get('/:examId/overview', async (req, res) => {
  try {
    const { examId } = req.params;
    const [sessions, alerts, exam] = await Promise.all([
      query(`
        SELECT es.*, u.first_name || ' ' || u.last_name as student_name, u.email,
          (SELECT COUNT(*) FROM proctoring_alerts WHERE session_id=es.id) as alert_count
        FROM exam_sessions es JOIN users u ON es.user_id=u.id
        WHERE es.exam_id=$1 AND es.status='active' ORDER BY es.risk_score DESC
      `, [examId]),
      query(`
        SELECT severity, COUNT(*) as count FROM proctoring_alerts
        WHERE exam_id=$1 AND is_reviewed=false GROUP BY severity
      `, [examId]),
      query('SELECT id, title, duration_minutes, proctoring_settings FROM exams WHERE id=$1', [examId])
    ]);
    res.json({ sessions: sessions.rows, alertSummary: alerts.rows, exam: exam.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get proctor overview' });
  }
});

// Get session timeline for a specific student
router.get('/session/:sessionId/timeline', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const alerts = await query(
      'SELECT * FROM proctoring_alerts WHERE session_id=$1 ORDER BY timestamp ASC',
      [req.params.sessionId]
    );
    const screenshots = await query(
      'SELECT * FROM session_screenshots WHERE session_id=$1 ORDER BY captured_at DESC LIMIT 20',
      [sessionId]
    );
    res.json({ alerts: alerts.rows, screenshots: screenshots.rows });
  } catch { res.status(500).json({ error: 'Failed to get timeline' }); }
});

module.exports = router;
