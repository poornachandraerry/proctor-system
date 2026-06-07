const ExcelJS = require('exceljs');

// ── Styles ─────────────────────────────────────────────────
const COLORS = {
  primary:   '4F46E5',
  dark:      '0F172A',
  surface:   '1E293B',
  surface2:  '334155',
  white:     'FFFFFF',
  success:   '059669',
  danger:    'DC2626',
  warning:   'D97706',
  muted:     '94A3B8',
  passed:    'DCFCE7',
  failed:    'FEE2E2',
  headerBg:  '312E81',
};

function applyHeaderStyle(cell, bgColor = COLORS.primary) {
  cell.font = { name: 'Calibri', bold: true, color: { argb: 'FF' + COLORS.white }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF' + COLORS.surface2 } },
    bottom: { style: 'thin', color: { argb: 'FF' + COLORS.surface2 } },
    left: { style: 'thin', color: { argb: 'FF' + COLORS.surface2 } },
    right: { style: 'thin', color: { argb: 'FF' + COLORS.surface2 } },
  };
}

function applyDataStyle(cell, options = {}) {
  cell.font = { name: 'Calibri', size: 10, bold: options.bold || false, color: { argb: 'FF' + (options.color || '1E293B') } };
  if (options.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + options.bg } };
  cell.alignment = { horizontal: options.align || 'left', vertical: 'middle', wrapText: options.wrap || false };
  cell.border = {
    bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
    right:  { style: 'hair', color: { argb: 'FFE2E8F0' } },
  };
}

function addTitleBlock(sheet, title, subtitle, col = 1, endCol = 8) {
  sheet.mergeCells(1, col, 1, endCol);
  const titleCell = sheet.getCell(1, col);
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FF' + COLORS.primary } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells(2, col, 2, endCol);
  const subCell = sheet.getCell(2, col);
  subCell.value = subtitle;
  subCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF' + COLORS.muted } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  // Divider row
  sheet.mergeCells(3, col, 3, endCol);
  const divCell = sheet.getCell(3, col);
  divCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primary } };
  sheet.getRow(3).height = 4;
}

