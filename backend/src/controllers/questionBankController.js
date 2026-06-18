const { query } = require('../config/database');
const logger = require('../utils/logger');

// ── BANKS ──────────────────────────────────────────────────
async function getBanks(req, res) {
  try {
    const { search } = req.query;
    const userId = req.user.id;
    const role   = req.user.role;
    const conditions = [];
    const params = [];

    if (role === 'student') {
      conditions.push('qb.is_public = true');
    } else if (role !== 'admin') {
      params.push(userId);
      conditions.push(`(qb.created_by = $${params.length} OR qb.is_public = true)`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(qb.name ILIKE $${params.length} OR qb.subject ILIKE $${params.length})`);
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const r = await query(`
      SELECT qb.*,
        u.first_name || ' ' || u.last_name as creator_name,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id) as question_count,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id AND difficulty='easy')   as easy_count,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id AND difficulty='medium') as medium_count,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id AND difficulty='hard')   as hard_count
      FROM question_banks qb
      LEFT JOIN users u ON qb.created_by=u.id
      ${where} ORDER BY qb.created_at DESC
    `, params);
    res.json(r.rows);
  } catch (err) {
    logger.error('getBanks:', err.message);
    res.status(500).json({ error: 'Failed to fetch question banks' });
  }
}

async function getBank(req, res) {
  try {
    const r = await query(`
      SELECT qb.*, u.first_name || ' ' || u.last_name as creator_name,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id) as question_count
      FROM question_banks qb
      LEFT JOIN users u ON qb.created_by=u.id WHERE qb.id=$1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Bank not found' });
    res.json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to fetch bank' }); }
}

async function createBank(req, res) {
  try {
    const { name, description, subject, module: mod, isPublic, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'Bank name required' });
    const r = await query(`
      INSERT INTO question_banks (name, description, subject, module, created_by, org_id, is_public, tags)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [name, description, subject, mod, req.user.id,
        req.user.org_id || null, isPublic || false, JSON.stringify(tags || [])]);
    res.status(201).json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to create bank' }); }
}

async function updateBank(req, res) {
  try {
    const { name, description, subject, module: mod, isPublic } = req.body;
    await query(`
      UPDATE question_banks SET
        name=COALESCE($1,name), description=COALESCE($2,description),
        subject=COALESCE($3,subject), module=COALESCE($4,module),
        is_public=COALESCE($5,is_public), updated_at=NOW()
      WHERE id=$6
    `, [name, description, subject, mod, isPublic !== undefined ? isPublic : null, req.params.id]);
    res.json({ message: 'Bank updated' });
  } catch { res.status(500).json({ error: 'Failed to update bank' }); }
}

async function deleteBank(req, res) {
  try {
    await query('DELETE FROM question_banks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Bank deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete bank' }); }
}

// ── BANK QUESTIONS ─────────────────────────────────────────
async function getBankQuestions(req, res) {
  try {
    const { difficulty, topic, search, page=1, limit=50 } = req.query;
    const offset = (page-1)*limit;
    const conditions = [`bank_id=$1`];
    const params = [req.params.id];
    if (difficulty) { params.push(difficulty); conditions.push(`difficulty=$${params.length}`); }
    if (topic)      { params.push(`%${topic}%`); conditions.push(`topic ILIKE $${params.length}`); }
    if (search)     { params.push(`%${search}%`); conditions.push(`question_text ILIKE $${params.length}`); }
    const where = 'WHERE ' + conditions.join(' AND ');
    params.push(limit, offset);
    const [rows, cnt] = await Promise.all([
      query(`SELECT * FROM bank_questions ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params),
      query(`SELECT COUNT(*) FROM bank_questions ${where}`, params.slice(0,-2))
    ]);
    res.json({ questions: rows.rows, total: parseInt(cnt.rows[0].count) });
  } catch { res.status(500).json({ error: 'Failed to fetch questions' }); }
}

