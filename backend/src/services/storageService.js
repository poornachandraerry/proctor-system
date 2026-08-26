const logger = require('../utils/logger');

const SPACEBYTE_BASE = 'https://spacebyte.in/api/v1';
const SPACEBYTE_TOKEN = process.env.SPACEBYTE_API_TOKEN;
// Optional — ID of a SpaceByte folder to keep evidence organized. If unset,
// files upload to the root of the SpaceByte account.
const SPACEBYTE_FOLDER_ID = process.env.SPACEBYTE_FOLDER_ID
  ? parseInt(process.env.SPACEBYTE_FOLDER_ID, 10)
  : null;

const SERVER_HEADERS = {
  'User-Agent': 'ProctorAI-Backend/1.0',
  'Accept': 'application/json',
};

function assertConfigured() {
  if (!SPACEBYTE_TOKEN) {
    throw new Error('SPACEBYTE_API_TOKEN is not set — cannot upload evidence files');
  }
}

async function spacebyteJsonPost(path, body) {
  const res = await fetch(`${SPACEBYTE_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SPACEBYTE_TOKEN}`,
      'Content-Type': 'application/json',
      ...SERVER_HEADERS,
    },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`${path} returned non-JSON response (status ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${data.message || JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

// Uploads a buffer to SpaceByte via the S3 direct-upload flow (presign the
// file bytes go straight to S3, bypassing the Cloudflare protection that
// blocks the simpler /uploads endpoint when called from a datacenter IP,
// then register the entry so it shows up in the SpaceByte account).
// Returns { hash } — used to build our own /files/spacebyte/:hash proxy URL.
async function uploadToSpaceByte(buffer, filename, mimeType) {
  assertConfigured();
  const extension = (filename.split('.').pop() || 'bin').toLowerCase();

  // Step 1 — get a presigned S3 PUT URL
  const presign = await spacebyteJsonPost('/s3/simple/presign', {
    filename,
    mime: mimeType,
    size: buffer.length,
    extension,
  });
  if (!presign.url || !presign.key) throw new Error('presign response missing url/key');

  // Step 2 — upload the actual bytes directly to S3 (not spacebyte.in at all)
  const putRes = await fetch(presign.url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'x-amz-acl': presign.acl || 'private',
    },
    body: buffer,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`S3 PUT upload failed (${putRes.status}): ${text.slice(0, 300)}`);
  }

  // Step 3 — register the entry in SpaceByte's database
  const s3Filename = presign.key.split('/').pop();
  const entry = await spacebyteJsonPost('/s3/entries', {
    filename: s3Filename,
    clientName: filename,
    size: buffer.length,
    clientMime: mimeType,
    clientExtension: extension,
    disk: 'uploads',
    parentId: SPACEBYTE_FOLDER_ID,
  });
  if (!entry.fileEntry) throw new Error('s3/entries returned no fileEntry');
  return { hash: entry.fileEntry.hash, id: entry.fileEntry.id };
}

// Streams a file from SpaceByte by hash. Returns { body, contentType } where
// body is a web ReadableStream, for piping directly into an Express response.
async function streamFromSpaceByte(hash) {
  assertConfigured();
  const res = await fetch(`${SPACEBYTE_BASE}/file-entries/download/${encodeURIComponent(hash)}`, {
    headers: { Authorization: `Bearer ${SPACEBYTE_TOKEN}`, ...SERVER_HEADERS },
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
