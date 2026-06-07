/**
 * LicensingEnforcer — checks all plan limits before allowing actions
 * Called by session, exam, and user controllers to enforce concurrent limits.
 */
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Get the effective plan limits for a user's org
async function getOrgLimits(userId) {
  const r = await query(`
    SELECT
      o.id as org_id,
      o.license_status,
      o.is_sandbox,
      o.sandbox_expires_at,
      o.license_expires_at,
      o.trial_ends_at,
      COALESCE(o.max_concurrent_override, lp.max_concurrent_sessions) as max_concurrent,
      COALESCE(o.max_students_override,   lp.max_students)            as max_students,
      COALESCE(o.max_examiners_override,  lp.max_examiners)           as max_examiners,
      COALESCE(o.max_active_exams_override,lp.max_active_exams)       as max_active_exams,
      lp.ai_proctoring, lp.ai_question_gen, lp.custom_branding,
      lp.api_access, lp.priority_support, lp.name as plan_name,
      lp.slug as plan_slug
    FROM users u
    JOIN organizations o ON u.org_id = o.id
    JOIN license_plans lp ON o.plan_id = lp.id
    WHERE u.id = $1
  `, [userId]);
  if (!r.rows.length) return null;
  return r.rows[0];
}

// Check if the org's license is currently valid
function isLicenseValid(limits) {
  if (!limits) return { valid: false, reason: 'No organisation found. Please contact your administrator.' };
  const now = new Date();
  if (limits.license_status === 'suspended')
    return { valid: false, reason: 'Your organisation licence has been suspended. Please contact your administrator.' };
  if (limits.license_status === 'cancelled')
    return { valid: false, reason: 'Your organisation licence has been cancelled.' };
  if (limits.license_expires_at && new Date(limits.license_expires_at) < now)
    return { valid: false, reason: 'Your organisation licence has expired. Please renew to continue.' };
  if (limits.license_status === 'trial' && limits.trial_ends_at && new Date(limits.trial_ends_at) < now)
    return { valid: false, reason: 'Your free trial has ended. Please upgrade to a paid plan.' };
  if (limits.is_sandbox && limits.sandbox_expires_at && new Date(limits.sandbox_expires_at) < now)
    return { valid: false, reason: 'This sandbox demo has expired.' };
  return { valid: true };
}

// Check concurrent session limit for an org
async function checkConcurrentLimit(orgId, maxConcurrent) {
  const r = await query(`
    SELECT COUNT(*) as active_count
    FROM exam_sessions es
    JOIN users u ON es.user_id = u.id
    WHERE u.org_id = $1 AND es.status = 'active'
  `, [orgId]);
  const current = parseInt(r.rows[0].active_count);
  if (maxConcurrent !== 9999 && current >= maxConcurrent) {
    return {
      allowed: false,
      current,
      max: maxConcurrent,
      reason: `All ${maxConcurrent} exam slots are currently in use. Please wait for another student to finish, or ask your administrator to upgrade your plan.`
    };
  }
  return { allowed: true, current, max: maxConcurrent };
}

// Check registered student limit
async function checkStudentLimit(orgId, maxStudents) {
  const r = await query(`
    SELECT COUNT(*) as count FROM users WHERE org_id=$1 AND role='student' AND is_active=true
  `, [orgId]);
  const current = parseInt(r.rows[0].count);
  if (maxStudents !== 99999 && current >= maxStudents) {
    return {
      allowed: false, current, max: maxStudents,
      reason: `Your plan allows a maximum of ${maxStudents} registered students. Please upgrade to add more.`
    };
  }
  return { allowed: true, current, max: maxStudents };
}

// Check examiner limit
async function checkExaminerLimit(orgId, maxExaminers) {
  const r = await query(`
    SELECT COUNT(*) as count FROM users WHERE org_id=$1 AND role='examiner' AND is_active=true
  `, [orgId]);
  const current = parseInt(r.rows[0].count);
  if (maxExaminers !== 9999 && current >= maxExaminers) {
    return {
      allowed: false, current, max: maxExaminers,
      reason: `Your plan allows a maximum of ${maxExaminers} examiners. Please upgrade to add more.`
    };
  }
  return { allowed: true, current, max: maxExaminers };
}

// Check active published exams limit
async function checkActiveExamsLimit(orgId, maxActiveExams) {
  const r = await query(`
    SELECT COUNT(*) as count FROM exams e
    JOIN users u ON e.created_by = u.id
    WHERE u.org_id = $1 AND e.status IN ('published','active')
  `, [orgId]);
  const current = parseInt(r.rows[0].count);
  if (maxActiveExams !== 9999 && current >= maxActiveExams) {
    return {
      allowed: false, current, max: maxActiveExams,
      reason: `Your plan allows a maximum of ${maxActiveExams} published exams at one time. Archive an existing exam or upgrade your plan.`
    };
  }
  return { allowed: true, current, max: maxActiveExams };
}

// Get live usage stats for an org (for dashboard display)
async function getOrgUsageStats(orgId) {
  const [concurrent, students, examiners, activeExams] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM exam_sessions es JOIN users u ON es.user_id=u.id WHERE u.org_id=$1 AND es.status='active'`, [orgId]),
    query(`SELECT COUNT(*) as count FROM users WHERE org_id=$1 AND role='student' AND is_active=true`, [orgId]),
    query(`SELECT COUNT(*) as count FROM users WHERE org_id=$1 AND role='examiner' AND is_active=true`, [orgId]),
    query(`SELECT COUNT(*) as count FROM exams e JOIN users u ON e.created_by=u.id WHERE u.org_id=$1 AND e.status IN ('published','active')`, [orgId]),
  ]);
  return {
    concurrentSessions: parseInt(concurrent.rows[0].count),
    registeredStudents:  parseInt(students.rows[0].count),
    registeredExaminers: parseInt(examiners.rows[0].count),
    activeExams:         parseInt(activeExams.rows[0].count),
  };
}

module.exports = {
  getOrgLimits,
  isLicenseValid,
  checkConcurrentLimit,
  checkStudentLimit,
  checkExaminerLimit,
  checkActiveExamsLimit,
  getOrgUsageStats,
};