// ── Session Report ──────────────────────────────────────────
async function generateSessionReport(reportData) {
  const { session, answers, alerts, totalMarksObtained, passed } = reportData;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProctorAI';
  wb.created = new Date();

  // ── Sheet 1: Summary ───────────────────────────────────────
  const summarySheet = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  summarySheet.columns = [
    { width: 3 }, { width: 28 }, { width: 30 }, { width: 3 }
  ];

  addTitleBlock(summarySheet, 'ProctorAI — Exam Session Report', `Generated on ${new Date().toLocaleString()}`, 1, 3);

  const addSectionHeader = (row, text) => {
    summarySheet.mergeCells(row, 1, row, 3);
    const c = summarySheet.getCell(row, 1);
    c.value = text;
    c.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FF' + COLORS.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.surface } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    summarySheet.getRow(row).height = 24;
  };

  const addKV = (row, key, value, valueColor) => {
    const kc = summarySheet.getCell(row, 2);
    kc.value = key;
    kc.font = { name: 'Calibri', size: 10, color: { argb: 'FF' + COLORS.muted }, bold: true };
    kc.alignment = { horizontal: 'left', vertical: 'middle' };
    const vc = summarySheet.getCell(row, 3);
    vc.value = value;
    vc.font = { name: 'Calibri', size: 10, color: { argb: 'FF' + (valueColor || '1E293B') }, bold: !!valueColor };
    vc.alignment = { horizontal: 'left', vertical: 'middle' };
    summarySheet.getRow(row).height = 20;
  };

  addSectionHeader(5, '  Student Information');
  addKV(6,  'Student Name',   session.student_name);
  addKV(7,  'Email',          session.email);
  addKV(8,  'Exam Title',     session.exam_title);
  addKV(9,  'Started At',     session.started_at ? new Date(session.started_at).toLocaleString() : '—');
  addKV(10, 'Submitted At',   session.submitted_at ? new Date(session.submitted_at).toLocaleString() : '—');

  addSectionHeader(12, '  Score & Result');
  addKV(13, 'Marks Obtained',  `${Math.round(totalMarksObtained)} / ${session.total_marks}`);
  addKV(14, 'Percentage',      `${Math.round((totalMarksObtained / session.total_marks) * 100)}%`);
  addKV(15, 'Pass Mark',       `${session.pass_percentage}%`);
  addKV(16, 'Result',          passed ? 'PASSED ✓' : 'FAILED ✗', passed ? COLORS.success : COLORS.danger);

  addSectionHeader(18, '  Proctoring Summary');
  addKV(19, 'Risk Score',              `${Math.round(session.risk_score || 0)} / 100`, session.risk_score >= 60 ? COLORS.danger : session.risk_score >= 30 ? COLORS.warning : COLORS.success);
  addKV(20, 'Tab Switches',            session.tab_switches || 0);
  addKV(21, 'Fullscreen Exits',        session.fullscreen_exits || 0);
  addKV(22, 'Copy/Paste Attempts',     session.copy_paste_attempts || 0);
  addKV(23, 'Multiple Faces Detected', session.multiple_faces_detected || 0);
  addKV(24, 'Gaze Away Events',        session.gaze_away_count || 0);
  addKV(25, 'Total Suspicious Events', session.total_suspicious_events || 0);
  addKV(26, 'Flagged for Review',      session.is_flagged ? 'YES — Manual review required' : 'No', session.is_flagged ? COLORS.danger : null);

  if (session.ai_analysis_summary) {
    addSectionHeader(28, '  AI Analysis');
    summarySheet.mergeCells(29, 2, 32, 3);
    const aiCell = summarySheet.getCell(29, 2);
    aiCell.value = session.ai_analysis_summary;
    aiCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF' + COLORS.muted } };
    aiCell.alignment = { wrapText: true, vertical: 'top' };
    summarySheet.getRow(29).height = 80;
  }

  // ── Sheet 2: Answers ──────────────────────────────────────
  const ansSheet = wb.addWorksheet('Answers', { properties: { tabColor: { argb: 'FF059669' } } });
  ansSheet.columns = [
    { header: '#',            key: 'num',      width: 5  },
    { header: 'Question',     key: 'question', width: 50 },
    { header: 'Type',         key: 'type',     width: 14 },
    { header: 'Topic',        key: 'topic',    width: 18 },
    { header: 'Time Spent',   key: 'time',     width: 12 },
    { header: 'Max Marks',    key: 'maxmarks', width: 11 },
    { header: 'Obtained',     key: 'obtained', width: 11 },
    { header: 'Result',       key: 'result',   width: 10 },
  ];

  addTitleBlock(ansSheet, 'Answer Details', `${session.student_name} — ${session.exam_title}`, 1, 8);

  // Header row
  const ansHeaderRow = ansSheet.getRow(5);
  ansSheet.columns.forEach((col, i) => {
    const cell = ansHeaderRow.getCell(i + 1);
    cell.value = col.header;
    applyHeaderStyle(cell);
  });
  ansHeaderRow.height = 28;

  answers.forEach((a, i) => {
    const row = ansSheet.addRow({
      num:      i + 1,
      question: a.question_text,
      type:     a.question_type?.replace(/_/g, ' '),
      topic:    a.topic || '—',
      time:     `${a.time_spent_seconds || 0}s`,
      maxmarks: a.marks,
      obtained: a.marks_obtained || 0,
      result:   a.is_correct === true ? 'Correct' : a.is_correct === false ? 'Wrong' : 'Manual',
    });
    const isCorrect = a.is_correct === true;
    const isWrong = a.is_correct === false;
    const bgColor = isCorrect ? 'F0FDF4' : isWrong ? 'FEF2F2' : 'FFFBEB';

    row.eachCell((cell, colNum) => {
      applyDataStyle(cell, {
        bg: bgColor,
        align: colNum <= 2 ? 'left' : 'center',
        wrap: colNum === 2,
        bold: colNum === 7,
        color: colNum === 8 ? (isCorrect ? COLORS.success : isWrong ? COLORS.danger : COLORS.warning) : '1E293B',
      });
    });
    row.height = 22;
  });

  // Totals row
  const totRow = ansSheet.addRow({ num: '', question: 'TOTAL', type: '', topic: '', time: '', maxmarks: session.total_marks, obtained: Math.round(totalMarksObtained), result: passed ? 'PASS' : 'FAIL' });
  totRow.eachCell(cell => {
    cell.font = { bold: true, name: 'Calibri', size: 10, color: { argb: 'FF' + COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (passed ? COLORS.success : COLORS.danger) } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  totRow.height = 24;

  // ── Sheet 3: Alerts ───────────────────────────────────────
  const alertSheet = wb.addWorksheet('Alerts', { properties: { tabColor: { argb: 'FFDC2626' } } });
  alertSheet.columns = [
    { header: '#',           key: 'num',      width: 5  },
    { header: 'Timestamp',   key: 'ts',       width: 22 },
    { header: 'Alert Type',  key: 'type',     width: 24 },
    { header: 'Severity',    key: 'severity', width: 12 },
    { header: 'Description', key: 'desc',     width: 40 },
    { header: 'Reviewed',    key: 'reviewed', width: 12 },
  ];

  addTitleBlock(alertSheet, 'Proctoring Alerts', `${session.student_name} — ${alerts.length} events recorded`, 1, 6);

  const alertHeaderRow = alertSheet.getRow(5);
  alertSheet.columns.forEach((col, i) => {
    const cell = alertHeaderRow.getCell(i + 1);
    cell.value = col.header;
    applyHeaderStyle(cell, COLORS.danger.replace('#', '') === COLORS.danger ? 'DC2626' : COLORS.danger);
  });
  alertHeaderRow.height = 28;

  const SEVERITY_COLORS = { critical: 'FEE2E2', high: 'FEF3C7', medium: 'FFFBEB', low: 'F0FDF4' };

  alerts.forEach((a, i) => {
    const row = alertSheet.addRow({
      num:      i + 1,
      ts:       new Date(a.timestamp).toLocaleString(),
      type:     a.alert_type?.replace(/_/g, ' '),
      severity: a.severity?.toUpperCase(),
      desc:     a.description || '—',
      reviewed: a.is_reviewed ? 'Yes' : 'Pending',
    });
    const bg = SEVERITY_COLORS[a.severity] || 'FFFFFF';
    row.eachCell(cell => applyDataStyle(cell, { bg, wrap: true }));
    row.height = 20;
  });

  if (alerts.length === 0) {
    const noRow = alertSheet.addRow({ num: '', ts: 'No alerts recorded — clean session', type: '', severity: '', desc: '', reviewed: '' });
    noRow.getCell(2).font = { italic: true, color: { argb: 'FF' + COLORS.muted }, name: 'Calibri', size: 10 };
  }

  // Freeze panes
  [summarySheet, ansSheet, alertSheet].forEach(s => { s.views = [{ state: 'frozen', ySplit: 5 }]; });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

// ── Bulk Questions Template ─────────────────────────────────
async function generateQuestionsTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProctorAI';

  const sheet = wb.addWorksheet('Questions', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  const instrSheet = wb.addWorksheet('Instructions');

  // Instructions sheet
  addTitleBlock(instrSheet, 'ProctorAI — Bulk Question Upload Template', 'Read all instructions before filling the Questions sheet', 1, 4);
  instrSheet.columns = [{ width: 5 }, { width: 30 }, { width: 50 }, { width: 5 }];

  const instructions = [
    ['Column', 'Description', 'Rules'],
    ['question_text', 'The full question', 'Required. Max 2000 characters.'],
    ['question_type', 'Type of question', 'One of: mcq, true_false, short_answer, essay, code'],
    ['option_a', 'Option A text', 'Required for mcq and true_false types'],
    ['option_b', 'Option B text', 'Required for mcq and true_false types'],
    ['option_c', 'Option C text', 'Optional (mcq only)'],
    ['option_d', 'Option D text', 'Optional (mcq only)'],
    ['correct_answer', 'Correct option', 'One of: a, b, c, d — (for mcq/true_false only)'],
    ['marks', 'Points for this question', 'Number. Default: 1'],
    ['negative_marks', 'Marks deducted if wrong', 'Number. Default: 0. Example: 0.25'],
    ['difficulty', 'Difficulty level', 'One of: easy, medium, hard'],
    ['topic', 'Topic/category', 'Optional. Example: "Algebra" or "Arrays"'],
    ['explanation', 'Answer explanation', 'Optional. Shown to students after exam'],
  ];

  instrSheet.getRow(5).height = 28;
  const iHeader = instrSheet.getRow(5);
  ['Column Name', 'Description', 'Rules/Values'].forEach((h, i) => {
    const c = iHeader.getCell(i + 2);
    c.value = h; applyHeaderStyle(c, COLORS.surface);
  });

  instructions.forEach((row, i) => {
    const r = instrSheet.addRow(['', ...row]);
    r.eachCell((cell, ci) => { if (ci >= 2) applyDataStyle(cell, { bg: i % 2 === 0 ? 'F8FAFC' : 'FFFFFF', wrap: true }); });
    r.height = 22;
  });

  // Questions sheet columns
  sheet.columns = [
    { header: 'question_text',   key: 'question_text',   width: 55 },
    { header: 'question_type',   key: 'question_type',   width: 15 },
    { header: 'option_a',        key: 'option_a',        width: 25 },
    { header: 'option_b',        key: 'option_b',        width: 25 },
    { header: 'option_c',        key: 'option_c',        width: 25 },
    { header: 'option_d',        key: 'option_d',        width: 25 },
    { header: 'correct_answer',  key: 'correct_answer',  width: 15 },
    { header: 'marks',           key: 'marks',           width: 8  },
    { header: 'negative_marks',  key: 'negative_marks',  width: 14 },
    { header: 'difficulty',      key: 'difficulty',      width: 12 },
    { header: 'topic',           key: 'topic',           width: 18 },
    { header: 'explanation',     key: 'explanation',     width: 35 },
  ];

  addTitleBlock(sheet, 'ProctorAI — Question Upload Template', 'Fill from row 6 onwards. Do not delete or rename column headers (row 5).', 1, 12);

  const headerRow = sheet.getRow(5);
  sheet.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    applyHeaderStyle(cell);
  });
  headerRow.height = 30;

  // Sample data rows
  const samples = [
    { question_text: 'Which keyword is used to declare a constant in JavaScript?', question_type: 'mcq', option_a: 'var', option_b: 'let', option_c: 'const', option_d: 'static', correct_answer: 'c', marks: 1, negative_marks: 0, difficulty: 'easy', topic: 'JavaScript', explanation: 'const declares a block-scoped constant.' },
    { question_text: 'Python is a compiled language.', question_type: 'true_false', option_a: 'True', option_b: 'False', option_c: '', option_d: '', correct_answer: 'b', marks: 1, negative_marks: 0.25, difficulty: 'easy', topic: 'Python', explanation: 'Python is interpreted, not compiled.' },
    { question_text: 'Explain the concept of polymorphism in OOP with an example.', question_type: 'essay', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: '', marks: 5, negative_marks: 0, difficulty: 'hard', topic: 'OOP', explanation: '' },
  ];

  samples.forEach((s, i) => {
    const row = sheet.addRow(s);
    row.eachCell(cell => applyDataStyle(cell, { bg: i % 2 === 0 ? 'EEF2FF' : 'F8F9FF', wrap: true }));
    row.height = 22;
  });

  // Add 50 empty rows with light styling
  for (let i = 0; i < 50; i++) {
    const row = sheet.addRow({});
    row.eachCell(cell => applyDataStyle(cell, { bg: i % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }));
    row.height = 20;
  }

  // Dropdown validations
  const typeValidation = { type: 'list', allowBlank: true, formulae: ['"mcq,true_false,short_answer,essay,code"'] };
  const answerValidation = { type: 'list', allowBlank: true, formulae: ['"a,b,c,d"'] };
  const diffValidation = { type: 'list', allowBlank: true, formulae: ['"easy,medium,hard"'] };

  for (let i = 6; i <= 200; i++) {
    sheet.getCell(`B${i}`).dataValidation = typeValidation;
    sheet.getCell(`G${i}`).dataValidation = answerValidation;
    sheet.getCell(`J${i}`).dataValidation = diffValidation;
  }

  sheet.views = [{ state: 'frozen', ySplit: 5 }];

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

// ── Exam Overview Report ────────────────────────────────────
async function generateExamReport(examData, sessions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProctorAI';

  const sheet = wb.addWorksheet('Exam Overview', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  sheet.columns = [
    { header: '#',            key: 'num',      width: 5  },
    { header: 'Student Name', key: 'name',     width: 25 },
    { header: 'Email',        key: 'email',    width: 28 },
    { header: 'Started',      key: 'started',  width: 20 },
    { header: 'Submitted',    key: 'submitted',width: 20 },
    { header: 'Marks',        key: 'marks',    width: 12 },
    { header: 'Score %',      key: 'pct',      width: 10 },
    { header: 'Result',       key: 'result',   width: 10 },
    { header: 'Risk Score',   key: 'risk',     width: 11 },
    { header: 'Tab Switches', key: 'tabs',     width: 13 },
    { header: 'Alerts',       key: 'alerts',   width: 9  },
    { header: 'Flagged',      key: 'flagged',  width: 9  },
  ];

  addTitleBlock(sheet, `ProctorAI — Exam Report: ${examData.title}`, `Generated ${new Date().toLocaleString()} · ${sessions.length} participants`, 1, 12);

  const hRow = sheet.getRow(5);
  sheet.columns.forEach((col, i) => { const c = hRow.getCell(i+1); c.value = col.header; applyHeaderStyle(c); });
  hRow.height = 28;

  sessions.forEach((s, i) => {
    const pct = Math.round((s.marks_obtained / examData.total_marks) * 100);
    const passed = pct >= examData.pass_percentage;
    const row = sheet.addRow({
      num: i + 1, name: s.student_name, email: s.email,
      started:   s.started_at  ? new Date(s.started_at).toLocaleString()  : '—',
      submitted: s.submitted_at ? new Date(s.submitted_at).toLocaleString() : 'Not submitted',
      marks:     `${Math.round(s.marks_obtained||0)} / ${examData.total_marks}`,
      pct:       `${pct}%`,
      result:    passed ? 'PASS' : 'FAIL',
      risk:      Math.round(s.risk_score || 0),
      tabs:      s.tab_switches || 0,
      alerts:    s.alert_count  || 0,
      flagged:   s.is_flagged   ? 'YES' : 'No',
    });
    const bg = passed ? 'F0FDF4' : 'FEF2F2';
    row.eachCell((cell, ci) => {
      const isBad = (ci === 8 && !passed) || (ci === 12 && s.is_flagged);
      const isGood = ci === 8 && passed;
      applyDataStyle(cell, { bg, align: ci >= 6 ? 'center' : 'left', bold: ci === 8, color: isBad ? COLORS.danger : isGood ? COLORS.success : '1E293B' });
    });
    row.height = 20;
  });

  sheet.views = [{ state: 'frozen', ySplit: 5 }];
  return await wb.xlsx.writeBuffer();
}

module.exports = { generateSessionReport, generateQuestionsTemplate, generateExamReport };
