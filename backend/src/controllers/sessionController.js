const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');
const {
  getOrgLimits, isLicenseValid, checkConcurrentLimit
} = require('../services/licensingEnforcer');

async function startSession(req, res) {
  try {
    const { examId } = req.body;
    const userId = req.user.id;

    const exam = await query("SELECT * FROM exams WHERE id=$1 AND status='published'", [examId]);
    if (!exam.rows.length) return res.status(404).json({ error: 'Exam not found or not available' });

    // Resume existing active session
    const existing = await query(
      "SELECT id, status FROM exam_sessions WHERE exam_id=$1 AND user_id=$2 AND status='active'",
      [examId, userId]
    );
    if (existing.rows.length) return res.json({ sessionId: existing.rows[0].id, resumed: true });

    // ── LICENSING ENFORCEMENT ────────────────────────────────
    // Only enforce if user belongs to an org
    if (req.user.org_id) {
      const limits = await getOrgLimits(userId);

      // 1. Check licence validity
      const validity = isLicenseValid(limits);
      if (!validity.valid) return res.status(403).json({ error: validity.reason, code: 'LICENSE_INVALID' });

      // 2. Check concurrent session limit
      const concCheck = await checkConcurrentLimit(limits.org_id, limits.max_concurrent);
      if (!concCheck.allowed) {
        return res.status(429).json({
          error: concCheck.reason,
          code: 'CONCURRENT_LIMIT_REACHED',
          current: concCheck.current,
          max: concCheck.max,
        });
      }
    }

    const result = await query(
      'INSERT INTO exam_sessions (exam_id, user_id, ip_address, user_agent, browser_info) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [examId, userId, req.ip, req.headers['user-agent'], JSON.stringify(req.body.browserInfo || {})]
    );
    res.status(201).json({ sessionId: result.rows[0].id, session: result.rows[0] });
  } catch (error) {
    logger.error('startSession error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
}

async function getSession(req, res) {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT es.*, e.title as exam_title, e.duration_minutes, e.proctoring_settings, e.settings,
        u.first_name || ' ' || u.last_name as student_name, u.email as student_email
      FROM exam_sessions es
      JOIN exams e ON es.exam_id = e.id
      JOIN users u ON es.user_id = u.id
      WHERE es.id = $1
    `, [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = result.rows[0];
    if (req.user.role === 'student' && session.user_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    res.json(session);
  } catch (error) { res.status(500).json({ error: 'Failed to get session' }); }
}

async function updateSessionEvent(req, res) {
  try {
    const { id } = req.params;
    const { eventType, data } = req.body;
    const updates = {};
    if (eventType === 'tab_switch')      updates.tab_switches           = 'tab_switches + 1';
    if (eventType === 'fullscreen_exit') updates.fullscreen_exits       = 'fullscreen_exits + 1';
    if (eventType === 'copy_paste')      updates.copy_paste_attempts    = 'copy_paste_attempts + 1';
    if (eventType === 'focus_lost')      updates.focus_lost_count       = 'focus_lost_count + 1';
    if (eventType === 'multiple_faces')  updates.multiple_faces_detected= 'multiple_faces_detected + 1';
    if (eventType === 'gaze_away')       updates.gaze_away_count        = 'gaze_away_count + 1';

    let setClause = 'total_suspicious_events = total_suspicious_events + 1, updated_at = NOW()';
    for (const [col, expr] of Object.entries(updates)) setClause += `, ${col} = ${expr}`;
    await query(`UPDATE exam_sessions SET ${setClause} WHERE id = $1`, [id]);

    const severityMap = { tab_switch:'high', fullscreen_exit:'medium', copy_paste:'high', multiple_faces:'critical', gaze_away:'low', focus_lost:'medium' };
    const severity = severityMap[eventType] || 'low';
    const session = await query('SELECT exam_id, user_id FROM exam_sessions WHERE id = $1', [id]);
    if (session.rows.length) {
      const { exam_id, user_id } = session.rows[0];
      await query(
        'INSERT INTO proctoring_alerts (session_id, user_id, exam_id, alert_type, severity, description, evidence) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, user_id, exam_id, eventType, severity, `${eventType} detected`, JSON.stringify(data || {})]
      );
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('updateSessionEvent error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
}

async function submitSession(req, res) {
  try {
    const { id } = req.params;
    const { answers } = req.body;
    await transaction(async (client) => {
      await client.query(
        "UPDATE exam_sessions SET status='submitted', submitted_at=NOW(), updated_at=NOW() WHERE id=$1", [id]
      );
      if (answers && answers.length) {
        for (const ans of answers) {
          await client.query(`
            INSERT INTO answers (session_id, question_id, answer_data, time_spent_seconds)
            VALUES ($1,$2,$3,$4) ON CONFLICT (session_id, question_id)
            DO UPDATE SET answer_data=$3, time_spent_seconds=$4
          `, [id, ans.questionId, JSON.stringify(ans.answer), ans.timeSpent || 0]);
        }
      }
    });
    // Auto-grade MCQs
    const sessionRes = await query('SELECT exam_id FROM exam_sessions WHERE id=$1', [id]);
    if (sessionRes.rows.length) {
      const examId = sessionRes.rows[0].exam_id;
      const questions = await query(
        "SELECT id, correct_answer, marks, negative_marks FROM questions WHERE exam_id=$1 AND question_type IN ('mcq','true_false')",
        [examId]
      );
      for (const q of questions.rows) {
        const ans = await query(
          'SELECT id, answer_data FROM answers WHERE session_id=$1 AND question_id=$2', [id, q.id]
        );
        if (ans.rows.length && q.correct_answer) {
          const userAnswer    = JSON.stringify(ans.rows[0].answer_data).replace(/"/g, '');
          const correctAnswer = JSON.stringify(q.correct_answer).replace(/"/g, '');
          const isCorrect     = userAnswer === correctAnswer;
          const marksObtained = isCorrect
            ? parseFloat(q.marks)
            : -parseFloat(q.negative_marks || 0);
          await query(
            'UPDATE answers SET is_correct=$1, marks_obtained=$2 WHERE id=$3',
            [isCorrect, Math.max(marksObtained, 0), ans.rows[0].id]
          );
        }
      }
    }
    res.json({ message: 'Exam submitted successfully' });
  } catch (error) {
    logger.error('submitSession error:', error);
    res.status(500).json({ error: 'Failed to submit session' });
  }
}

async function getActiveSessions(req, res) {
  try {
    const { examId } = req.query;
    let whereClause = "WHERE es.status = 'active'";
    const params = [];
    if (examId) { whereClause += ' AND es.exam_id = $1'; params.push(examId); }
    const result = await query(`
      SELECT es.*, u.first_name || ' ' || u.last_name as student_name, u.email,
        e.title as exam_title,
        (SELECT COUNT(*) FROM proctoring_alerts WHERE session_id = es.id) as alert_count
      FROM exam_sessions es
      JOIN users u ON es.user_id = u.id
      JOIN exams e ON es.exam_id = e.id
      ${whereClause} ORDER BY es.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to get sessions' }); }
}

async function terminateSession(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await query(
      "UPDATE exam_sessions SET status='terminated', proctor_notes=$1, updated_at=NOW() WHERE id=$2",
      [reason || 'Terminated by proctor', id]
    );
    res.json({ message: 'Session terminated' });
  } catch (error) { res.status(500).json({ error: 'Failed to terminate session' }); }
}

module.exports = { startSession, getSession, updateSessionEvent, submitSession, getActiveSessions, terminateSession };