async function addBankQuestion(req, res) {
  try {
    const { questionText, questionType, options, correctAnswer, marks,
      negativeMarks, difficulty, topic, tags, explanation, timeLimitSecs } = req.body;
    if (!questionText) return res.status(400).json({ error: 'Question text required' });
    const r = await query(`
      INSERT INTO bank_questions (bank_id, question_text, question_type, options,
        correct_answer, marks, negative_marks, difficulty, topic, tags, explanation, time_limit_secs)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [req.params.id, questionText, questionType || 'mcq',
        options ? JSON.stringify(options) : null,
        correctAnswer ? JSON.stringify(correctAnswer) : null,
        marks || 1, negativeMarks || 0, difficulty || 'medium',
        topic, JSON.stringify(tags || []), explanation, timeLimitSecs || null]);
    res.status(201).json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to add question' }); }
}

async function bulkAddBankQuestions(req, res) {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || !questions.length)
      return res.status(400).json({ error: 'Questions array required' });
    let added = 0;
    for (const q of questions) {
      if (!q.questionText) continue;
      await query(`
        INSERT INTO bank_questions (bank_id, question_text, question_type, options,
          correct_answer, marks, negative_marks, difficulty, topic, explanation)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [req.params.id, q.questionText, q.questionType || 'mcq',
          q.options ? JSON.stringify(q.options) : null,
          q.correctAnswer ? JSON.stringify(q.correctAnswer) : null,
          q.marks || 1, q.negativeMarks || 0, q.difficulty || 'medium', q.topic, q.explanation]);
      added++;
    }
    res.status(201).json({ added });
  } catch { res.status(500).json({ error: 'Failed to bulk add questions' }); }
}

async function updateBankQuestion(req, res) {
  try {
    const { questionText, questionType, options, correctAnswer,
      marks, negativeMarks, difficulty, topic, explanation } = req.body;
    await query(`
      UPDATE bank_questions SET
        question_text=COALESCE($1,question_text), question_type=COALESCE($2,question_type),
        options=COALESCE($3,options), correct_answer=COALESCE($4,correct_answer),
        marks=COALESCE($5,marks), negative_marks=COALESCE($6,negative_marks),
        difficulty=COALESCE($7,difficulty), topic=COALESCE($8,topic),
        explanation=COALESCE($9,explanation) WHERE id=$10
    `, [questionText, questionType,
        options ? JSON.stringify(options) : null,
        correctAnswer ? JSON.stringify(correctAnswer) : null,
        marks, negativeMarks, difficulty, topic, explanation, req.params.qid]);
    res.json({ message: 'Question updated' });
  } catch { res.status(500).json({ error: 'Failed to update question' }); }
}

async function deleteBankQuestion(req, res) {
  try {
    await query('DELETE FROM bank_questions WHERE id=$1', [req.params.qid]);
    res.json({ message: 'Question deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete question' }); }
}

// ── GENERATE EXAM FROM BANK (examiner) ────────────────────
async function generateExamFromBank(req, res) {
  try {
    const { bankId, numQuestions, difficulty, durationMinutes,
      title, passPercentage, proctoringSettings } = req.body;
    if (!bankId || !numQuestions || !durationMinutes || !title)
      return res.status(400).json({ error: 'bankId, numQuestions, durationMinutes and title are required' });

    const diffCondition = (difficulty && difficulty !== 'mixed') ? `AND difficulty = '${difficulty}'` : '';
    const qRes = await query(`
      SELECT * FROM bank_questions WHERE bank_id=$1 ${diffCondition}
      ORDER BY RANDOM() LIMIT $2
    `, [bankId, parseInt(numQuestions)]);

    if (!qRes.rows.length)
      return res.status(400).json({ error: 'Not enough questions in this bank for the selected criteria' });

    const defaultProctoring = {
      webcam_required: true, fullscreen_required: true, tab_switch_allowed: false,
      copy_paste_blocked: true, face_detection: true, gaze_tracking: true,
      ai_analysis: true, screenshot_interval: 30, max_warnings: 3,
    };
    const totalMarks = qRes.rows.reduce((s, q) => s + parseFloat(q.marks), 0);

    const examRes = await query(`
      INSERT INTO exams (title, created_by, duration_minutes, total_marks,
        pass_percentage, status, proctoring_settings, access_type,
        show_results_to_student, description)
      VALUES ($1,$2,$3,$4,$5,'draft',$6,'open',true,$7) RETURNING *
    `, [title, req.user.id, durationMinutes, totalMarks,
        passPercentage || 40,
        JSON.stringify(proctoringSettings || defaultProctoring),
        `Generated from question bank — ${difficulty || 'mixed'} difficulty, ${numQuestions} questions`]);

    const exam = examRes.rows[0];
    for (let i = 0; i < qRes.rows.length; i++) {
      const q = qRes.rows[i];
      await query(`
        INSERT INTO questions (exam_id, question_text, question_type, options,
          correct_answer, marks, negative_marks, difficulty, topic, explanation, order_index)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [exam.id, q.question_text, q.question_type, q.options,
          q.correct_answer, q.marks, q.negative_marks,
          q.difficulty, q.topic, q.explanation, i]);
    }
    res.status(201).json({ exam, questionsAdded: qRes.rows.length });
  } catch (err) {
    logger.error('generateExamFromBank:', err.message);
    res.status(500).json({ error: 'Failed to generate exam from bank' });
  }
}

// ── PRACTICE TEST (student self-service) ──────────────────
async function generatePracticeTest(req, res) {
  try {
    const { bankId, numQuestions, durationMinutes, difficulty } = req.body;
    if (!bankId || !numQuestions || !durationMinutes)
      return res.status(400).json({ error: 'bankId, numQuestions and durationMinutes required' });

    const diffCondition = (difficulty && difficulty !== 'mixed') ? `AND difficulty = '${difficulty}'` : '';
    const qRes = await query(`
      SELECT id, question_text, question_type, options, marks, difficulty, topic, time_limit_secs
      FROM bank_questions
      WHERE bank_id=$1 ${diffCondition}
      ORDER BY RANDOM() LIMIT $2
    `, [bankId, Math.min(parseInt(numQuestions), 100)]);

    if (!qRes.rows.length)
      return res.status(400).json({ error: 'Not enough questions available for this selection' });

    const totalMarks = qRes.rows.reduce((s, q) => s + parseFloat(q.marks), 0);
    const questionIds = qRes.rows.map(q => q.id);

    const sessRes = await query(`
      INSERT INTO practice_sessions
        (student_id, bank_id, question_ids, num_questions, duration_mins, difficulty, total_marks)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.user.id, bankId, JSON.stringify(questionIds),
        qRes.rows.length, durationMinutes, difficulty || 'mixed', totalMarks]);

    res.status(201).json({
      practiceSession: sessRes.rows[0],
      questions: qRes.rows,
      totalMarks,
    });
  } catch (err) {
    logger.error('generatePracticeTest:', err.message);
    res.status(500).json({ error: 'Failed to generate practice test' });
  }
}

