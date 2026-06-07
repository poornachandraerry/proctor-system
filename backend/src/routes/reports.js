const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { generateSessionReport, generateQuestionsTemplate, generateExamReport } = require('../services/excelService');

router.use(authenticate);

// JSON report (for frontend display)
router.get('/session/:sessionId', authorize('admin','examiner'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await query(`
      SELECT es.*, u.first_name || ' ' || u.last_name as student_name, u.email,
        e.title as exam_title, e.total_marks, e.pass_percentage
      FROM exam_sessions es
      JOIN users u ON es.user_id=u.id
      JOIN exams e ON es.exam_id=e.id
      WHERE es.id=$1
    `, [sessionId]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });
    const answers = await query(`
      SELECT a.*, q.question_text, q.question_type, q.marks, q.topic
      FROM answers a JOIN questions q ON a.question_id=q.id WHERE a.session_id=$1
    `, [sessionId]);
    const alerts = await query('SELECT * FROM proctoring_alerts WHERE session_id=$1 ORDER BY timestamp ASC', [sessionId]);
    const totalMarksObtained = answers.rows.reduce((sum, a) => sum + parseFloat(a.marks_obtained || 0), 0);
    const s = session.rows[0];
    res.json({
      session: s, answers: answers.rows, alerts: alerts.rows,
      totalMarksObtained,
      passed: totalMarksObtained >= (s.total_marks * s.pass_percentage / 100)
    });
  } catch (err) { res.status(500).json({ error: 'Failed to generate report' }); }
});

// Excel download — single session
router.get('/session/:sessionId/excel', authorize('admin','examiner'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await query(`
      SELECT es.*, u.first_name || ' ' || u.last_name as student_name, u.email,
        e.title as exam_title, e.total_marks, e.pass_percentage
      FROM exam_sessions es
      JOIN users u ON es.user_id=u.id
      JOIN exams e ON es.exam_id=e.id
      WHERE es.id=$1
    `, [sessionId]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });
    const answers = await query(`
      SELECT a.*, q.question_text, q.question_type, q.marks, q.topic
      FROM answers a JOIN questions q ON a.question_id=q.id WHERE a.session_id=$1
    `, [sessionId]);
    const alerts = await query('SELECT * FROM proctoring_alerts WHERE session_id=$1 ORDER BY timestamp ASC', [sessionId]);
    const totalMarksObtained = answers.rows.reduce((sum, a) => sum + parseFloat(a.marks_obtained || 0), 0);
    const s = session.rows[0];
    const buffer = await generateSessionReport({
      session: s, answers: answers.rows, alerts: alerts.rows,
      totalMarksObtained,
      passed: totalMarksObtained >= (s.total_marks * s.pass_percentage / 100)
    });
    const filename = `ProctorAI_Report_${s.student_name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate Excel report' });
  }
});

// Excel download — full exam overview (all sessions)
router.get('/exam/:examId/excel', authorize('admin','examiner'), async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await query('SELECT * FROM exams WHERE id=$1', [examId]);
    if (!exam.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const sessions = await query(`
      SELECT es.*, u.first_name || ' ' || u.last_name as student_name, u.email,
        COALESCE((SELECT SUM(marks_obtained) FROM answers WHERE session_id=es.id), 0) as marks_obtained,
        (SELECT COUNT(*) FROM proctoring_alerts WHERE session_id=es.id) as alert_count
      FROM exam_sessions es JOIN users u ON es.user_id=u.id
      WHERE es.exam_id=$1 ORDER BY es.created_at ASC
    `, [examId]);
    const buffer = await generateExamReport(exam.rows[0], sessions.rows);
    const filename = `ProctorAI_Exam_${exam.rows[0].title.replace(/\s+/g,'_').slice(0,30)}_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate exam report' });
  }
});

