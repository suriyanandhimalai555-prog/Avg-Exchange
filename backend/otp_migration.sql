-- ============================================================
-- AVG Exchange — OTP Tokens Migration
-- Run once against an existing database:
--   psql $DATABASE_URL -f backend/otp_migration.sql
-- ============================================================

-- Short-lived 6-digit OTP codes for login and signup verification.
-- One active token per (email, type); new requests overwrite the old one.
CREATE TABLE IF NOT EXISTS otp_tokens (
  id          SERIAL        PRIMARY KEY,
  user_id     INTEGER       REFERENCES "User"(id) ON DELETE CASCADE,  -- NULL until signup is confirmed
  email       VARCHAR(255)  NOT NULL,
  type        VARCHAR(20)   NOT NULL CHECK (type IN ('login', 'signup')),
  code        VARCHAR(6)    NOT NULL,
  signup_data JSONB,                                                   -- pending signup payload for type='signup'
  expires_at  TIMESTAMPTZ   NOT NULL,
  used        BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (email, type)
);

CREATE INDEX IF NOT EXISTS idx_otp_email_type ON otp_tokens(email, type);
