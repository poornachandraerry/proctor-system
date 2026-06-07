const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

let anthropicClient = null;

function getClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your-key')) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

async function analyzeWebcamFrame(imageBase64) {
  const client = getClient();
  if (!client) {
    return { safe: true, flags: [], confidence: 0.5, summary: 'AI not configured', face_detected: true, multiple_faces: false, suspicious_objects: false, looking_away: false };
  }
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          {
            type: 'text',
            text: `You are an exam proctoring AI. Analyze this webcam frame for the following issues:
1. Is a student's face clearly visible and forward-facing?
2. Are there multiple people in the frame?
3. Is there a mobile phone, notes, or printed material visible?
4. Does the student appear to be looking significantly away from screen?

Respond ONLY with this JSON (no extra text):
{"safe": boolean, "flags": ["list","of","issues"], "confidence": 0.0-1.0, "summary": "one sentence", "face_detected": boolean, "multiple_faces": boolean, "suspicious_objects": boolean, "looking_away": boolean}`
          }
        ]
      }]
    });
    const text = response.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { safe: true, flags: [], confidence: 0.5, summary: 'Parse error', face_detected: true, multiple_faces: false, suspicious_objects: false, looking_away: false };
  } catch (err) {
    logger.error('AI frame analysis error:', err.message);
    return { safe: true, flags: [], confidence: 0.5, summary: 'AI error', face_detected: true, multiple_faces: false, suspicious_objects: false, looking_away: false };
  }
}

async function analyzeSessionRisk(sessionData, alertSummary) {
  const client = getClient();
  const prompt = `You are an exam integrity analyst. Analyze this student's exam session data and provide a professional risk assessment.

Session Data:
- Tab switches: ${sessionData.tab_switches}
- Fullscreen exits: ${sessionData.fullscreen_exits}  
- Copy/paste attempts: ${sessionData.copy_paste_attempts}
- Multiple faces detected: ${sessionData.multiple_faces_detected}
- Gaze away events: ${sessionData.gaze_away_count}
- Total suspicious events: ${sessionData.total_suspicious_events}
- Alert breakdown: ${JSON.stringify(alertSummary)}

In 2-3 professional sentences, describe the integrity risk. End with: "Risk Level: LOW / MEDIUM / HIGH / CRITICAL"`;

  if (!client) {
    return `Session shows ${sessionData.total_suspicious_events} suspicious events. Manual review recommended. Risk Level: ${sessionData.risk_score >= 60 ? 'HIGH' : 'MEDIUM'}`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text;
  } catch (err) {
    logger.error('AI session analysis error:', err.message);
    return `Unable to complete AI analysis. Manual review recommended. Risk Level: UNKNOWN`;
  }
}

async function generateExamQuestions({ topic, difficulty, questionType, count }) {
  const client = getClient();
  if (!client) throw new Error('Anthropic API key not configured. Add ANTHROPIC_API_KEY to backend/.env');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Generate exactly ${count} ${difficulty}-level ${questionType} exam questions on the topic: "${topic}".

Return ONLY a valid JSON array with no extra text or markdown fences:
[
  {
    "questionText": "The full question text",
    "questionType": "${questionType}",
    "options": [{"id":"a","text":"Option A"},{"id":"b","text":"Option B"},{"id":"c","text":"Option C"},{"id":"d","text":"Option D"}],
    "correctAnswer": "a",
    "explanation": "Why this is correct",
    "marks": 5,
    "difficulty": "${difficulty}",
    "topic": "${topic}"
  }
]

For essay/code types, set options to null and correctAnswer to null.
Ensure questions are academically rigorous and exam-appropriate.`
    }]
  });

  const text = response.content[0].text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Failed to parse AI response — try again');
  return JSON.parse(match[0]);
}

module.exports = { analyzeWebcamFrame, analyzeSessionRisk, generateExamQuestions };
