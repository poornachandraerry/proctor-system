const logger = require('../utils/logger');

/**
 * Email Service — uses nodemailer if SMTP is configured,
 * otherwise logs to console (safe fallback for development).
 *
 * Returns a clear status object every time so callers (and the UI)
 * can tell whether an email actually left the server.
 */

let transporter = null;
let lastConnectionError = null;

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function getTransporter() {
  if (transporter) return transporter;
  if (!smtpConfigured()) return null;

  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.verify();
    lastConnectionError = null;
    logger.info('SMTP email service connected and verified');
    return transporter;
  } catch (err) {
    lastConnectionError = err.message;
    transporter = null;
    logger.warn('SMTP connection/verification failed:', err.message);
    return null;
  }
}

/**
 * Returns { sent, simulated, error, reason, messageId? }
 * sent      — true only if nodemailer actually dispatched the email
 * simulated — true if no SMTP is configured at all (dev fallback)
 * error     — present if SMTP was configured but sending failed
 */
async function sendEmail({ to, subject, html, text }) {
  if (!smtpConfigured()) {
    logger.info('📧 EMAIL NOT SENT — SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing in environment)');
    logger.info(`   Would have sent to: ${to} | Subject: ${subject}`);
    return {
      sent: false,
      simulated: true,
      error: null,
      reason: 'SMTP not configured — set SMTP_HOST, SMTP_USER and SMTP_PASS in your environment variables',
    };
  }

  const t = await getTransporter();
  if (!t) {
    return {
      sent: false,
      simulated: false,
      error: lastConnectionError || 'Could not connect to SMTP server',
      reason: `SMTP configured but connection failed: ${lastConnectionError || 'unknown error'}`,
    };
  }

  const fromName  = process.env.SMTP_FROM_NAME || 'ProctorAI';
  const fromEmail = process.env.SMTP_USER;

  try {
    const result = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to, subject, html, text,
    });
    logger.info(`✅ Email sent to ${to} — messageId: ${result.messageId}`);
    return { sent: true, simulated: false, error: null, reason: 'Sent successfully', messageId: result.messageId };
  } catch (err) {
    logger.error(`❌ Email send to ${to} failed:`, err.message);
    return { sent: false, simulated: false, error: err.message, reason: `Send failed: ${err.message}` };
  }
}

/**
 * Quick self-test — verifies SMTP is reachable without sending a real
 * templated email. Used by the "Test Email Config" button in the UI.
 */
async function testEmailConfig(testRecipient) {
  if (!smtpConfigured()) {
    return {
      ok: false,
      message: 'SMTP is not configured. Missing one or more of: SMTP_HOST, SMTP_USER, SMTP_PASS.',
      configured: false,
    };
  }
  const t = await getTransporter();
  if (!t) {
    return {
      ok: false,
      message: `SMTP is configured but could not connect/authenticate: ${lastConnectionError}`,
      configured: true,
    };
  }
  if (testRecipient) {
    const result = await sendEmail({
      to: testRecipient,
      subject: 'ProctorAI — Test Email',
      html: '<p>This is a test email from ProctorAI to confirm your SMTP configuration is working correctly.</p>',
      text: 'This is a test email from ProctorAI to confirm your SMTP configuration is working correctly.',
    });
    return {
      ok: result.sent,
      message: result.sent ? `Test email sent successfully to ${testRecipient}` : result.reason,
      configured: true,
    };
  }
  return { ok: true, message: 'SMTP connection verified successfully (no test email sent).', configured: true };
}

// ── Templates ──────────────────────────────────────────────

