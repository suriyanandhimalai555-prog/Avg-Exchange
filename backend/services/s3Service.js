/**
 * s3Service.js — AWS S3 helpers for KYC document storage.
 *
 * getUploadUrl(key, contentType) -> presigned PUT URL (5 min)
 * getDownloadUrl(key) -> presigned GET URL (1 hour)
 */

'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config');

const BUCKET = config.aws.s3Bucket;

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
  region: config.aws.region,
  credentials: {
    accessKeyId:     config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const getUploadUrl = async (key, contentType) => {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}. Allowed: JPEG, PNG, PDF`);
  }
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn: 300 });
};

const getDownloadUrl = async (key) => {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: 3600 });
};

module.exports = { getUploadUrl, getDownloadUrl };
