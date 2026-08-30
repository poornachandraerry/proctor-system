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
    // Rate-limited so a misconfigured key doesn't flood the logs — but
    // logged at all, because silently returning "everything is fine" for
    // every single frame with zero trace anywhere is how an entire exam's
    // AI monitoring can quietly do nothing for hours without anyone
    // noticing until it's too late to matter.
    if (!getClient._warnedMissingKey || Date.now() - getClient._warnedMissingKey > 5 * 60 * 1000) {
      logger.warn('AI webcam analysis is disabled: ANTHROPIC_API_KEY is not set (or still the placeholder value). Face/gaze/multi-person detection will not run for any exam until this is fixed.');
      getClient._warnedMissingKey = Date.now();
    }
    return { safe: true, flags: [], confidence: 0.5, summary: 'AI not configured', face_detected: true, multiple_faces: false, suspicious_objects: false, looking_away: false, ai_unavailable: true };
  }
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          {
            type: 'text',
            text: `You are a strict exam proctoring AI reviewing a single webcam frame from a candidate taking a monitored exam. Be decisive and err on the side of flagging — a missed violation is worse than a false positive here, since a human will review flagged frames afterward anyway.

1. face_detected: Is the candidate's face visible in frame at all (even partially)? False if the frame shows an empty chair, the back of a head, or no person.
2. multiple_faces: Are there two or more distinct people/faces visible?
3. suspicious_objects: Is a phone, smartwatch, book, printed notes, or a second screen/monitor visible?
4. looking_away: Is the candidate's head turned to the side, tilted down/up away from the screen, or are their eyes clearly not directed at the screen? This should be TRUE for any noticeable turn away from facing the camera — a candidate glancing sideways, turning to talk to someone off-screen, or reading from something beside their screen all count. Only mark this FALSE if they are reasonably facing forward toward the screen.

Respond ONLY with this JSON (no extra text):
{"safe": boolean, "flags": ["list","of","issues"], "confidence": 0.0-1.0, "summary": "one sentence", "face_detected": boolean, "multiple_faces": boolean, "suspicious_objects": boolean, "looking_away": boolean}`
          }
        ]
      }]
    });
    const text = response.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    logger.warn('AI webcam analysis: response did not contain parseable JSON, treating frame as unavailable rather than assuming safe:', text.slice(0, 200));
    return { safe: true, flags: [], confidence: 0.5, summary: 'Parse error', face_detected: true, multiple_faces: false, suspicious_objects: false, looking_away: false, ai_unavailable: true };
  } catch (err) {
    // Same reasoning as above: log it so a broken key, deprecated model, or
    // rate limit shows up somewhere, instead of every single call for the
    // entire exam silently reporting "all clear".
    if (!analyzeWebcamFrame._lastErrorLogAt || Date.now() - analyzeWebcamFrame._lastErrorLogAt > 5 * 60 * 1000) {
      logger.error('AI frame analysis error (further errors suppressed for 5 min):', err.message);
      analyzeWebcamFrame._lastErrorLogAt = Date.now();
    }
    return { safe: true, flags: [], confidence: 0.5, summary: 'AI error', face_detected: true, multiple_faces: false, suspicious_objects: false, looking_away: false, ai_unavailable: true };
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
      model: 'claude-sonnet-4-6',
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
    model: 'claude-sonnet-4-6',
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
