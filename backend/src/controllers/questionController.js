const { query } = require('../config/database');

async function getQuestions(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const isStudent = req.user.role === 'student';
    const fields = isStudent
      ? 'id, question_text, question_type, options, marks, order_index, time_limit_seconds, is_required, topic, difficulty'
      : 'id, question_text, question_type, options, correct_answer, marks, negative_marks, order_index, time_limit_seconds, is_required, topic, difficulty, explanation';
    const result = await query(
      `SELECT ${fields} FROM questions WHERE exam_id=$1 ORDER BY order_index ASC`,
      [examId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch questions' }); }
}

async function createQuestion(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const { questionText, questionType, options, correctAnswer, marks, negativeMarks, explanation, difficulty, topic, timeLimitSeconds, orderIndex } = req.body;
    if (!questionText || !questionType) return res.status(400).json({ error: 'Question text and type are required' });
    const countResult = await query('SELECT COUNT(*) FROM questions WHERE exam_id=$1', [examId]);
    const nextOrder = orderIndex !== undefined ? orderIndex : parseInt(countResult.rows[0].count);
    const result = await query(
      `INSERT INTO questions (exam_id, question_text, question_type, options, correct_answer, marks, negative_marks, explanation, difficulty, topic, time_limit_seconds, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [examId, questionText, questionType,
       options ? JSON.stringify(options) : null,
       correctAnswer ? JSON.stringify(correctAnswer) : null,
       marks || 1, negativeMarks || 0, explanation, difficulty || 'medium', topic, timeLimitSeconds, nextOrder]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create question' }); }
}

async function updateQuestion(req, res) {
  try {
    const { id } = req.params;
    const { questionText, questionType, options, correctAnswer, marks, negativeMarks, explanation, difficulty, topic, timeLimitSeconds, orderIndex } = req.body;
    const result = await query(
      `UPDATE questions SET
         question_text=COALESCE($1,question_text), question_type=COALESCE($2,question_type),
         options=COALESCE($3,options), correct_answer=COALESCE($4,correct_answer),
         marks=COALESCE($5,marks), negative_marks=COALESCE($6,negative_marks),
         explanation=COALESCE($7,explanation), difficulty=COALESCE($8,difficulty),
         topic=COALESCE($9,topic), time_limit_seconds=COALESCE($10,time_limit_seconds),
         order_index=COALESCE($11,order_index)
       WHERE id=$12 RETURNING *`,
      [questionText, questionType,
       options ? JSON.stringify(options) : null,
       correctAnswer ? JSON.stringify(correctAnswer) : null,
       marks, negativeMarks, explanation, difficulty, topic, timeLimitSeconds, orderIndex, id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update question' }); }
}

async function deleteQuestion(req, res) {
  try {
    await query('DELETE FROM questions WHERE id=$1', [req.params.id]);
    res.json({ message: 'Question deleted' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete question' }); }
}

async function bulkCreateQuestions(req, res) {
  try {
    const examId = req.params.examId || req.params.id;
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'Questions array required' });
    const results = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText) continue;
      const r = await query(
        `INSERT INTO questions (exam_id, question_text, question_type, options, correct_answer, marks, negative_marks, difficulty, topic, explanation, order_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [examId, q.questionText, q.questionType || 'mcq',
         q.options ? JSON.stringify(q.options) : null,
         q.correctAnswer ? JSON.stringify(q.correctAnswer) : null,
         q.marks || 1, q.negativeMarks || 0, q.difficulty || 'medium', q.topic, q.explanation, i]
      );
      results.push(r.rows[0]);
    }
    res.status(201).json(results);
  } catch (err) { res.status(500).json({ error: 'Failed to bulk create questions' }); }
}

module.exports = { getQuestions, createQuestion, updateQuestion, deleteQuestion, bulkCreateQuestions };
