const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');

async function getExams(req, res) {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (req.user.role === 'student') {
      // FIX (Issue #4): same leak as dashboard — restrict to exams the
      // student is enrolled in, OR open exams created within their own org.
      params.push(req.user.id);
      params.push(req.user.org_id || null);
      conditions.push(`
        e.status = 'published'
        AND (
          EXISTS (SELECT 1 FROM exam_enrollments ee WHERE ee.exam_id = e.id AND ee.user_id = $${params.length - 1})
          OR (
            e.access_type = 'open'
            AND $${params.length}::uuid IS NOT NULL
            AND creator.org_id = $${params.length}::uuid
          )
        )
      `);
    } else if (req.user.role === 'examiner' || req.user.role === 'org_admin') {
      conditions.push(`e.created_by = $${params.length + 1}`);
      params.push(req.user.id);
      if (status) { conditions.push(`e.status = $${params.length + 1}`); params.push(status); }
    } else if (status) {
      conditions.push(`e.status = $${params.length + 1}`);
      params.push(status);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];
    params.push(limit, offset);

    const countResult = await query(`
      SELECT COUNT(*) FROM exams e
      LEFT JOIN users creator ON e.created_by = creator.id
      ${where}
    `, countParams);

    const result = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as creator_name,
        (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM exam_enrollments WHERE exam_id = e.id) as enrolled_count,
        (SELECT COUNT(*) FROM exam_sessions WHERE exam_id = e.id AND status = 'active') as active_sessions
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users creator ON e.created_by = creator.id
      ${where} ORDER BY e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ exams: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    logger.error('getExams error:', error);
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
}

async function getExam(req, res) {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as creator_name,
        (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM exam_enrollments WHERE exam_id = e.id) as enrolled_count
      FROM exams e LEFT JOIN users u ON e.created_by = u.id WHERE e.id = $1
    `, [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });

    const exam = result.rows[0];

    // FIX (Issue #4): block direct access by URL/ID too, not just hide from list
    if (req.user.role === 'student') {
      const enrolled = await query(
        'SELECT 1 FROM exam_enrollments WHERE exam_id=$1 AND user_id=$2', [id, req.user.id]
      );
      if (!enrolled.rows.length) {
        const creatorOrg = await query('SELECT org_id FROM users WHERE id=$1', [exam.created_by]);
        const sameOrgOpen = exam.access_type === 'open'
          && req.user.org_id
          && creatorOrg.rows[0]?.org_id === req.user.org_id;
        if (!sameOrgOpen) {
          return res.status(403).json({ error: 'You do not have access to this exam' });
        }
      }
    }

    res.json(exam);
  } catch { res.status(500).json({ error: 'Failed to fetch exam' }); }
}

async function createExam(req, res) {
  try {
    const { title, description, instructions, durationMinutes, totalMarks, passPercentage,
      startTime, endTime, settings, proctoringSettings } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const defaultProctoring = {
      webcam_required: true, fullscreen_required: true, tab_switch_allowed: false,
      copy_paste_blocked: true, face_detection: true, gaze_tracking: true,
      ai_analysis: true, screenshot_interval: 30, max_warnings: 3
    };

    const result = await query(`
      INSERT INTO exams (title, description, instructions, created_by, duration_minutes,
        total_marks, pass_percentage, start_time, end_time, settings, proctoring_settings,
        access_type, show_results_to_student)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',true) RETURNING *
    `, [title, description, instructions, req.user.id,
        durationMinutes || 60, totalMarks || 100, passPercentage || 40,
        startTime || null, endTime || null,
        JSON.stringify(settings || {}),
        JSON.stringify(proctoringSettings || defaultProctoring)]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('createExam error:', error);
    res.status(500).json({ error: 'Failed to create exam' });
  }
}

async function updateExam(req, res) {
  try {
    const { id } = req.params;
    const check = await query('SELECT created_by FROM exams WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Exam not found' });
    if (req.user.role !== 'admin' && check.rows[0].created_by !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    const {
      title, description, instructions, durationMinutes, totalMarks,
      passPercentage, startTime, endTime, status, settings, proctoringSettings,
      accessType, registrationOpen, showResultsToStudent
    } = req.body;

    const result = await query(`
      UPDATE exams SET
        title                   = COALESCE($1, title),
        description             = COALESCE($2, description),
        instructions            = COALESCE($3, instructions),
        duration_minutes        = COALESCE($4, duration_minutes),
        total_marks             = COALESCE($5, total_marks),
        pass_percentage         = COALESCE($6, pass_percentage),
        start_time              = COALESCE($7, start_time),
        end_time                = COALESCE($8, end_time),
        status                  = COALESCE($9, status),
        settings                = COALESCE($10, settings),
        proctoring_settings     = COALESCE($11, proctoring_settings),
        access_type             = COALESCE($12, access_type),
        registration_open       = COALESCE($13, registration_open),
        show_results_to_student = COALESCE($14, show_results_to_student),
        updated_at              = NOW()
      WHERE id = $15 RETURNING *
    `, [title, description, instructions, durationMinutes, totalMarks, passPercentage,
        startTime, endTime, status,
        settings ? JSON.stringify(settings) : null,
        proctoringSettings ? JSON.stringify(proctoringSettings) : null,
        accessType || null,
        registrationOpen !== undefined ? registrationOpen : null,
        showResultsToStudent !== undefined ? showResultsToStudent : null,
        id]);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('updateExam error:', error);
    res.status(500).json({ error: 'Failed to update exam' });
  }
}

async function deleteExam(req, res) {
  try {
    await query('DELETE FROM exams WHERE id = $1', [req.params.id]);
    res.json({ message: 'Exam deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete exam' }); }
}

async function publishExam(req, res) {
  try {
    const { id } = req.params;
    const qCount = await query('SELECT COUNT(*) FROM questions WHERE exam_id = $1', [id]);
    if (parseInt(qCount.rows[0].count) === 0)
      return res.status(400).json({ error: 'Add at least one question before publishing' });
    const result = await query("UPDATE exams SET status='published', updated_at=NOW() WHERE id=$1 RETURNING *", [id]);
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to publish exam' }); }
}

async function getExamStats(req, res) {
  try {
    const { id } = req.params;
    const [sessions, alerts] = await Promise.all([
      query(`SELECT COUNT(*) as total,
        SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) as completed,
        AVG(risk_score) as avg_risk,
        SUM(total_suspicious_events) as total_events
        FROM exam_sessions WHERE exam_id = $1`, [id]),
      query(`SELECT severity, COUNT(*) as count FROM proctoring_alerts
        WHERE exam_id=$1 GROUP BY severity`, [id])
    ]);
    res.json({ sessions: sessions.rows[0], alerts: alerts.rows });
  } catch { res.status(500).json({ error: 'Failed to get stats' }); }
}

module.exports = { getExams, getExam, createExam, updateExam, deleteExam, publishExam, getExamStats };
