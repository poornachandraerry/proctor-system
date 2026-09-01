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
    params.push(userId); // for the trial-used subquery below
    const trialParamIdx = params.length;
    const r = await query(`
      SELECT qb.*,
        u.first_name || ' ' || u.last_name as creator_name,
        sc.name as target_category_name,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id) as question_count,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id AND difficulty='easy')   as easy_count,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id AND difficulty='medium') as medium_count,
        (SELECT COUNT(*) FROM bank_questions WHERE bank_id=qb.id AND difficulty='hard')   as hard_count,
        EXISTS(SELECT 1 FROM bank_free_trials WHERE bank_id=qb.id AND user_id=$${trialParamIdx}) as trial_used
      FROM question_banks qb
      LEFT JOIN users u ON qb.created_by=u.id
      LEFT JOIN student_categories sc ON qb.target_category_id=sc.id
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
    const { name, description, subject, module: mod, isPublic, tags, pricePerAttempt, targetCategoryId, freeTrialQuestions } = req.body;
    if (!name) return res.status(400).json({ error: 'Bank name required' });
    const r = await query(`
      INSERT INTO question_banks (name, description, subject, module, created_by, org_id, is_public, tags, price_per_attempt, target_category_id, free_trial_questions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [name, description, subject, mod, req.user.id,
        req.user.org_id || null, isPublic || false, JSON.stringify(tags || []),
        parseFloat(pricePerAttempt) || 0, targetCategoryId || null,
        freeTrialQuestions !== undefined ? Math.max(0, parseInt(freeTrialQuestions)) : 5]);
    res.status(201).json(r.rows[0]);
  } catch { res.status(500).json({ error: 'Failed to create bank' }); }
}

