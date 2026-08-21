const logger = require('../utils/logger');

const SPACEBYTE_BASE = 'https://spacebyte.in/api/v1';
const SPACEBYTE_TOKEN = process.env.SPACEBYTE_API_TOKEN;
// Optional — ID of a SpaceByte folder to keep evidence organized. If unset,
// files upload to the root of the SpaceByte account.
const SPACEBYTE_FOLDER_ID = process.env.SPACEBYTE_FOLDER_ID
  ? parseInt(process.env.SPACEBYTE_FOLDER_ID, 10)
  : null;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

function assertConfigured() {
  if (!SPACEBYTE_TOKEN) {
    throw new Error('SPACEBYTE_API_TOKEN is not set — cannot upload evidence files');
  }
}

// Uploads a buffer to SpaceByte and returns { hash, id } for the created
// FileEntry. `hash` is what we store and later use to stream the file back
// through our own /files/spacebyte/:hash proxy route.
async function uploadToSpaceByte(buffer, filename, mimeType) {
  assertConfigured();
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  if (SPACEBYTE_FOLDER_ID) form.append('parentId', String(SPACEBYTE_FOLDER_ID));

  const res = await fetch(`${SPACEBYTE_BASE}/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SPACEBYTE_TOKEN}`, ...BROWSER_HEADERS },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SpaceByte upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`SpaceByte upload returned non-JSON response (likely blocked before reaching the API): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.fileEntry) throw new Error('SpaceByte upload returned no fileEntry');
  return { hash: data.fileEntry.hash, id: data.fileEntry.id };
}

// Streams a file from SpaceByte by hash. Returns { body, contentType } where
// body is a web ReadableStream, for piping directly into an Express response.
async function streamFromSpaceByte(hash) {
  assertConfigured();
  const res = await fetch(`${SPACEBYTE_BASE}/file-entries/download/${encodeURIComponent(hash)}`, {
    headers: { Authorization: `Bearer ${SPACEBYTE_TOKEN}`, ...BROWSER_HEADERS },
  });
  if (!res.ok) {
    throw new Error(`SpaceByte download failed (${res.status})`);
  }
  return {
    body: res.body,
    contentType: res.headers.get('content-type') || 'application/octet-stream',
    contentLength: res.headers.get('content-length'),
  };
}

async function saveScreenshot(base64Data, sessionId) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `evidence-${sessionId}-${Date.now()}.jpg`;
    const { hash } = await uploadToSpaceByte(buffer, filename, 'image/jpeg');
    return `/files/spacebyte/${hash}`;
  } catch (err) {
    logger.error(`Screenshot save error: ${err.message}`);
    return null;
  }
}

// Uploads an arbitrary buffer (e.g. an audio clip) and returns the same
// `/files/spacebyte/<hash>` style path used elsewhere.
async function saveBuffer(buffer, filename, mimeType) {
  try {
    const { hash } = await uploadToSpaceByte(buffer, filename, mimeType);
    return `/files/spacebyte/${hash}`;
  } catch (err) {
    logger.error(`File save error: ${err.message}`);
    return null;
  }
}

// SpaceByte deletion would need the numeric FileEntry id, which we don't
// currently persist alongside the hash — left as a no-op for now rather than
// silently failing. Evidence files simply remain in the SpaceByte account.
async function deleteSessionFiles(sessionId) {
  logger.info(`deleteSessionFiles: no-op for SpaceByte-backed storage (session ${sessionId})`);
}

function getFileSize() {
  // Not meaningful for remote storage; kept for backward compatibility.
  return 0;
}

module.exports = { saveScreenshot, saveBuffer, streamFromSpaceByte, deleteSessionFiles, getFileSize };
