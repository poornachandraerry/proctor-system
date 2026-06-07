const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directories exist
['screenshots', 'documents'].forEach(dir => {
  const fullPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

async function saveScreenshot(base64Data, sessionId) {
  try {
    const dir = path.join(UPLOAD_DIR, 'screenshots', sessionId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `${uuidv4()}.jpg`;
    const filepath = path.join(dir, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    return `/uploads/screenshots/${sessionId}/${filename}`;
  } catch (err) {
    logger.error('Screenshot save error:', err.message);
    return null;
  }
}

async function deleteSessionFiles(sessionId) {
  try {
    const dir = path.join(UPLOAD_DIR, 'screenshots', sessionId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  } catch (err) {
    logger.error('Delete session files error:', err.message);
  }
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(path.join(UPLOAD_DIR, filePath));
    return stats.size;
  } catch { return 0; }
}

module.exports = { saveScreenshot, deleteSessionFiles, getFileSize };
