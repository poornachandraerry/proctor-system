const { query } = require('../config/database');

// Returns true if `user` (an authenticated req.user) is allowed to view
// evidence/reports/alerts for the given exam session.
//   - admin (developer/platform admin): always allowed.
//   - org_admin / examiner: only if they belong to the SAME organisation
//     as the user who created the exam. Without this check, any examiner
//     or org_admin could view/listen to another organisation's candidate
//     evidence just by knowing or guessing a session id.
async function canAccessSession(user, sessionId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!['org_admin', 'examiner'].includes(user.role)) return false;

  const r = await query(`
    SELECT creator.org_id
    FROM exam_sessions es
    JOIN exams e ON es.exam_id = e.id
    JOIN users creator ON e.created_by = creator.id
    WHERE es.id = $1
  `, [sessionId]);

  if (!r.rows.length) return false;
  const examOrgId = r.rows[0].org_id;

  // Exams created by a platform admin (no org) are treated as global/shared
  // demo content — any examiner/org_admin may view sessions for those.
  if (!examOrgId) return true;

  return !!user.org_id && user.org_id === examOrgId;
}

// Same check as canAccessSession, but keyed directly off an exam id
// (for endpoints that operate on a whole exam rather than one session).
async function canAccessExam(user, examId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!['org_admin', 'examiner'].includes(user.role)) return false;

  const r = await query(`
    SELECT creator.org_id
    FROM exams e
    JOIN users creator ON e.created_by = creator.id
    WHERE e.id = $1
  `, [examId]);

  if (!r.rows.length) return false;
  const examOrgId = r.rows[0].org_id;
  if (!examOrgId) return true;
  return !!user.org_id && user.org_id === examOrgId;
}

module.exports = { canAccessSession, canAccessExam };
