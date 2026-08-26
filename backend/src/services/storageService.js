const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Base directory for all evidence files (screenshots + audio clips).
// Defaults to backend/uploads (works fine for local dev, but is EPHEMERAL on
// Render unless UPLOAD_DIR is set to point at a mounted persistent Disk —
// see the Disks tab on the proctor-system service in Render, and set
// UPLOAD_DIR there to match the disk's mount path, e.g. /var/data/uploads).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function saveScreenshot(base64Data, sessionId) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const dir = path.join(UPLOAD_DIR, 'evidence', sessionId);
    ensureDir(dir);
    const filename = `evidence-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `/uploads/evidence/${sessionId}/${filename}`;
  } catch (err) {
    logger.error(`Screenshot save error: ${err.message}`);
    return null;
  }
}

// Saves an arbitrary buffer (e.g. an audio clip) under a subfolder keyed by
// sessionId, and returns a path servable via the /uploads static route.
async function saveBuffer(buffer, filename, mimeType, sessionId = 'misc') {
  try {
    const subdir = mimeType.startsWith('audio/') ? 'audio' : 'files';
    const dir = path.join(UPLOAD_DIR, subdir, sessionId);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, filename), buffer);
    return `/uploads/${subdir}/${sessionId}/${filename}`;
  } catch (err) {
    logger.error(`File save error: ${err.message}`);
    return null;
  }
}

async function deleteSessionFiles(sessionId) {
  try {
    for (const subdir of ['evidence', 'audio', 'files']) {
      const dir = path.join(UPLOAD_DIR, subdir, sessionId);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    logger.error(`deleteSessionFiles error: ${err.message}`);
  }
}

function getFileSize(filePath) {
  try {
    const full = path.join(UPLOAD_DIR, filePath.replace(/^\/uploads\//, ''));
    return fs.existsSync(full) ? fs.statSync(full).size : 0;
  } catch {
    return 0;
  }
}

module.exports = { saveScreenshot, saveBuffer, deleteSessionFiles, getFileSize };