// Download blank question upload template
router.get('/questions/template', authorize('admin','examiner'), async (req, res) => {
  try {
    const buffer = await generateQuestionsTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ProctorAI_Question_Upload_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

module.exports = router;

// Student score card PDF — students can download their own
router.get('/session/:sessionId/scorecard', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await query(`
      SELECT es.*, u.first_name || ' ' || u.last_name as student_name, u.email,
        e.title as exam_title, e.total_marks, e.pass_percentage, e.show_results_to_student
      FROM exam_sessions es
      JOIN users u ON es.user_id=u.id
      JOIN exams e ON es.exam_id=e.id
      WHERE es.id=$1
    `, [sessionId]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });
    const s = session.rows[0];

    // Students can only get their own scorecard
    if (req.user.role === 'student' && s.user_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    // Check if results are released
    if (req.user.role === 'student' && s.show_results_to_student === false)
      return res.status(403).json({ error: 'Results have not been released yet by your examiner' });

    const answers = await query(`
      SELECT a.*, q.question_text, q.question_type, q.marks, q.topic
      FROM answers a JOIN questions q ON a.question_id=q.id WHERE a.session_id=$1
    `, [sessionId]);
    const alerts = await query('SELECT * FROM proctoring_alerts WHERE session_id=$1', [sessionId]);
    const totalMarksObtained = answers.rows.reduce((s, a) => s + parseFloat(a.marks_obtained || 0), 0);
    const passed = totalMarksObtained >= (s.total_marks * s.pass_percentage / 100);

    const { generateScoreCardPDF } = require('../services/pdfService');
    const buffer = await generateScoreCardPDF({ session: s, answers: answers.rows, alerts: alerts.rows, totalMarksObtained, passed });
    const filename = `ScoreCard_${s.student_name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('scorecard error:', err);
    res.status(500).json({ error: 'Failed to generate score card' });
  }
});

// Student — get their own session result (JSON)
router.get('/my-result/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await query(`
      SELECT es.*, e.title as exam_title, e.total_marks, e.pass_percentage, e.show_results_to_student
      FROM exam_sessions es JOIN exams e ON es.exam_id=e.id WHERE es.id=$1
    `, [sessionId]);
    if (!session.rows.length) return res.status(404).json({ error: 'Session not found' });
    const s = session.rows[0];
    if (s.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (!s.show_results_to_student) return res.json({ resultsHidden: true, message: 'Results will be released by your examiner' });

    const answers = await query(`
      SELECT a.*, q.question_text, q.question_type, q.marks, q.explanation
      FROM answers a JOIN questions q ON a.question_id=q.id WHERE a.session_id=$1
    `, [sessionId]);
    const totalMarksObtained = answers.rows.reduce((sum, a) => sum + parseFloat(a.marks_obtained || 0), 0);
    const passed = totalMarksObtained >= (s.total_marks * s.pass_percentage / 100);
    res.json({ session: s, answers: answers.rows, totalMarksObtained, passed });
  } catch { res.status(500).json({ error: 'Failed to get result' }); }
});

// Student performance chart data — all their completed exams
router.get('/my-performance', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const r = await query(`
      SELECT es.id, es.submitted_at, es.risk_score, es.status,
        e.title, e.total_marks, e.pass_percentage,
        COALESCE((SELECT SUM(marks_obtained) FROM answers WHERE session_id=es.id), 0) as marks_obtained
      FROM exam_sessions es
      JOIN exams e ON es.exam_id=e.id
      WHERE es.user_id=$1 AND es.status='submitted'
      ORDER BY es.submitted_at ASC
    `, [userId]);
    const data = r.rows.map(row => ({
      examTitle: row.title,
      date: row.submitted_at,
      marksObtained: parseFloat(row.marks_obtained),
      totalMarks: row.total_marks,
      percentage: Math.round((parseFloat(row.marks_obtained) / row.total_marks) * 100),
      passed: parseFloat(row.marks_obtained) >= (row.total_marks * row.pass_percentage / 100),
      riskScore: Math.round(row.risk_score || 0),
      sessionId: row.id,
    }));
    res.json(data);
  } catch { res.status(500).json({ error: 'Failed to get performance data' }); }
});