function examInviteTemplate({ studentName, examTitle, examDate, examDuration, registerLink, orgName, instructions }) {
  const dateStr = examDate ? new Date(examDate).toLocaleString('en-IN', { dateStyle:'full', timeStyle:'short' }) : 'To be announced';
  return {
    subject: `You're invited: ${examTitle} — ${orgName || 'ProctorAI'}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">ProctorAI</div>
          <div style="color:#c4b5fd;font-size:13px;margin-top:4px">Enterprise Examination Platform</div>
        </td></tr>
        <tr><td style="padding:36px 40px">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 8px">Dear ${studentName || 'Candidate'},</p>
          <h2 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0 0 20px">You have been invited to take an exam</h2>
          <div style="background:#0f172a;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #4f46e5">
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:16px">${examTitle}</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:6px 0;width:140px;color:#64748b;font-size:13px">📅 Date &amp; Time</td>
                  <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">${dateStr}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:13px">⏱️ Duration</td>
                  <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">${examDuration || 60} minutes</td></tr>
              <tr><td style="padding:6px 0;color:#64748b;font-size:13px">🏢 Organisation</td>
                  <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">${orgName || 'ProctorAI'}</td></tr>
            </table>
          </div>
          ${instructions ? `<div style="background:#1e3a5f;border-radius:8px;padding:16px;margin:16px 0;color:#93c5fd;font-size:13px;line-height:1.6"><strong>📋 Instructions:</strong><br/>${instructions}</div>` : ''}
          <div style="text-align:center;margin:28px 0">
            <a href="${registerLink}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;display:inline-block">
              Register &amp; View Exam Details →
            </a>
          </div>
          <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin:20px 0">
            <div style="color:#94a3b8;font-size:12px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Requirements</div>
            <ul style="margin:0;padding:0 0 0 16px;color:#cbd5e1;font-size:13px;line-height:2">
              <li>Stable internet connection</li>
              <li>Working webcam and microphone</li>
              <li>Google Chrome or Firefox browser</li>
              <li>Quiet, well-lit environment</li>
            </ul>
          </div>
          <p style="color:#64748b;font-size:12px;line-height:1.6;margin-top:24px">
            This exam is proctored by AI. Your webcam will be monitored throughout.
            If you did not expect this invitation, please ignore this email.
          </p>
        </td></tr>
        <tr><td style="background:#0f172a;padding:20px 40px;text-align:center;border-top:1px solid #1e293b">
          <div style="color:#475569;font-size:12px">Powered by <strong style="color:#6366f1">ProctorAI</strong> — Enterprise Examination Platform</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Dear ${studentName},\n\nYou are invited to: ${examTitle}\nDate: ${dateStr}\nDuration: ${examDuration} minutes\n\nRegister here: ${registerLink}\n\nProctorAI`
  };
}

function examReminderTemplate({ studentName, examTitle, examDate, examLink }) {
  const dateStr = examDate ? new Date(examDate).toLocaleString('en-IN', { dateStyle:'full', timeStyle:'short' }) : '';
  return {
    subject: `Reminder: ${examTitle} starts soon`,
    html: `<div style="font-family:Arial,sans-serif;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;max-width:500px">
      <h2 style="color:#818cf8">⏰ Exam Reminder</h2>
      <p>Hi ${studentName},</p>
      <p>Your exam <strong>${examTitle}</strong> is scheduled for <strong>${dateStr}</strong>.</p>
      <p>Make sure your webcam and internet are ready.</p>
      <a href="${examLink}" style="background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;font-weight:700">Go to Exam →</a>
      <p style="color:#64748b;font-size:12px;margin-top:24px">ProctorAI — Enterprise Examination Platform</p>
    </div>`,
    text: `Hi ${studentName}, your exam "${examTitle}" is scheduled for ${dateStr}. Link: ${examLink}`
  };
}

function scoreCardTemplate({ studentName, examTitle, score, totalMarks, percentage, passed, date }) {
  return {
    subject: `Your result: ${examTitle} — ${passed ? 'PASSED ✓' : 'FAILED ✗'}`,
    html: `<div style="font-family:Arial,sans-serif;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;max-width:500px">
      <h2 style="color:#818cf8">📊 Exam Result</h2>
      <p>Hi ${studentName},</p>
      <p>Your result for <strong>${examTitle}</strong> is now available.</p>
      <div style="background:#1e293b;border-radius:10px;padding:20px;margin:16px 0;border-left:4px solid ${passed?'#10b981':'#ef4444'}">
        <div style="font-size:32px;font-weight:800;color:${passed?'#10b981':'#ef4444'}">${passed?'PASSED':'FAILED'}</div>
        <div style="font-size:24px;color:#fff;margin-top:8px">${score} / ${totalMarks} marks</div>
        <div style="color:#94a3b8">${percentage}%</div>
      </div>
      <p style="color:#64748b;font-size:12px">Result date: ${date} | ProctorAI</p>
    </div>`,
    text: `Hi ${studentName}, your result for "${examTitle}": ${score}/${totalMarks} (${percentage}%) — ${passed?'PASSED':'FAILED'}`
  };
}

module.exports = {
  sendEmail, testEmailConfig, smtpConfigured,
  examInviteTemplate, examReminderTemplate, scoreCardTemplate,
};
