const logger = require('../utils/logger');

/**
 * Email Service — uses nodemailer if SMTP is configured, 
 * otherwise logs to console (safe fallback for development)
 */

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null; // No SMTP configured — log only
  }
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.verify();
    logger.info('SMTP email service connected');
    return transporter;
  } catch (err) {
    logger.warn('SMTP not available, emails will be logged only:', err.message);
    return null;
  }
}

async function sendEmail({ to, subject, html, text }) {
  const t = await getTransporter();
  const fromName = process.env.SMTP_FROM_NAME || 'ProctorAI';
  const fromEmail = process.env.SMTP_USER || 'noreply@proctorai.com';

  if (!t) {
    // Development fallback — log the email
    logger.info('📧 EMAIL (not sent — SMTP not configured):');
    logger.info(`  To: ${to}`);
    logger.info(`  Subject: ${subject}`);
    logger.info(`  Body preview: ${(text || html || '').slice(0, 200)}`);
    return { simulated: true };
  }

  try {
    const result = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to, subject, html, text,
    });
    logger.info(`Email sent to ${to}: ${result.messageId}`);
    return result;
  } catch (err) {
    logger.error('Email send failed:', err.message);
    throw err;
  }
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
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px">ProctorAI</div>
          <div style="color:#c4b5fd;font-size:13px;margin-top:4px">Enterprise Examination Platform</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 8px">Dear ${studentName || 'Candidate'},</p>
          <h2 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0 0 20px">You have been invited to take an exam</h2>
          <!-- Exam Card -->
          <div style="background:#0f172a;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #4f46e5">
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:16px">${examTitle}</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;width:140px;color:#64748b;font-size:13px">📅 Date &amp; Time</td>
                <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;font-size:13px">⏱️ Duration</td>
                <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">${examDuration || 60} minutes</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;font-size:13px">🏢 Organisation</td>
                <td style="padding:6px 0;color:#e2e8f0;font-size:13px;font-weight:600">${orgName || 'ProctorAI'}</td>
              </tr>
            </table>
          </div>
          ${instructions ? `<div style="background:#1e3a5f;border-radius:8px;padding:16px;margin:16px 0;color:#93c5fd;font-size:13px;line-height:1.6"><strong>📋 Instructions:</strong><br/>${instructions}</div>` : ''}
          <!-- CTA -->
          <div style="text-align:center;margin:28px 0">
            <a href="${registerLink}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;display:inline-block">
              Register &amp; View Exam Details →
            </a>
          </div>
          <!-- Requirements -->
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
        <!-- Footer -->
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

module.exports = { sendEmail, examInviteTemplate, examReminderTemplate, scoreCardTemplate };
