const { query } = require('../config/database');
const logger = require('../utils/logger');

async function bulkLogEvents(req, res) {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || !events.length)
      return res.status(400).json({ error: 'events array required' });

    for (const ev of events) {
      const { sessionId, questionId, eventType, eventData, timeOnQuestion, timestamp } = ev;
      if (!sessionId || !eventType) continue;
      await query(`
        INSERT INTO question_behaviour_log
          (session_id, question_id, event_type, event_data, time_on_question, timestamp)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamp, NOW()))
      `, [sessionId, questionId || null, eventType,
          JSON.stringify(eventData || {}), timeOnQuestion || 0, timestamp || null]);
    }

    // Update answer metadata from batch
    const viewedEvents  = events.filter(e => e.eventType === 'viewed'          && e.questionId);
    const answeredEvents = events.filter(e => ['answered','changed_answer'].includes(e.eventType) && e.questionId);

    for (const ev of viewedEvents) {
      await query(`
        INSERT INTO answers (session_id, question_id, first_viewed_at, time_spent_seconds)
        VALUES ($1,$2,NOW(),0)
        ON CONFLICT (session_id, question_id) DO UPDATE
          SET first_viewed_at = COALESCE(answers.first_viewed_at, NOW())
      `, [ev.sessionId, ev.questionId]);
    }
    for (const ev of answeredEvents) {
      await query(`
        INSERT INTO answers (session_id, question_id, last_activity_at, time_spent_seconds, change_count)
        VALUES ($1,$2,NOW(),$3,0)
        ON CONFLICT (session_id, question_id) DO UPDATE
          SET last_activity_at   = NOW(),
              time_spent_seconds = GREATEST(answers.time_spent_seconds, $3),
              change_count       = CASE WHEN $4 = 'changed_answer'
                                   THEN COALESCE(answers.change_count,0) + 1
                                   ELSE answers.change_count END
      `, [ev.sessionId, ev.questionId, ev.timeOnQuestion || 0, ev.eventType]);
    }

    res.json({ logged: events.length });
  } catch (err) {
    logger.error('bulkLogEvents:', err.message);
    res.status(500).json({ error: 'Failed to log events' });
  }
}

async function getSessionBehaviour(req, res) {
  try {
    const { sessionId } = req.params;

    const [events, summary] = await Promise.all([
      query(`
        SELECT qbl.*, q.question_text, q.order_index
        FROM question_behaviour_log qbl
        LEFT JOIN questions q ON qbl.question_id=q.id
        WHERE qbl.session_id=$1 ORDER BY qbl.timestamp ASC
      `, [sessionId]),
      query(`
        SELECT q.id, q.question_text, q.order_index, q.marks,
          a.time_spent_seconds, a.first_viewed_at, a.last_activity_at,
          a.change_count, a.is_correct, a.marks_obtained,
          (SELECT COUNT(*) FROM question_behaviour_log
           WHERE session_id=$1 AND question_id=q.id) as event_count,
          (SELECT COUNT(*) FROM question_behaviour_log
           WHERE session_id=$1 AND question_id=q.id
           AND event_type IN ('copy_attempt','paste_attempt')) as suspicious_events
        FROM questions q
        LEFT JOIN answers a ON a.question_id=q.id AND a.session_id=$1
        WHERE q.exam_id=(SELECT exam_id FROM exam_sessions WHERE id=$1)
        ORDER BY q.order_index ASC
      `, [sessionId])
    ]);

    res.json({
      events: events.rows,
      questionSummary: summary.rows,
      totalEvents: events.rows.length,
    });
  } catch (err) {
    logger.error('getSessionBehaviour:', err.message);
    res.status(500).json({ error: 'Failed to get behaviour data' });
  }
}

module.exports = { bulkLogEvents, getSessionBehaviour };
