// backend/src/services/r2Service.js
// Cloudflare R2 (S3-compatible) storage for proctoring evidence.
//
// Install once:  npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//
// Required env vars (set on Render, never commit them):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
} = process.env;

const isConfigured = () =>
  Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

let client = null;
const getClient = () => {
  if (!isConfigured()) {
    throw new Error('R2 storage is not configured (missing R2_* environment variables)');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
};

/**
 * Upload a file buffer. Returns the object key, which is what you store in PostgreSQL.
 * Suggested key format: evidence/<sessionId>/<timestamp>-<type>.<ext>
 */
async function uploadEvidence(key, buffer, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Short-lived signed URL for viewing/playing evidence in the examiner report.
 * Default expiry: 5 minutes.
 */
async function getEvidenceUrl(key, expiresInSeconds = 300) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

async function deleteEvidence(key) {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
  );
}

module.exports = { isConfigured, uploadEvidence, getEvidenceUrl, deleteEvidence };
