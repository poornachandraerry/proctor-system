const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { saveScreenshot } = require('../services/storageService');
const {
  getOrgLimits, isLicenseValid, checkConcurrentLimit
} = require('../services/licensingEnforcer');

async function startSession(req, res) {
  try {
    const { examId } = req.body;
    const userId = req.user.id;

    const exam = await query("SELECT * FROM exams WHERE id=$1 AND status='published'", [examId]);
    if (!exam.rows.length) return res.status(404).json({ error: 'Exam not found or not available' });

    const existing = await query(
      "SELECT id, status FROM exam_sessions WHERE exam_id=$1 AND user_id=$2 AND status='active'",
      [examId, userId]
    );
    if (existing.rows.length) return res.json({ sessionId: existing.rows[0].id, resumed: true });

    // One attempt per candidate per exam — block starting a new session if
    // a previous attempt was already submitted or terminated.
    const priorAttempt = await query(
      "SELECT id, status FROM exam_sessions WHERE exam_id=$1 AND user_id=$2 AND status IN ('submitted','terminated') ORDER BY created_at DESC LIMIT 1",
      [examId, userId]
    );
    if (priorAttempt.rows.length) {
      return res.status(403).json({
        error: priorAttempt.rows[0].status === 'terminated'
          ? 'Your previous attempt at this exam was terminated for policy violations. You cannot retake it.'
          : 'You have already submitted this exam. You cannot retake it.',
        code: 'ALREADY_ATTEMPTED',
        sessionId: priorAttempt.rows[0].id,
        status: priorAttempt.rows[0].status,
      });
    }

    if (req.user.org_id) {
      const limits = await getOrgLimits(userId);
      const validity = isLicenseValid(limits);
      if (!validity.valid) return res.status(403).json({ error: validity.reason, code: 'LICENSE_INVALID' });

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

    if (exam.rows[0].guidelines_ack_required !== false && !req.body.guidelinesAccepted) {
      return res.status(400).json({ error: 'You must review and accept the exam guidelines before starting.', code: 'GUIDELINES_NOT_ACCEPTED' });
    }

    const result = await query(
      'INSERT INTO exam_sessions (exam_id, user_id, ip_address, user_agent, browser_info, guidelines_ack_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [examId, userId, req.ip, req.headers['user-agent'], JSON.stringify(req.body.browserInfo || {}), req.body.guidelinesAccepted ? new Date() : null]
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
    const { eventType, data, snapshotBase64 } = req.body;
    const updates = {};

    if (eventType === 'tab_switch')       updates.tab_switches            = 'tab_switches + 1';
    if (eventType === 'fullscreen_exit')  updates.fullscreen_exits        = 'fullscreen_exits + 1';
    if (eventType === 'copy_paste')       updates.copy_paste_attempts     = 'copy_paste_attempts + 1';
    if (eventType === 'focus_lost')       updates.focus_lost_count        = 'focus_lost_count + 1';
    if (eventType === 'multiple_faces')   updates.multiple_faces_detected = 'multiple_faces_detected + 1';
    if (eventType === 'gaze_away')        updates.gaze_away_count         = 'gaze_away_count + 1';
    if (eventType === 'camera_blocked')   updates.camera_blocked_count    = 'COALESCE(camera_blocked_count,0) + 1';
    if (eventType === 'continuous_speech') updates.continuous_speech_count = 'COALESCE(continuous_speech_count,0) + 1';

    let setClause = 'total_suspicious_events = total_suspicious_events + 1, updated_at = NOW()';
    for (const [col, expr] of Object.entries(updates)) setClause += `, ${col} = ${expr}`;
    await query(`UPDATE exam_sessions SET ${setClause} WHERE id = $1`, [id]);

    const severityMap = {
      tab_switch:      'high',
      fullscreen_exit:  'high',
      copy_paste:       'high',
      multiple_faces:   'critical',
      gaze_away:        'low',
      focus_lost:       'medium',
      camera_blocked:   'critical',
      continuous_speech: 'high',
    };
    const severity = severityMap[eventType] || 'low';

    const session = await query('SELECT exam_id, user_id FROM exam_sessions WHERE id = $1', [id]);
    if (session.rows.length) {
      const { exam_id, user_id } = session.rows[0];
      const descriptions = {
        tab_switch:     'Student switched away from the exam tab',
        fullscreen_exit: 'Student exited fullscreen mode during the exam',
        copy_paste:      'Copy or paste attempt detected',
        multiple_faces:  'Multiple faces detected in webcam',
        gaze_away:       'Student looked away from screen for an extended period',
        focus_lost:      'Browser window lost focus',
        camera_blocked:  'Webcam appears blocked, covered, or showing a dark/uniform frame',
        continuous_speech: 'Sustained talking detected during the exam',
      };
      const alertRes = await query(
        'INSERT INTO proctoring_alerts (session_id, user_id, exam_id, alert_type, severity, description, evidence) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [id, user_id, exam_id, eventType, severity, descriptions[eventType] || `${eventType} detected`, JSON.stringify(data || {})]
      );

      // If the client captured a webcam frame at the moment of this violation,
      // save it and link it to the alert so admins/examiners/org_admins can
      // review visual evidence alongside the alert (see session evidence viewer).
      if (snapshotBase64) {
        try {
          const filePath = await saveScreenshot(snapshotBase64, id);
          if (filePath) {
            await query(
              `INSERT INTO session_screenshots (session_id, file_path, capture_type, event_type, alert_id)
               VALUES ($1,$2,'violation',$3,$4)`,
              [id, filePath, eventType, alertRes.rows[0]?.id || null]
            );
          }
        } catch (snapErr) {
          logger.error('evidence snapshot save error:', snapErr.message);
        }
      }
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

    const existing = await query('SELECT status FROM exam_sessions WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Session not found' });
    if (existing.rows[0].status === 'terminated') {
      // Without this guard, a terminated session could still be completed
      // and graded normally via a direct call to this endpoint — silently
      // defeating the whole point of termination for policy violations.
      return res.status(403).json({ error: 'This session was terminated for policy violations and cannot be submitted.' });
    }
    if (existing.rows[0].status === 'submitted') {
      return res.json({ message: 'Already submitted' }); // idempotent — avoid reprocessing/overwriting a graded session
    }

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
          // NOTE: previously this clamped every negative value to 0 via
          // Math.max(marksObtained, 0), which silently discarded negative
          // marking entirely regardless of the negative_marks setting —
          // a wrong answer always stored 0 penalty instead of the
          // configured deduction. Store the real value; a genuinely
          // negative overall total is normal and expected wherever
          // negative marking is enabled (as in most competitive exams),
          // so nothing sums this back to a floor of 0.
          await query(
            'UPDATE answers SET is_correct=$1, marks_obtained=$2 WHERE id=$3',
            [isCorrect, marksObtained, ans.rows[0].id]
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

    const sess = await query('SELECT user_id, status FROM exam_sessions WHERE id=$1', [id]);
    if (!sess.rows.length) return res.status(404).json({ error: 'Session not found' });
    const { user_id, status } = sess.rows[0];

    // A student may only end their OWN active session — this is exactly
    // what the exam-taking page calls the moment a proctoring violation
    // limit is hit. This route used to be admin/examiner-only, so that
    // call was silently rejected with 403 (and swallowed by an empty
    // catch{} on the frontend) — the session's status in the database
    // never actually changed, only the browser's local "terminated"
    // overlay did, so a reload or a fresh tab could resume the same
    // "active" session indefinitely. Admin/examiner keep unrestricted
    // access for manual intervention from the live monitor.
    if (req.user.role === 'student') {
      if (req.user.id !== user_id) return res.status(403).json({ error: 'Not your session' });
      if (status !== 'active') return res.json({ message: 'Session already ended' }); // idempotent — not an error
    }

    await query(
      "UPDATE exam_sessions SET status='terminated', proctor_notes=$1, updated_at=NOW() WHERE id=$2",
      [reason || 'Terminated by proctor', id]
    );
    res.json({ message: 'Session terminated' });
  } catch (error) { res.status(500).json({ error: 'Failed to terminate session' }); }
}

module.exports = { startSession, getSession, updateSessionEvent, submitSession, getActiveSessions, terminateSession };
