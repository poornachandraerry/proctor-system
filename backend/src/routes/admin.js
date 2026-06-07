const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate, authorize('admin'));

// Platform-wide analytics
router.get('/analytics', async (req, res) => {
  try {
    const [userGrowth, examStats, alertStats, riskDist] = await Promise.all([
      query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM users
             WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY date ORDER BY date`),
      query(`SELECT status, COUNT(*) as count FROM exams GROUP BY status`),
      query(`SELECT severity, COUNT(*) as count FROM proctoring_alerts
             WHERE timestamp > NOW() - INTERVAL '7 days' GROUP BY severity`),
      query(`SELECT
               CASE WHEN risk_score < 25 THEN 'low' WHEN risk_score < 50 THEN 'medium'
                    WHEN risk_score < 75 THEN 'high' ELSE 'critical' END as risk_level,
               COUNT(*) as count FROM exam_sessions WHERE status='submitted' GROUP BY risk_level`)
    ]);
    res.json({ userGrowth: userGrowth.rows, examStats: examStats.rows, alertStats: alertStats.rows, riskDistribution: riskDist.rows });
  } catch { res.status(500).json({ error: 'Failed to get analytics' }); }
});

// Audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const result = await query(`
      SELECT al.*, u.email, u.first_name || ' ' || u.last_name as user_name
      FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id
      ORDER BY al.created_at DESC LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Failed to get audit logs' }); }
});

module.exports = router;
