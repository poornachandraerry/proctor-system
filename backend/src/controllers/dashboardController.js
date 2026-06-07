const { query } = require('../config/database');

async function getDashboard(req, res) {
  try {
    const role   = req.user.role;
    const userId = req.user.id;

    if (role === 'admin') {
      const [users, exams, sessions, alerts, activity] = await Promise.all([
        query('SELECT COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active FROM users'),
        query("SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as live FROM exams"),
        query("SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active FROM exam_sessions"),
        query("SELECT COUNT(*) as total, SUM(CASE WHEN is_reviewed=false THEN 1 ELSE 0 END) as unreviewed FROM proctoring_alerts WHERE severity IN ('high','critical')"),
        query(`SELECT 'alert' as type, pa.severity, pa.alert_type as title, pa.timestamp as created_at,
          u.first_name || ' ' || u.last_name as user_name
          FROM proctoring_alerts pa JOIN users u ON pa.user_id = u.id
          ORDER BY pa.timestamp DESC LIMIT 10`)
      ]);
      res.json({
        stats: { users: users.rows[0], exams: exams.rows[0], sessions: sessions.rows[0], alerts: alerts.rows[0] },
        recentActivity: activity.rows
      });

    } else if (role === 'examiner' || role === 'org_admin') {
      const [myExams, mySessions, myAlerts, recentExams] = await Promise.all([
        query('SELECT COUNT(*) as total FROM exams WHERE created_by=$1', [userId]),
        query("SELECT COUNT(*) as total FROM exam_sessions es JOIN exams e ON es.exam_id=e.id WHERE e.created_by=$1 AND es.status='active'", [userId]),
        query("SELECT COUNT(*) as unreviewed FROM proctoring_alerts pa JOIN exams e ON pa.exam_id=e.id WHERE e.created_by=$1 AND pa.is_reviewed=false", [userId]),
        query(`SELECT e.*, (SELECT COUNT(*) FROM exam_sessions WHERE exam_id=e.id) as session_count
          FROM exams e WHERE created_by=$1 ORDER BY created_at DESC LIMIT 5`, [userId])
      ]);
      res.json({
        stats: {
          myExams:          myExams.rows[0].total,
          activeSessions:   mySessions.rows[0].total,
          unreviewedAlerts: myAlerts.rows[0].unreviewed
        },
        recentExams: recentExams.rows
      });

    } else {
      // Student
      const [enrolled, completed, upcoming, completedSessions] = await Promise.all([
        query("SELECT COUNT(*) FROM exam_enrollments WHERE user_id=$1", [userId]),
        query("SELECT COUNT(*) FROM exam_sessions WHERE user_id=$1 AND status='submitted'", [userId]),
        query(`SELECT e.id, e.title, e.duration_minutes, e.start_time, e.status, e.description
          FROM exams e
          LEFT JOIN exam_enrollments ee ON e.id=ee.exam_id AND ee.user_id=$1
          WHERE e.status='published' AND (ee.user_id=$1 OR e.access_type='open')
          ORDER BY e.start_time ASC NULLS LAST LIMIT 8`, [userId]),
        query(`SELECT es.id, es.submitted_at, es.status, e.title, e.total_marks, e.pass_percentage
          FROM exam_sessions es JOIN exams e ON es.exam_id=e.id
          WHERE es.user_id=$1 AND es.status='submitted'
          ORDER BY es.submitted_at DESC LIMIT 5`, [userId])
      ]);
      res.json({
        stats: {
          enrolledExams:  enrolled.rows[0].count,
          completedExams: completed.rows[0].count
        },
        upcomingExams:  upcoming.rows,
        completedExams: completedSessions.rows
      });
    }
  } catch (error) {
    console.error('getDashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
}

module.exports = { getDashboard };
