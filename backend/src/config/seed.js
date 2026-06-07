require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./database');

async function seed() {
  try {
    console.log('Seeding database...');

    const adminHash = await bcrypt.hash('Admin@123', 12);
    const examinerHash = await bcrypt.hash('Exam@123', 12);
    const studentHash = await bcrypt.hash('Student@123', 12);

    const adminResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, organization, is_email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (email) DO UPDATE SET password_hash=$2 RETURNING id`,
      ['admin@proctorAI.com', adminHash, 'System', 'Admin', 'admin', 'ProctorAI']
    );

    const examinerResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, organization, is_email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (email) DO UPDATE SET password_hash=$2 RETURNING id`,
      ['examiner@proctorAI.com', examinerHash, 'John', 'Examiner', 'examiner', 'ProctorAI']
    );

    const studentResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, organization, is_email_verified)
       VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (email) DO UPDATE SET password_hash=$2 RETURNING id`,
      ['student@proctorAI.com', studentHash, 'Jane', 'Student', 'student', 'ProctorAI']
    );

    const examinerId = examinerResult.rows[0].id;
    const studentId = studentResult.rows[0].id;

    const examResult = await pool.query(`
      INSERT INTO exams (title, description, instructions, created_by, duration_minutes, total_marks,
        pass_percentage, status, proctoring_settings, settings)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT DO NOTHING RETURNING id
    `, [
      'Advanced JavaScript Assessment',
      'A comprehensive test covering ES6+, async programming, closures, and modern JavaScript patterns.',
      'Read each question carefully. Webcam must be enabled throughout. Do not switch tabs or exit fullscreen. You have 60 minutes.',
      examinerId, 60, 60, 60.00, 'published',
      JSON.stringify({ webcam_required: true, fullscreen_required: true, tab_switch_allowed: false, copy_paste_blocked: true, face_detection: true, gaze_tracking: true, ai_analysis: true, screenshot_interval: 30, max_warnings: 3 }),
      JSON.stringify({ shuffle_questions: false, shuffle_options: false, show_result_immediately: false, allow_review: true })
    ]);

    if (examResult.rows.length > 0) {
      const examId = examResult.rows[0].id;

      const questions = [
        { text: 'Which keyword creates a block-scoped variable that CANNOT be reassigned?', type: 'mcq', options: [{ id:'a', text:'var' }, { id:'b', text:'let' }, { id:'c', text:'const' }, { id:'d', text:'static' }], correct: '"c"', marks: 5, difficulty: 'easy', topic: 'Variables' },
        { text: 'What does Array.prototype.reduce() return?', type: 'mcq', options: [{ id:'a', text:'Always an array' }, { id:'b', text:'A single accumulated value' }, { id:'c', text:'A new array of same length' }, { id:'d', text:'A boolean' }], correct: '"b"', marks: 5, difficulty: 'easy', topic: 'Arrays' },
        { text: 'What is the output of: console.log(typeof null)?', type: 'mcq', options: [{ id:'a', text:'"null"' }, { id:'b', text:'"undefined"' }, { id:'c', text:'"object"' }, { id:'d', text:'"boolean"' }], correct: '"c"', marks: 5, difficulty: 'medium', topic: 'Types' },
        { text: 'Which method is used to flatten a nested array by one level?', type: 'mcq', options: [{ id:'a', text:'.flat()' }, { id:'b', text:'.flatten()' }, { id:'c', text:'.spread()' }, { id:'d', text:'.concat()' }], correct: '"a"', marks: 5, difficulty: 'medium', topic: 'Arrays' },
        { text: 'What is a JavaScript closure?', type: 'mcq', options: [{ id:'a', text:'A way to close a browser window' }, { id:'b', text:'A function that retains access to its outer scope even after the outer function has returned' }, { id:'c', text:'A method to end a loop' }, { id:'d', text:'An error handling mechanism' }], correct: '"b"', marks: 5, difficulty: 'medium', topic: 'Functions' },
        { text: 'Explain the difference between Promise.all() and Promise.allSettled(). When would you use each?', type: 'essay', options: null, correct: null, marks: 15, difficulty: 'hard', topic: 'Async' },
        { text: 'Write a JavaScript debounce function that delays invoking a function until after a specified wait time has elapsed since the last invocation.', type: 'code', options: null, correct: null, marks: 20, difficulty: 'hard', topic: 'Functions' },
      ];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await pool.query(
          `INSERT INTO questions (exam_id, question_text, question_type, options, correct_answer, marks, difficulty, topic, order_index)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [examId, q.text, q.type, q.options ? JSON.stringify(q.options) : null, q.correct || null, q.marks, q.difficulty, q.topic, i]
        );
      }

      await pool.query(
        `INSERT INTO exam_enrollments (exam_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [examId, studentId]
      );

      console.log('Sample exam created with 7 questions.');
    }

    console.log('\n✅ Database seeded successfully!');
    console.log('─'.repeat(40));
    console.log('Login Credentials:');
    console.log('  Admin:    admin@proctorAI.com     / Admin@123');
    console.log('  Examiner: examiner@proctorAI.com  / Exam@123');
    console.log('  Student:  student@proctorAI.com   / Student@123');
    console.log('─'.repeat(40));
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seed();
