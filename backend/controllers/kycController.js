const db = require('../db');

const VALID_DOCUMENT_TYPES = ['passport', 'national_id', 'driver_license'];

const submitKyc = async (req, res, next) => {
  const userId = req.user.id;
  const { full_name, date_of_birth, document_type, document_number, document_key } = req.body;

  if (!full_name || !date_of_birth || !document_type || !document_number) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!document_key) {
    return res.status(400).json({ error: 'Document upload is required — upload the file first' });
  }
  if (!VALID_DOCUMENT_TYPES.includes(document_type)) {
    return res.status(400).json({ error: `Invalid document type. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` });
  }

  // Validate document_key belongs to this user (prevent path traversal)
  const expectedPrefix = `kyc/${userId}/`;
  if (!document_key.startsWith(expectedPrefix)) {
    return res.status(400).json({ error: 'Invalid document key' });
  }

  try {
    // Prevent re-submission if already approved
    const existing = await db.query(
      'SELECT status FROM kyc_submissions WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0 && existing.rows[0].status === 'approved') {
      return res.status(400).json({ error: 'KYC already approved. Contact support if you need to update your documents.' });
    }

    const { rows } = await db.query(
      `INSERT INTO kyc_submissions
         (user_id, full_name, date_of_birth, document_type, document_number, document_path, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET full_name       = EXCLUDED.full_name,
             date_of_birth   = EXCLUDED.date_of_birth,
             document_type   = EXCLUDED.document_type,
             document_number = EXCLUDED.document_number,
             document_path   = EXCLUDED.document_path,
             status          = 'pending',
             reviewer_note   = NULL,
             reviewed_at     = NULL,
             submitted_at    = NOW()
       RETURNING id, status, submitted_at`,
      [userId, full_name, date_of_birth, document_type, document_number, document_key]
    );
    res.status(200).json({ success: true, submission: rows[0] });
  } catch (err) {
    next(err);
  }
};

const getKycStatus = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT status, submitted_at, reviewed_at, reviewer_note
         FROM kyc_submissions WHERE user_id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.json({ status: 'none' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

module.exports = { submitKyc, getKycStatus };