async function submitPracticeTest(req, res) {
  try {
    const { sessionId } = req.params;
    const { answers } = req.body;

    const sessRes = await query(
      'SELECT * FROM practice_sessions WHERE id=$1 AND student_id=$2',
      [sessionId, req.user.id]
    );
    if (!sessRes.rows.length) return res.status(404).json({ error: 'Practice session not found' });
    const sess = sessRes.rows[0];
    if (sess.status !== 'active') return res.status(400).json({ error: 'Session already submitted' });

    const qIds = sess.question_ids;
    const questions = await query(
      `SELECT * FROM bank_questions WHERE id = ANY($1::uuid[])`, [qIds]
    );

    let score = 0;
    const results = {};
    for (const q of questions.rows) {
      const userAnswer = answers[q.id];
      if (!userAnswer) { results[q.id] = { correct: false, marks: 0 }; continue; }
      const correct = JSON.stringify(userAnswer) === JSON.stringify(q.correct_answer);
      const marks   = correct ? parseFloat(q.marks) : -parseFloat(q.negative_marks || 0);
      score += Math.max(marks, 0);
      results[q.id] = {
        correct, marks: Math.max(marks, 0),
        correctAnswer: q.correct_answer,
        explanation: q.explanation,
      };
    }

    await query(`
      UPDATE practice_sessions
      SET status='submitted', submitted_at=NOW(), answers=$1, score=$2
      WHERE id=$3
    `, [JSON.stringify(answers), score, sessionId]);

    res.json({
      score, totalMarks: sess.total_marks,
      percentage: Math.round((score / sess.total_marks) * 100),
      results,
    });
  } catch (err) {
    logger.error('submitPracticeTest:', err.message);
    res.status(500).json({ error: 'Failed to submit practice test' });
  }
}

async function getPracticeHistory(req, res) {
  try {
    const r = await query(`
      SELECT ps.*, qb.name as bank_name, qb.subject
      FROM practice_sessions ps
      JOIN question_banks qb ON ps.bank_id=qb.id
      WHERE ps.student_id=$1
      ORDER BY ps.created_at DESC LIMIT 20
    `, [req.user.id]);
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to get practice history' }); }
}

module.exports = {
  getBanks, getBank, createBank, updateBank, deleteBank,
  getBankQuestions, addBankQuestion, bulkAddBankQuestions,
  updateBankQuestion, deleteBankQuestion,
  generateExamFromBank,
  generatePracticeTest, submitPracticeTest, getPracticeHistory,
};
