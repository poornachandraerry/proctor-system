const express = require('express');
const router = express.Router();
const { sendEmail } = require('../services/emailService');

router.get('/config', (req, res) => {
  res.json({
    SMTP_HOST: process.env.SMTP_HOST || null,
    SMTP_PORT: process.env.SMTP_PORT || null,
    SMTP_SECURE: process.env.SMTP_SECURE || null,
    SMTP_USER: process.env.SMTP_USER || null,
    SMTP_PASS_EXISTS: !!process.env.SMTP_PASS,
    NODE_ENV: process.env.NODE_ENV || 'development'
  });
});

router.get('/test', async (req, res) => {
  try {
    await sendEmail({
      to: process.env.SMTP_USER,
      subject: 'ProctorAI SMTP Test',
      text: 'SMTP configuration is working correctly.',
      html: '<h2>SMTP configuration is working correctly.</h2>'
    });

    res.json({
      success: true,
      message: 'Email sent successfully'
    });
  } catch (err) {
    console.error('SMTP Test Failed:', err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;