async function updateBank(req, res) {
  try {
    const { name, description, subject, module: mod, isPublic, pricePerAttempt, targetCategoryId, freeTrialQuestions } = req.body;
    await query(`
      UPDATE question_banks SET
        name=COALESCE($1,name), description=COALESCE($2,description),
        subject=COALESCE($3,subject), module=COALESCE($4,module),
        is_public=COALESCE($5,is_public),
        price_per_attempt=COALESCE($6,price_per_attempt),
        target_category_id=COALESCE($7,target_category_id),
        free_trial_questions=COALESCE($8,free_trial_questions), updated_at=NOW()
      WHERE id=$9
    `, [name, description, subject, mod, isPublic !== undefined ? isPublic : null,
        pricePerAttempt !== undefined ? parseFloat(pricePerAttempt) : null,
        targetCategoryId !== undefined ? targetCategoryId : null,
        freeTrialQuestions !== undefined ? Math.max(0, parseInt(freeTrialQuestions)) : null,
        req.params.id]);
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

// Topic list only — no question text or answers — so students can pick
// what to practice without ever seeing the actual bank content.
async function getBankTopics(req, res) {
  try {
    const r = await query(`
      SELECT topic, COUNT(*) as count
      FROM bank_questions
      WHERE bank_id=$1 AND topic IS NOT NULL AND topic != ''
      GROUP BY topic ORDER BY topic ASC
    `, [req.params.id]);
    res.json(r.rows);
  } catch { res.status(500).json({ error: 'Failed to fetch topics' }); }
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
    const { bankId, numQuestions, durationMinutes, difficulty, topics } = req.body;
    if (!bankId || !numQuestions || !durationMinutes)
      return res.status(400).json({ error: 'bankId, numQuestions and durationMinutes required' });

    const bankRes = await query('SELECT id, name, price_per_attempt, free_trial_questions FROM question_banks WHERE id=$1', [bankId]);
    if (!bankRes.rows.length) return res.status(404).json({ error: 'Question bank not found' });
    const bank = bankRes.rows[0];
    const price = parseFloat(bank.price_per_attempt || 0);
    const trialLimit = parseInt(bank.free_trial_questions || 0);

    // Priced banks require one unconsumed, verified-paid credit per
    // attempt — never a running balance. If none exists, check whether
    // this student still has their one free trial available on THIS bank
    // (a freemium taste of the interface/questions, capped to a smaller
    // question count than a paid attempt) before asking for payment. The
    // developer admin role is exempt from payment entirely (needs to
    // preview/QA priced banks without paying every time).
    let credit = null;
    let trialQuestionCap = null;
    let usingFreeTrial = false;
    if (price > 0 && req.user.role !== 'admin') {
      const creditRes = await query(`
        SELECT * FROM bank_payment_credits
        WHERE user_id=$1 AND bank_id=$2 AND status='paid' AND consumed_at IS NULL
        ORDER BY created_at ASC LIMIT 1
      `, [req.user.id, bankId]);

      if (creditRes.rows.length) {
        credit = creditRes.rows[0];
      } else if (trialLimit > 0) {
        const trialRes = await query(
          'SELECT id FROM bank_free_trials WHERE user_id=$1 AND bank_id=$2', [req.user.id, bankId]
        );
        if (!trialRes.rows.length) {
          usingFreeTrial = true;
          trialQuestionCap = trialLimit;
        }
      }

      if (!credit && !usingFreeTrial) {
        return res.status(402).json({
          error: `This question bank requires payment — ₹${price} per practice attempt.`,
          code: 'PAYMENT_REQUIRED',
          pricePerAttempt: price,
          bankId,
        });
      }
    }

    const conditions = ['bank_id=$1'];
    const params = [bankId];
    if (difficulty && difficulty !== 'mixed') {
      params.push(difficulty);
      conditions.push(`difficulty=$${params.length}`);
    }
    if (Array.isArray(topics) && topics.length > 0) {
      params.push(topics);
      conditions.push(`topic = ANY($${params.length}::text[])`);
    }
    // A free-trial attempt is deliberately capped below whatever the
    // student asked for, regardless of price_per_attempt's usual filters —
    // it's meant as a taste of the interface/question style, not a full
    // free attempt at paid-bank scale.
    const effectiveNumQuestions = trialQuestionCap
      ? Math.min(parseInt(numQuestions), trialQuestionCap, 100)
      : Math.min(parseInt(numQuestions), 100);
    params.push(effectiveNumQuestions);

    const qRes = await query(`
      SELECT id, question_text, question_type, options, marks, difficulty, topic, time_limit_secs
      FROM bank_questions
      WHERE ${conditions.join(' AND ')}
      ORDER BY RANDOM() LIMIT $${params.length}
    `, params);

    if (!qRes.rows.length)
      return res.status(400).json({ error: 'Not enough questions available for this selection' });

    const totalMarks = qRes.rows.reduce((s, q) => s + parseFloat(q.marks), 0);
    const questionIds = qRes.rows.map(q => q.id);

    const sessRes = await query(`
      INSERT INTO practice_sessions
        (student_id, bank_id, question_ids, num_questions, duration_mins, difficulty, total_marks, credit_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.user.id, bankId, JSON.stringify(questionIds),
        qRes.rows.length, durationMinutes, difficulty || 'mixed', totalMarks,
        credit ? credit.id : null]);

    if (credit) {
      await query(
        "UPDATE bank_payment_credits SET consumed_at=NOW(), practice_session_id=$1 WHERE id=$2",
        [sessRes.rows[0].id, credit.id]
      );
    }
    if (usingFreeTrial) {
      // ON CONFLICT DO NOTHING: the UNIQUE(user_id, bank_id) constraint is
      // what actually enforces "only one free trial ever" — if a race let
      // two requests both reach here, only one insert wins; the second
      // request's session already exists by this point, which is a much
      // smaller problem than double-billing would be, so we don't roll it
      // back for this rare edge case.
      await query(
        'INSERT INTO bank_free_trials (user_id, bank_id, practice_session_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, bank_id) DO NOTHING',
        [req.user.id, bankId, sessRes.rows[0].id]
      );
    }

    res.status(201).json({
      practiceSession: sessRes.rows[0],
      questions: qRes.rows,
      totalMarks,
      freeTrial: usingFreeTrial,
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
      score += marks;
      results[q.id] = {
        correct, marks,
        correctAnswer: q.correct_answer,
        explanation: q.explanation,
      };
    }
    // Same fix as the main exam grading path: previously Math.max(marks, 0)
    // discarded negative marking entirely, both per-question and in the
    // running total. Now both reflect the real penalty — consistent with
    // the main exam path, a negative overall score is possible and expected
    // wherever negative marking is enabled.

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

// PDF scorecard for a completed practice test — regenerated on demand from
// the persisted answers/score rather than only being available once at
// submit time, so a student can come back and redownload it later.
async function getPracticeResultPdf(req, res) {
  try {
    const { sessionId } = req.params;
    const sessRes = await query(`
      SELECT ps.*, qb.name as bank_name,
        u.first_name || ' ' || u.last_name as student_name
      FROM practice_sessions ps
      JOIN question_banks qb ON ps.bank_id=qb.id
      JOIN users u ON ps.student_id=u.id
      WHERE ps.id=$1 AND ps.student_id=$2
    `, [sessionId, req.user.id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: 'Practice session not found' });
    const sess = sessRes.rows[0];
    if (sess.status !== 'submitted') return res.status(400).json({ error: 'This practice test has not been submitted yet' });

    const qRes = await query('SELECT * FROM bank_questions WHERE id = ANY($1::uuid[])', [sess.question_ids]);
    const byId = Object.fromEntries(qRes.rows.map(q => [q.id, q]));
    const studentAnswers = sess.answers || {};

    // Preserve the order the student actually saw the questions in.
    const questions = sess.question_ids.map(qid => {
      const q = byId[qid];
      if (!q) return null;
      const userAnswer = studentAnswers[qid];
      const is_correct = userAnswer ? JSON.stringify(userAnswer) === JSON.stringify(q.correct_answer) : false;
      const marks_obtained = is_correct ? parseFloat(q.marks) : (userAnswer ? -parseFloat(q.negative_marks || 0) : 0);
      return {
        question_text: q.question_text,
        marks_obtained,
        is_correct,
        // Matches the same "Option X" convention already shown in the app's
        // own results review, for consistency between screen and PDF.
        correct_answer_text: `Option ${String(q.correct_answer).toUpperCase()}`,
      };
    }).filter(Boolean);

    const { generatePracticeReportPDF } = require('../services/pdfService');
    const buffer = await generatePracticeReportPDF({
      studentName: sess.student_name,
      bankName: sess.bank_name,
      submittedAt: sess.submitted_at,
      score: parseFloat(sess.score || 0),
      totalMarks: parseFloat(sess.total_marks || 0),
      questions,
    });

    const filename = `ProctorAIQ_Practice_${sess.bank_name.replace(/\s+/g,'_')}_${new Date(sess.submitted_at).toISOString().slice(0,10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('getPracticeResultPdf:', err.message);
    res.status(500).json({ error: 'Failed to generate practice report' });
  }
}

module.exports = {
  getBanks, getBank, createBank, updateBank, deleteBank,
  getBankQuestions, getBankTopics, addBankQuestion, bulkAddBankQuestions,
  updateBankQuestion, deleteBankQuestion,
  generateExamFromBank,
  generatePracticeTest, submitPracticeTest, getPracticeHistory, getPracticeResultPdf,
};
