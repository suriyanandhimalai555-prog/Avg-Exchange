const express    = require('express');
const path       = require('path');
const requireAuth = require('../middleware/requireAuth');
const { submitKyc, getKycStatus } = require('../controllers/kycController');
const s3         = require('../services/s3Service');

const router = express.Router();
router.use(requireAuth);

// GET /api/kyc/status
router.get('/status', getKycStatus);

/**
 * GET /api/kyc/upload-url?filename=passport.jpg&contentType=image/jpeg
 *
 * Returns a short-lived presigned S3 PUT URL + the S3 key.
 * The frontend PUTs the file directly to S3, then sends the key to /submit.
 * Our server never receives the file bytes.
 */
router.get('/upload-url', async (req, res, next) => {
  try {
    const { filename, contentType } = req.query;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType query params are required' });
    }

    const ext = path.extname(filename).toLowerCase() || '.bin';
    const key = `kyc/${req.user.id}/${Date.now()}${ext}`;

    const uploadUrl = await s3.getUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  } catch (err) {
    next(err);
  }
});

// POST /api/kyc/submit — JSON body (no multipart; file is already in S3)
router.post('/submit', submitKyc);

module.exports = router;
