const { query } = require('../config/database');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { sendEmail, examInviteTemplate } = require('../services/emailService');

// ── Email Whitelist ────────────────────────────────────────
async function getEmailWhitelist(req, res) {
  try {
    const { examId } = req.params;
    const r = await query(
      'SELECT * FROM exam_email_whitelist WHERE exam_id=$1 ORDER BY invited_at DESC',
      [examId]
    );
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to get whitelist' }); }
}

async function addEmailsToWhitelist(req, res) {
  try {
    const { examId } = req.params;
    const { emails, sendInvite = true } = req.body;
    if (!Array.isArray(emails) || !emails.length)
      return res.status(400).json({ error: 'Emails array required' });

    // Get exam details for the invite email
    const examRes = await query(
      `SELECT e.*, u.first_name || ' ' || u.last_name as creator_name,
        o.name as org_name
       FROM exams e
       LEFT JOIN users u ON e.created_by = u.id
       LEFT JOIN organizations o ON u.org_id = o.id
       WHERE e.id = $1`, [examId]
    );
    if (!examRes.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRes.rows[0];

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const results = [];

    for (const rawEmail of emails) {
      const email = rawEmail.trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      try {
        // Insert into whitelist
        const token = crypto.randomBytes(24).toString('hex');
        await query(`
          INSERT INTO exam_email_whitelist (exam_id, email, added_by)
          VALUES ($1,$2,$3) ON CONFLICT (exam_id,email) DO NOTHING
        `, [examId, email, req.user.id]);

        // Create invitation record
        await query(`
          INSERT INTO exam_invitations (exam_id, email, token)
          VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
        `, [examId, email, token]);

        // Send invite email if requested
        if (sendInvite) {
          const registerLink = `${baseUrl}/exam-register/${token}`;
          const { subject, html, text } = examInviteTemplate({
            studentName: email.split('@')[0],
            examTitle: exam.title,
            examDate: exam.start_time,
            examDuration: exam.duration_minutes,
            registerLink,
            orgName: exam.org_name,
            instructions: exam.instructions,
          });
          try {
            await sendEmail({ to: email, subject, html, text });
          } catch (emailErr) {
            logger.warn(`Email to ${email} failed (not critical):`, emailErr.message);
          }
        }
        results.push({ email, status: 'added' });
      } catch (err) {
        results.push({ email, status: 'error', error: err.message });
      }
    }

    // Update exam access type
    await query(
      "UPDATE exams SET access_type='email_whitelist' WHERE id=$1",
      [examId]
    );

    res.json({ added: results.filter(r => r.status === 'added').length, results });
  } catch (err) {
    logger.error('addEmailsToWhitelist:', err.message);
    res.status(500).json({ error: 'Failed to add emails' });
  }
}

async function removeEmailFromWhitelist(req, res) {
  try {
    const { examId, email } = req.params;
    await query('DELETE FROM exam_email_whitelist WHERE exam_id=$1 AND email=$2', [examId, decodeURIComponent(email)]);
    res.json({ message: 'Email removed' });
  } catch { res.status(500).json({ error: 'Failed to remove email' }); }
}

async function bulkUploadEmails(req, res) {
  try {
    const { examId } = req.params;
    const { emails, sendInvite } = req.body;
    // Reuse addEmailsToWhitelist logic
    req.body.emails = Array.isArray(emails) ? emails : emails.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
    return addEmailsToWhitelist(req, res);
  } catch { res.status(500).json({ error: 'Bulk upload failed' }); }
}

async function resendInvite(req, res) {
  try {
    const { examId, email } = req.params;
    const examRes = await query('SELECT * FROM exams WHERE id=$1', [examId]);
    if (!examRes.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRes.rows[0];

    const invRes = await query(
      'SELECT * FROM exam_invitations WHERE exam_id=$1 AND email=$2 ORDER BY sent_at DESC LIMIT 1',
      [examId, decodeURIComponent(email)]
    );
    const token = invRes.rows.length ? invRes.rows[0].token : crypto.randomBytes(24).toString('hex');
    if (!invRes.rows.length) {
      await query('INSERT INTO exam_invitations (exam_id,email,token) VALUES ($1,$2,$3)', [examId, email, token]);
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const { subject, html, text } = examInviteTemplate({
      studentName: email.split('@')[0],
      examTitle: exam.title,
      examDate: exam.start_time,
      examDuration: exam.duration_minutes,
      registerLink: `${baseUrl}/exam-register/${token}`,
      orgName: '',
      instructions: exam.instructions,
    });
    await sendEmail({ to: email, subject, html, text });
    await query("UPDATE exam_invitations SET sent_at=NOW(), status='sent' WHERE exam_id=$1 AND email=$2", [examId, email]);
    res.json({ message: 'Invite resent' });
  } catch (err) {
    logger.error('resendInvite:', err.message);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
}

// ── Domain Whitelist ───────────────────────────────────────
async function getDomainWhitelist(req, res) {
  try {
    const r = await query('SELECT * FROM exam_domain_whitelist WHERE exam_id=$1', [req.params.examId]);
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to get domains' }); }
}

async function addDomains(req, res) {
  try {
    const { examId } = req.params;
    const { domains } = req.body;
    if (!Array.isArray(domains) || !domains.length)
      return res.status(400).json({ error: 'Domains array required' });
    for (const domain of domains) {
      const d = domain.trim().toLowerCase().replace(/^@/, '');
      if (!d) continue;
      await query(
        'INSERT INTO exam_domain_whitelist (exam_id,domain,added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [examId, d, req.user.id]
      );
    }
    await query("UPDATE exams SET access_type='domain_whitelist' WHERE id=$1", [examId]);
    res.json({ message: 'Domains added' });
  } catch { res.status(500).json({ error: 'Failed to add domains' }); }
}

async function removeDomain(req, res) {
  try {
    await query('DELETE FROM exam_domain_whitelist WHERE exam_id=$1 AND domain=$2',
      [req.params.examId, decodeURIComponent(req.params.domain)]);
    res.json({ message: 'Domain removed' });
  } catch { res.status(500).json({ error: 'Failed to remove domain' }); }
}

// ── Candidate Registration via invite token ────────────────
async function registerViaToken(req, res) {
  try {
    const { token } = req.params;
    const inv = await query(
      `SELECT ei.*, e.title, e.start_time, e.duration_minutes, e.instructions, e.status as exam_status
       FROM exam_invitations ei JOIN exams e ON ei.exam_id=e.id WHERE ei.token=$1`, [token]
    );
    if (!inv.rows.length) return res.status(404).json({ error: 'Invalid or expired invitation link' });
    const invite = inv.rows[0];
    if (invite.exam_status === 'archived') return res.status(410).json({ error: 'This exam is no longer available' });

    // Mark invite as opened
    await query("UPDATE exam_invitations SET opened_at=NOW(), status='opened' WHERE token=$1", [token]);
    res.json({ invite: { examId: invite.exam_id, examTitle: invite.title, startTime: invite.start_time, duration: invite.duration_minutes, instructions: invite.instructions, email: invite.email } });
  } catch { res.status(500).json({ error: 'Failed to validate token' }); }
}

async function confirmRegistration(req, res) {
  try {
    const { token } = req.params;
    const inv = await query('SELECT * FROM exam_invitations WHERE token=$1', [token]);
    if (!inv.rows.length) return res.status(404).json({ error: 'Invalid token' });
    const invite = inv.rows[0];

    // Find or create student account by email
    let userRes = await query('SELECT id FROM users WHERE email=$1', [invite.email.toLowerCase()]);
    if (!userRes.rows.length) {
      const bcrypt = require('bcryptjs');
      const tempPwd = crypto.randomBytes(6).toString('hex') + 'St1!';
      const hash = await bcrypt.hash(tempPwd, 10);
      userRes = await query(
        `INSERT INTO users (email,password_hash,first_name,last_name,role,is_email_verified,is_active)
         VALUES ($1,$2,$3,$4,'student',true,true) RETURNING id`,
        [invite.email.toLowerCase(), hash, invite.email.split('@')[0], '', ]
      );
      // TODO: send welcome email with tempPwd
    }
    const userId = userRes.rows[0].id;

    // Enroll in exam
    await query(
      `INSERT INTO exam_enrollments (exam_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [invite.exam_id, userId]
    );

    // Mark whitelist as registered
    await query("UPDATE exam_email_whitelist SET registered=true WHERE exam_id=$1 AND email=$2",
      [invite.exam_id, invite.email]);
    await query("UPDATE exam_invitations SET registered_at=NOW(), status='registered' WHERE token=$1", [token]);

    res.json({ message: 'Successfully registered for exam', examId: invite.exam_id });
  } catch (err) {
    logger.error('confirmRegistration:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
}

// ── Access check (called before starting session) ─────────
async function checkExamAccess(req, res) {
  try {
    const { examId } = req.params;
    const userId = req.user.id;
    const examRes = await query('SELECT access_type FROM exams WHERE id=$1', [examId]);
    if (!examRes.rows.length) return res.status(404).json({ error: 'Exam not found' });
    const { access_type } = examRes.rows[0];

    if (access_type === 'open') return res.json({ allowed: true });

    const userRes = await query('SELECT email FROM users WHERE id=$1', [userId]);
    const email = userRes.rows[0]?.email?.toLowerCase();

    if (access_type === 'email_whitelist') {
      const r = await query('SELECT id FROM exam_email_whitelist WHERE exam_id=$1 AND email=$2', [examId, email]);
      return res.json({ allowed: r.rows.length > 0, reason: r.rows.length ? null : 'Your email is not on the invite list for this exam' });
    }

    if (access_type === 'domain_whitelist') {
      const domain = email.split('@')[1];
      const r = await query('SELECT id FROM exam_domain_whitelist WHERE exam_id=$1 AND domain=$2', [examId, domain]);
      return res.json({ allowed: r.rows.length > 0, reason: r.rows.length ? null : `Only candidates with @${domain} email addresses can take this exam` });
    }

    res.json({ allowed: true });
  } catch { res.status(500).json({ error: 'Access check failed' }); }
}

module.exports = {
  getEmailWhitelist, addEmailsToWhitelist, removeEmailFromWhitelist,
  bulkUploadEmails, resendInvite,
  getDomainWhitelist, addDomains, removeDomain,
  registerViaToken, confirmRegistration, checkExamAccess,
};
