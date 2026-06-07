const { query } = require('../config/database');

async function getAlerts(req, res) {
  try {
    const { sessionId, examId, severity, isReviewed, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    if (sessionId) { conditions.push(`pa.session_id = $${params.length + 1}`); params.push(sessionId); }
    if (examId) { conditions.push(`pa.exam_id = $${params.length + 1}`); params.push(examId); }
    if (severity) { conditions.push(`pa.severity = $${params.length + 1}`); params.push(severity); }
    if (isReviewed !== undefined) { conditions.push(`pa.is_reviewed = $${params.length + 1}`); params.push(isReviewed === 'true'); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit, offset);
    const result = await query(`
      SELECT pa.*, u.first_name || ' ' || u.last_name as student_name, e.title as exam_title
      FROM proctoring_alerts pa
      JOIN users u ON pa.user_id = u.id JOIN exams e ON pa.exam_id = e.id
      ${where} ORDER BY pa.timestamp DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const count = await query(`SELECT COUNT(*) FROM proctoring_alerts pa ${where}`, params.slice(0, -2));
    res.json({ alerts: result.rows, total: parseInt(count.rows[0].count) });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch alerts' }); }
}

async function reviewAlert(req, res) {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    await query(
      'UPDATE proctoring_alerts SET is_reviewed=true, reviewed_by=$1, reviewer_action=$2, reviewer_notes=$3 WHERE id=$4',
      [req.user.id, action, notes, id]
    );
    res.json({ message: 'Alert reviewed' });
  } catch (error) { res.status(500).json({ error: 'Failed to review alert' }); }
}

async function getAlertSummary(req, res) {
  try {
    const { examId } = req.query;
    const where = examId ? 'WHERE exam_id = $1' : '';
    const params = examId ? [examId] : [];
    const result = await query(`
      SELECT alert_type, severity, COUNT(*) as count
      FROM proctoring_alerts ${where}
      GROUP BY alert_type, severity ORDER BY count DESC
    `, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to get alert summary' }); }
}

module.exports = { getAlerts, reviewAlert, getAlertSummary };
