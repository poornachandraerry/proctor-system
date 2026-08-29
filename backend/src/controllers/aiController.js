const { query } = require('../config/database');
const { analyzeWebcamFrame, analyzeSessionRisk, generateExamQuestions } = require('../services/aiService');
const logger = require('../utils/logger');

async function analyzeFrame(req, res) {
  try {
    const { sessionId, imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Image data required' });

    const analysis = await analyzeWebcamFrame(imageBase64);

    if (sessionId) {
      const session = await query('SELECT exam_id, user_id FROM exam_sessions WHERE id=$1', [sessionId]);
      if (session.rows.length) {
        const { exam_id, user_id } = session.rows[0];

        // If the AI couldn't actually be checked (missing key, API error,
        // unparseable response), don't stay silent about it — one alert
        // per session, so an examiner reviewing the report can tell "AI
        // said this was fine" apart from "AI monitoring wasn't working at
        // all for this candidate" instead of both looking identical.
        if (analysis.ai_unavailable) {
          const already = await query(
            "SELECT id FROM proctoring_alerts WHERE session_id=$1 AND alert_type='ai_monitoring_unavailable'",
            [sessionId]
          );
          if (!already.rows.length) {
            await query(
              'INSERT INTO proctoring_alerts (session_id, user_id, exam_id, alert_type, severity, description) VALUES ($1,$2,$3,$4,$5,$6)',
              [sessionId, user_id, exam_id, 'ai_monitoring_unavailable', 'medium',
               'AI-based face/gaze/object detection was unavailable during this session (see server logs) — only heuristic and event-based checks (camera-blocked, tab-switch, fullscreen) applied.']
            );
          }
          return res.json(analysis);
        }

        // Act directly on the structured fields the model returns — don't
        // rely solely on its freeform `flags` list, which may describe the
        // same issue in inconsistent wording (or omit it) even when the
        // boolean itself is set. Each specific issue gets its own clearly
        // labeled alert and increments the counter the risk score actually
        // reads, instead of only the generic total_suspicious_events tally.
        const events = [];
        if (analysis.face_detected === false)
          events.push({ type: 'face_not_detected', desc: 'No face detected in webcam frame' });
        if (analysis.multiple_faces === true)
          events.push({ type: 'multiple_faces', desc: 'Multiple people detected in webcam frame', counter: 'multiple_faces_detected' });
        if (analysis.looking_away === true)
          events.push({ type: 'gaze_away', desc: 'Candidate appears to be looking away from the screen', counter: 'gaze_away_count' });
        if (analysis.suspicious_objects === true)
          events.push({ type: 'suspicious_object', desc: 'A phone, notes, or other unauthorized material appears visible' });
        // Any other freeform issue the model noticed that isn't already covered above
        for (const flag of (analysis.flags || [])) {
          if (!events.some(e => flag.toLowerCase().includes(e.type.split('_')[0]))) {
            events.push({ type: 'ai_detection', desc: flag });
          }
        }

        if (events.length) {
          for (const ev of events) {
            await query(
              'INSERT INTO proctoring_alerts (session_id, user_id, exam_id, alert_type, severity, description, ai_confidence) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [sessionId, user_id, exam_id, ev.type, ev.type === 'face_not_detected' || ev.type === 'multiple_faces' ? 'high' : 'medium', ev.desc, analysis.confidence]
            );
            if (ev.counter) {
              await query(`UPDATE exam_sessions SET ${ev.counter} = ${ev.counter} + 1 WHERE id=$1`, [sessionId]);
            }
          }
          await query('UPDATE exam_sessions SET total_suspicious_events = total_suspicious_events + $1 WHERE id=$2',
            [events.length, sessionId]);
        }
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
