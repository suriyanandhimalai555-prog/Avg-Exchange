/**
 * s3Service.js — AWS S3 helpers for KYC document storage
 *
 * getUploadUrl(key, contentType) → short-lived presigned PUT URL (5 min)
 *   Frontend PUTs the file directly to S3 — our server never holds the bytes.
 *
 * getDownloadUrl(key) → short-lived presigned GET URL (1 hour)
 *   Admin panel uses this to view documents without making the bucket public.
 */

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-1';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

if (!BUCKET) {
  console.warn('[s3] AWS_S3_BUCKET not set — KYC document upload will fail');
}

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Returns a presigned PUT URL the browser uses to upload directly to S3.
 * @param {string} key         — S3 object key e.g. "kyc/42/1717000000000.jpg"
 * @param {string} contentType — MIME type of the file
 * @returns {Promise<string>}  — presigned URL (expires in 5 minutes)
 */
const getUploadUrl = async (key, contentType) => {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}. Allowed: JPEG, PNG, PDF`);
  }
  const cmd = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 300 }); // 5 minutes
};

/**
 * Returns a presigned GET URL for admins to view a stored document.
 * @param {string} key  — S3 object key stored in kyc_submissions.document_path
 * @returns {Promise<string>}  — presigned URL (expires in 1 hour)
 */
const getDownloadUrl = async (key) => {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: 3600 }); // 1 hour
};

module.exports = { getUploadUrl, getDownloadUrl };
