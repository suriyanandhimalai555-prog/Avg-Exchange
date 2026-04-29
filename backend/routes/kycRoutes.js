const express = require('express');
const path = require('path');
const multer = require('multer');
const requireAuth = require('../middleware/requireAuth');
const { submitKyc, getKycStatus } = require('../controllers/kycController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../uploads/kyc')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `kyc_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase())
            && allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only PNG, JPG, and PDF files are allowed'));
  },
});

router.use(requireAuth);

// GET /api/kyc/status
router.get('/status', getKycStatus);

// POST /api/kyc/submit  (multipart/form-data)
router.post('/submit', upload.single('document'), submitKyc);

module.exports = router;
