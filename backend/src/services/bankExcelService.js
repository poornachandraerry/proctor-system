const ExcelJS = require('exceljs');

const COLORS = {
  primary:  '4F46E5',
  surface:  '1E293B',
  surface2: '334155',
  white:    'FFFFFF',
  muted:    '94A3B8',
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

  sheet.mergeCells(3, col, 3, endCol);
  const divCell = sheet.getCell(3, col);
  divCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primary } };
  sheet.getRow(3).height = 4;
}

// ── Question Bank Bulk Upload Template ──────────────────────
async function generateBankQuestionsTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProctorAI';

  const sheet     = wb.addWorksheet('Questions', { properties: { tabColor: { argb: 'FF4F46E5' } } });
  const instrSheet = wb.addWorksheet('Instructions');

  // ── Instructions sheet ──────────────────────────────────
  addTitleBlock(instrSheet, 'ProctorAI — Question Bank Upload Template', 'Read all instructions before filling the Questions sheet', 1, 4);
  instrSheet.columns = [{ width: 5 }, { width: 30 }, { width: 50 }, { width: 5 }];

  const instructions = [
    ['question_text',  'The full question',          'Required. Max 2000 characters.'],
    ['question_type',  'Type of question',            'One of: mcq, true_false, short_answer, essay'],
    ['option_a',       'Option A text',                'Required for mcq and true_false types'],
    ['option_b',       'Option B text',                'Required for mcq and true_false types'],
    ['option_c',       'Option C text',                'Optional (mcq only)'],
    ['option_d',       'Option D text',                'Optional (mcq only)'],
    ['correct_answer', 'Correct option',                'One of: a, b, c, d — (for mcq/true_false only)'],
    ['marks',          'Points for this question',     'Number. Default: 1'],
    ['negative_marks', 'Marks deducted if wrong',      'Number. Default: 0. Example: 0.25'],
    ['difficulty',     'Difficulty level',              'One of: easy, medium, hard'],
    ['topic',          'Topic/category within module', 'Optional. Example: "Limits" or "Arrays"'],
    ['explanation',    'Answer explanation',            'Optional. Shown to students after practice test'],
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

  // ── Questions sheet ──────────────────────────────────────
  sheet.columns = [
    { header: 'question_text',  key: 'question_text',  width: 55 },
    { header: 'question_type',  key: 'question_type',  width: 15 },
    { header: 'option_a',       key: 'option_a',        width: 25 },
    { header: 'option_b',       key: 'option_b',        width: 25 },
    { header: 'option_c',       key: 'option_c',        width: 25 },
    { header: 'option_d',       key: 'option_d',        width: 25 },
    { header: 'correct_answer', key: 'correct_answer',  width: 15 },
    { header: 'marks',          key: 'marks',           width: 8  },
    { header: 'negative_marks', key: 'negative_marks',  width: 14 },
    { header: 'difficulty',     key: 'difficulty',      width: 12 },
    { header: 'topic',          key: 'topic',           width: 18 },
    { header: 'explanation',    key: 'explanation',     width: 35 },
  ];

  addTitleBlock(sheet, 'ProctorAI — Question Bank Upload', 'Fill from row 6 onwards. Do not delete or rename column headers (row 5).', 1, 12);

  const headerRow = sheet.getRow(5);
  sheet.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    applyHeaderStyle(cell);
  });
  headerRow.height = 30;

  const samples = [
    { question_text: 'What is the derivative of x² with respect to x?', question_type: 'mcq', option_a: 'x', option_b: '2x', option_c: 'x²', option_d: '2', correct_answer: 'b', marks: 1, negative_marks: 0.25, difficulty: 'easy', topic: 'Derivatives', explanation: 'd/dx(x^n) = n·x^(n-1), so d/dx(x²) = 2x.' },
    { question_text: 'The limit of a constant function is always undefined.', question_type: 'true_false', option_a: 'True', option_b: 'False', option_c: '', option_d: '', correct_answer: 'b', marks: 1, negative_marks: 0, difficulty: 'easy', topic: 'Limits', explanation: 'The limit of a constant is the constant itself.' },
    { question_text: 'Explain the concept of continuity at a point with an example.', question_type: 'essay', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: '', marks: 5, negative_marks: 0, difficulty: 'hard', topic: 'Continuity', explanation: '' },
  ];

  samples.forEach((s, i) => {
    const row = sheet.addRow(s);
    row.eachCell(cell => applyDataStyle(cell, { bg: i % 2 === 0 ? 'EEF2FF' : 'F8F9FF', wrap: true }));
    row.height = 22;
  });

  for (let i = 0; i < 50; i++) {
    const row = sheet.addRow({});
    row.eachCell(cell => applyDataStyle(cell, { bg: i % 2 === 0 ? 'FFFFFF' : 'F8FAFC' }));
    row.height = 20;
  }

  const typeValidation   = { type: 'list', allowBlank: true, formulae: ['"mcq,true_false,short_answer,essay"'] };
  const answerValidation = { type: 'list', allowBlank: true, formulae: ['"a,b,c,d"'] };
  const diffValidation   = { type: 'list', allowBlank: true, formulae: ['"easy,medium,hard"'] };

  for (let i = 6; i <= 200; i++) {
    sheet.getCell(`B${i}`).dataValidation = typeValidation;
    sheet.getCell(`G${i}`).dataValidation = answerValidation;
    sheet.getCell(`J${i}`).dataValidation = diffValidation;
  }

  sheet.views = [{ state: 'frozen', ySplit: 5 }];

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

module.exports = { generateBankQuestionsTemplate };
