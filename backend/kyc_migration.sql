-- ============================================================
-- AVG Exchange — KYC Migration
-- Run once: psql $DATABASE_URL -f backend/kyc_migration.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id              SERIAL          PRIMARY KEY,
  user_id         INTEGER         NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  full_name       VARCHAR(255)    NOT NULL,
  date_of_birth   DATE            NOT NULL,
  document_type   VARCHAR(50)     NOT NULL,   -- 'passport' | 'national_id' | 'driver_license'
  document_number VARCHAR(100)    NOT NULL,
  document_path   VARCHAR(500),               -- local path or S3 URL
  status          VARCHAR(20)     NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewer_note   TEXT,
  reviewed_at     TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)                             -- one active submission per user
);

CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status);
