const PDFDocument = require('pdfkit');

async function generateScoreCardPDF(reportData) {
  return new Promise((resolve, reject) => {
    try {
      const { session, answers, alerts, totalMarksObtained, passed } = reportData;
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PRIMARY   = '#4F46E5';
      const DARK      = '#0F172A';
      const SURFACE   = '#1E293B';
      const SUCCESS   = '#059669';
      const DANGER    = '#DC2626';
      const MUTED     = '#64748B';
      const WHITE     = '#FFFFFF';
      const LIGHT     = '#F1F5F9';

      const scorePct  = Math.round((totalMarksObtained / session.total_marks) * 100);
      const riskLevel = session.risk_score >= 75 ? 'CRITICAL'
        : session.risk_score >= 50 ? 'HIGH'
        : session.risk_score >= 25 ? 'MEDIUM' : 'LOW';

      // ── Header Banner ─────────────────────────────────────
      doc.rect(0, 0, 595, 110).fill(PRIMARY);
      doc.fill(WHITE).font('Helvetica-Bold').fontSize(26).text('Proctor ', 50, 28, { continued: true }).fill('#C4B5FD').text('AIQ');
      doc.fill('#C4B5FD').font('Helvetica').fontSize(11).text('Enterprise Examination Platform', 50, 58);
      doc.fill(WHITE).font('Helvetica-Bold').fontSize(13).text('SCORE CARD', 420, 38);
      doc.fill('#C4B5FD').font('Helvetica').fontSize(9).text(`Generated: ${new Date().toLocaleString('en-IN')}`, 390, 58);

      // ── Result Badge ──────────────────────────────────────
      const badgeColor = passed ? SUCCESS : DANGER;
      doc.rect(50, 130, 495, 90).fill(SURFACE).stroke('#334155');
      doc.circle(510, 175, 40).fill(badgeColor);
      doc.fill(WHITE).font('Helvetica-Bold').fontSize(11).text(passed ? 'PASS' : 'FAIL', 490, 168, { width: 40, align: 'center' });

      doc.fill(LIGHT).font('Helvetica-Bold').fontSize(18).text(session.exam_title, 65, 145, { width: 420 });
      doc.fill(MUTED).font('Helvetica').fontSize(10).text(`Student: ${session.student_name}  |  Email: ${session.email}`, 65, 175);
      doc.fill(MUTED).fontSize(9).text(
        `Started: ${session.started_at ? new Date(session.started_at).toLocaleString('en-IN') : '—'}  |  Submitted: ${session.submitted_at ? new Date(session.submitted_at).toLocaleString('en-IN') : '—'}`,
        65, 192
      );

      // ── Score Grid ────────────────────────────────────────
      const boxes = [
        { label: 'Score',      value: `${Number.isInteger(totalMarksObtained) ? totalMarksObtained : totalMarksObtained.toFixed(2)} / ${session.total_marks}`, color: passed ? SUCCESS : DANGER },
        { label: 'Percentage', value: `${scorePct}%`,                                               color: passed ? SUCCESS : DANGER },
        { label: 'Pass Mark',  value: `${session.pass_percentage}%`,                                color: MUTED  },
        { label: 'Risk Score', value: `${Math.round(session.risk_score || 0)} / 100`,               color: session.risk_score >= 50 ? DANGER : MUTED },
      ];

      let bx = 50;
      boxes.forEach(b => {
        doc.rect(bx, 240, 115, 70).fill('#0F172A').stroke('#334155');
        doc.fill(b.color).font('Helvetica-Bold').fontSize(20).text(b.value, bx + 5, 253, { width: 105, align: 'center' });
        doc.fill(MUTED).font('Helvetica').fontSize(9).text(b.label, bx + 5, 278, { width: 105, align: 'center' });
        bx += 125;
      });

      // ── Proctoring Summary ────────────────────────────────
      doc.fill(PRIMARY).font('Helvetica-Bold').fontSize(12).text('PROCTORING SUMMARY', 50, 335);
      doc.moveTo(50, 350).lineTo(545, 350).stroke('#334155');

      const procItems = [
        ['Tab Switches',           session.tab_switches || 0],
        ['Fullscreen Exits',       session.fullscreen_exits || 0],
        ['Copy/Paste Attempts',    session.copy_paste_attempts || 0],
        ['Multiple Faces',         session.multiple_faces_detected || 0],
        ['Total Suspicious Events',session.total_suspicious_events || 0],
        ['Proctoring Alerts',      alerts.length],
      ];

      let py = 358; let col = 0;
      procItems.forEach(([label, val]) => {
        const x = col === 0 ? 50 : 320;
        doc.fill(MUTED).font('Helvetica').fontSize(10).text(label + ':', x, py, { continued: false });
        const flagged = parseInt(val) > 0 && label !== 'Total Suspicious Events';
        doc.fill(flagged ? DANGER : SUCCESS).font('Helvetica-Bold').fontSize(10).text(String(val), x + 200, py, { width: 60, align: 'right' });
        col++;
        if (col === 2) { col = 0; py += 18; }
      });

      // ── AI Analysis ───────────────────────────────────────
      if (session.ai_analysis_summary) {
        py += 20;
        doc.fill(PRIMARY).font('Helvetica-Bold').fontSize(12).text('AI ANALYSIS', 50, py);
        py += 18;
        doc.moveTo(50, py).lineTo(545, py).stroke('#334155');
        py += 8;
        doc.rect(50, py, 495, Math.min(80, 500 - py)).fill('#0F172A').stroke('#334155');
        doc.fill(LIGHT).font('Helvetica').fontSize(9).text(session.ai_analysis_summary, 60, py + 8, { width: 475, height: 64, ellipsis: true });
        py += Math.min(90, 520 - py);
      }

      // ── Answer Breakdown ──────────────────────────────────
      if (answers.length > 0 && py < 480) {
        py += 20;
        doc.fill(PRIMARY).font('Helvetica-Bold').fontSize(12).text('ANSWER BREAKDOWN', 50, py);
        py += 18;
        doc.moveTo(50, py).lineTo(545, py).stroke('#334155');
        py += 6;

        // Table header
        doc.rect(50, py, 495, 20).fill(PRIMARY);
        doc.fill(WHITE).font('Helvetica-Bold').fontSize(8);
        doc.text('#',    55, py + 6);
        doc.text('Question',  70, py + 6, { width: 280 });
        doc.text('Type',     355, py + 6, { width: 70 });
        doc.text('Marks',    430, py + 6, { width: 50, align: 'right' });
        doc.text('Result',   490, py + 6, { width: 50, align: 'right' });
        py += 22;

        answers.slice(0, 15).forEach((a, i) => {
          if (py > 750) return;
          const rowBg = i % 2 === 0 ? '#0F172A' : '#1E293B';
          doc.rect(50, py, 495, 18).fill(rowBg);
          const resultColor = a.is_correct === true ? SUCCESS : a.is_correct === false ? DANGER : MUTED;
          doc.fill(MUTED).font('Helvetica').fontSize(7.5).text(String(i + 1), 55, py + 5);
          doc.fill(LIGHT).text((a.question_text || '').slice(0, 60) + (a.question_text?.length > 60 ? '…' : ''), 70, py + 5, { width: 280 });
          doc.fill(MUTED).text((a.question_type || '').replace(/_/g, ' '), 355, py + 5, { width: 70 });
          doc.fill(resultColor).font('Helvetica-Bold').text(`${a.marks_obtained || 0}/${a.marks}`, 430, py + 5, { width: 50, align: 'right' });
          doc.fill(resultColor).text(a.is_correct === true ? '✓' : a.is_correct === false ? '✗' : '—', 490, py + 5, { width: 50, align: 'right' });
          py += 18;
        });

        if (answers.length > 15) {
          doc.fill(MUTED).font('Helvetica').fontSize(8).text(`... and ${answers.length - 15} more answers`, 50, py + 5);
        }
      }

      // ── Footer ────────────────────────────────────────────
      doc.rect(0, 800, 595, 42).fill(SURFACE);
      doc.fill(MUTED).font('Helvetica').fontSize(8).text(
        `Proctor AIQ Score Card  |  ${session.exam_title}  |  ${session.student_name}  |  Risk: ${riskLevel}`,
        50, 815, { width: 495, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateScoreCardPDF, generatePracticeReportPDF };

// Practice tests aren't proctored (no risk score, no alerts, no
// pass_percentage on the bank), so this is a leaner scorecard than the
// full exam one above — same branding, just the fields that actually apply.
async function generatePracticeReportPDF(reportData) {
  return new Promise((resolve, reject) => {
    try {
      const { studentName, bankName, submittedAt, score, totalMarks, questions } = reportData;
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PRIMARY = '#4F46E5';
      const SURFACE = '#1E293B';
      const SUCCESS = '#059669';
      const DANGER  = '#DC2626';
      const MUTED   = '#64748B';
      const WHITE   = '#FFFFFF';
      const LIGHT   = '#F1F5F9';

      const scorePct = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
      const passed   = scorePct >= 60;

      doc.rect(0, 0, 595, 110).fill(PRIMARY);
      doc.fill(WHITE).font('Helvetica-Bold').fontSize(26).text('Proctor ', 50, 28, { continued: true }).fill('#C4B5FD').text('AIQ');
      doc.fill('#C4B5FD').font('Helvetica').fontSize(11).text('Practice Test Report', 50, 58);
      doc.fill(WHITE).font('Helvetica-Bold').fontSize(13).text('PRACTICE SCORECARD', 380, 38);
      doc.fill('#C4B5FD').font('Helvetica').fontSize(9).text(`Generated: ${new Date().toLocaleString('en-IN')}`, 390, 58);

      doc.rect(50, 130, 495, 80).fill(SURFACE).stroke('#334155');
      doc.fill(LIGHT).font('Helvetica-Bold').fontSize(18).text(bankName, 65, 148, { width: 420 });
      doc.fill(MUTED).font('Helvetica').fontSize(10).text(`Student: ${studentName}`, 65, 178);
      doc.fill(MUTED).fontSize(9).text(`Submitted: ${submittedAt ? new Date(submittedAt).toLocaleString('en-IN') : '—'}`, 65, 195);

      const boxes = [
        { label: 'Score',      value: `${Number.isInteger(score) ? score : score.toFixed(2)} / ${totalMarks}`, color: passed ? SUCCESS : DANGER },
        { label: 'Percentage', value: `${scorePct}%`, color: passed ? SUCCESS : DANGER },
        { label: 'Correct',    value: `${questions.filter(q => q.is_correct === true).length}`, color: SUCCESS },
        { label: 'Wrong',      value: `${questions.filter(q => q.is_correct === false).length}`, color: DANGER },
      ];
      let bx = 50;
      boxes.forEach(b => {
        doc.rect(bx, 225, 115, 70).fill('#0F172A').stroke('#334155');
        doc.fill(b.color).font('Helvetica-Bold').fontSize(20).text(b.value, bx + 5, 238, { width: 105, align: 'center' });
        doc.fill(MUTED).font('Helvetica').fontSize(9).text(b.label, bx + 5, 263, { width: 105, align: 'center' });
        bx += 125;
      });

      let py = 320;
      doc.fill(PRIMARY).font('Helvetica-Bold').fontSize(12).text('ANSWER KEY', 50, py);
      py += 20;
      doc.fill(MUTED).font('Helvetica-Bold').fontSize(8);
      doc.text('#', 50, py, { width: 20 });
      doc.text('Question', 75, py, { width: 340 });
      doc.text('Marks', 425, py, { width: 55, align: 'right' });
      doc.text('Result', 490, py, { width: 55, align: 'right' });
      py += 14;
      doc.moveTo(50, py).lineTo(545, py).stroke('#334155');
      py += 8;

      questions.forEach((q, i) => {
        if (py > 750) { doc.addPage(); py = 50; }
        const rowColor = q.is_correct ? '#F0FDF4' : '#FEF2F2';
        const textHeight = doc.font('Helvetica').fontSize(8).heightOfString(q.question_text, { width: 340 });
        const rowHeight = Math.max(textHeight + 8, 20);
        doc.rect(50, py - 2, 495, rowHeight).fill(rowColor);
        doc.fill('#1E293B').font('Helvetica').fontSize(8).text(String(i + 1), 50, py, { width: 20 });
        doc.text(q.question_text, 75, py, { width: 340 });
        doc.font('Helvetica-Bold').fillColor(q.is_correct ? SUCCESS : DANGER)
          .text(`${q.marks_obtained}`, 425, py, { width: 55, align: 'right' });
        doc.text(q.is_correct ? '✓' : '✗', 490, py, { width: 55, align: 'right' });
        py += rowHeight;
        if (!q.is_correct && q.correct_answer_text) {
          doc.font('Helvetica-Oblique').fillColor(SUCCESS).fontSize(7.5)
            .text(`Correct answer: ${q.correct_answer_text}`, 75, py, { width: 460 });
          py += 12;
        }
        py += 4;
      });

      doc.fill(MUTED).font('Helvetica').fontSize(7).text(
        `Proctor AIQ Practice Report  |  ${bankName}  |  ${studentName}`,
        50, 800, { width: 495, align: 'center' }
      );

      doc.end();
    } catch (err) { reject(err); }
  });
}
