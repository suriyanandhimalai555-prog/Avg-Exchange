-- ============================================================
-- AVG Exchange — Trading Schema
-- Run once against your Supabase/PostgreSQL database.
-- The "User" table is already created by the auth setup.
-- ============================================================

-- ── Enum types ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE order_side   AS ENUM ('buy', 'sell');
  CREATE TYPE order_type   AS ENUM ('limit', 'market');
  CREATE TYPE order_status AS ENUM ('open', 'partially_filled', 'filled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── balances ─────────────────────────────────────────────────
-- One row per (user, currency).  available + locked = total holdings.
CREATE TABLE IF NOT EXISTS balances (
  id                SERIAL          PRIMARY KEY,
  user_id           INTEGER         NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  currency          VARCHAR(20)     NOT NULL,                  -- e.g. 'BTC', 'USDT'
  available_balance NUMERIC(28, 10) NOT NULL DEFAULT 0,
  locked_balance    NUMERIC(28, 10) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, currency),
  CONSTRAINT available_balance_non_negative CHECK (available_balance >= 0),
  CONSTRAINT locked_balance_non_negative    CHECK (locked_balance    >= 0)
);

-- ── orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 SERIAL          PRIMARY KEY,
  user_id            INTEGER         NOT NULL REFERENCES "User"(id),
  pair               VARCHAR(20)     NOT NULL,                 -- e.g. 'BTC/USDT'
  side               order_side      NOT NULL,
  type               order_type      NOT NULL DEFAULT 'limit',
  price              NUMERIC(28, 10),                          -- NULL for market orders
  quantity           NUMERIC(28, 10) NOT NULL,
  remaining_quantity NUMERIC(28, 10) NOT NULL,
  status             order_status    NOT NULL DEFAULT 'open',
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user        ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_pair_status ON orders(pair, status);

-- ── trades ───────────────────────────────────────────────────
-- Immutable ledger — never updated after insert.
CREATE TABLE IF NOT EXISTS trades (
  id            SERIAL          PRIMARY KEY,
  buy_order_id  INTEGER         NOT NULL REFERENCES orders(id),
  sell_order_id INTEGER         NOT NULL REFERENCES orders(id),
  buyer_id      INTEGER         NOT NULL REFERENCES "User"(id),
  seller_id     INTEGER         NOT NULL REFERENCES "User"(id),
  pair          VARCHAR(20)     NOT NULL,
  price         NUMERIC(28, 10) NOT NULL,
  quantity      NUMERIC(28, 10) NOT NULL,
  executed_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_buyer  ON trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_trades_pair   ON trades(pair);

-- ── is_admin flag on User ────────────────────────────────────
-- Run this migration once if the column does not yet exist:
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_admin       BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS name           VARCHAR(200);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS referral_code  VARCHAR(20)  UNIQUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS referred_by    INTEGER      REFERENCES "User"(id);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS referral_count INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- ── kyc_submissions ──────────────────────────────────────────
-- One row per user. Re-submission on rejection uses ON CONFLICT upsert.
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id              SERIAL        PRIMARY KEY,
  user_id         INTEGER       NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  full_name       VARCHAR(200)  NOT NULL,
  date_of_birth   DATE          NOT NULL,
  document_type   VARCHAR(50)   NOT NULL,
  document_number VARCHAR(100)  NOT NULL,
  document_path   TEXT,                          -- local file path for uploaded doc
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
  submitted_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewer_note   TEXT,

  CONSTRAINT kyc_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status  ON kyc_submissions(status);
