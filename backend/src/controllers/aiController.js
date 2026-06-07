const { query } = require('../config/database');
const { analyzeWebcamFrame, analyzeSessionRisk, generateExamQuestions } = require('../services/aiService');
const logger = require('../utils/logger');

async function analyzeFrame(req, res) {
  try {
    const { sessionId, imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Image data required' });

    const analysis = await analyzeWebcamFrame(imageBase64);

    // Create alerts for issues found
    if (sessionId && analysis.flags && analysis.flags.length > 0) {
      const session = await query('SELECT exam_id, user_id FROM exam_sessions WHERE id=$1', [sessionId]);
      if (session.rows.length) {
        const { exam_id, user_id } = session.rows[0];
        for (const flag of analysis.flags) {
          await query(
            'INSERT INTO proctoring_alerts (session_id, user_id, exam_id, alert_type, severity, description, ai_confidence) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [sessionId, user_id, exam_id, 'ai_detection', 'high', flag, analysis.confidence]
          );
        }
        await query('UPDATE exam_sessions SET total_suspicious_events = total_suspicious_events + $1 WHERE id=$2',
          [analysis.flags.length, sessionId]);
      }
    }
    res.json(analysis);
  } catch (err) {
    logger.error('analyzeFrame error:', err);
    res.status(500).json({ error: 'AI analysis failed' });
  }
}

async function analyzeSession(req, res) {
  try {
    const { sessionId } = req.params;
    const sessionRes = await query(
      `SELECT es.*, u.first_name || ' ' || u.last_name as student_name, e.title as exam_title
       FROM exam_sessions es JOIN users u ON es.user_id=u.id JOIN exams e ON es.exam_id=e.id WHERE es.id=$1`,
      [sessionId]
    );
    if (!sessionRes.rows.length) return res.status(404).json({ error: 'Session not found' });
    const s = sessionRes.rows[0];

    const alertRes = await query(
      'SELECT alert_type, severity, COUNT(*) as count FROM proctoring_alerts WHERE session_id=$1 GROUP BY alert_type, severity',
      [sessionId]
    );

    // Calculate risk score
    let riskScore = 0;
    riskScore += Math.min(s.tab_switches * 15, 30);
    riskScore += Math.min(s.fullscreen_exits * 10, 20);
    riskScore += Math.min(s.copy_paste_attempts * 20, 40);
    riskScore += Math.min(s.multiple_faces_detected * 25, 50);
    riskScore += Math.min(s.gaze_away_count * 3, 20);
    riskScore = Math.min(Math.round(riskScore), 100);

    const aiSummary = await analyzeSessionRisk(s, alertRes.rows);

    await query(
      'UPDATE exam_sessions SET risk_score=$1, ai_analysis_summary=$2, is_flagged=$3, updated_at=NOW() WHERE id=$4',
      [riskScore, aiSummary, riskScore >= 60, sessionId]
    );

    res.json({ riskScore, summary: aiSummary, alerts: alertRes.rows, isFlagged: riskScore >= 60 });
  } catch (err) {
    logger.error('analyzeSession error:', err);
    res.status(500).json({ error: 'Session analysis failed' });
  }
}

async function generateQuestion(req, res) {
  try {
    const { topic, difficulty = 'medium', questionType = 'mcq', count = 5 } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });
    const questions = await generateExamQuestions({ topic, difficulty, questionType, count: Math.min(count, 20) });
    res.json({ questions });
  } catch (err) {
    logger.error('generateQuestion error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate questions' });
  }
}

module.exports = { analyzeFrame, analyzeSession, generateQuestion };
