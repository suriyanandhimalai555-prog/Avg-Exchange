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

-- ── payment_invoices ─────────────────────────────────────────
-- Tracks OxaPay invoices so callbacks can credit the right user.
CREATE TABLE IF NOT EXISTS payment_invoices (
  id          SERIAL        PRIMARY KEY,
  user_id     INTEGER       NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  track_id    VARCHAR(100)  NOT NULL UNIQUE,   -- OxaPay's trackId
  currency    VARCHAR(20)   NOT NULL,          -- invoice currency (e.g. 'USDT')
  amount      NUMERIC(28,10) NOT NULL,
  status      VARCHAR(30)   NOT NULL DEFAULT 'pending',  -- pending|Paid|Expired|Error
  payment_url TEXT,
  payment_type VARCHAR(20)  NOT NULL DEFAULT 'invoice',  -- 'invoice' or 'whitelabel'
  credited    BOOLEAN       NOT NULL DEFAULT FALSE,  -- guard against double-credit
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_status_check CHECK (status IN ('pending','Waiting','Paid','Underpaid','Expired','Error'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id  ON payment_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_track_id ON payment_invoices(track_id);

-- ── deposit_addresses ─────────────────────────────────────────
-- White-Label / Static Address approach.
-- Each user gets one permanent blockchain address per currency+network,
-- backed by an OxaPay slave merchant account.
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id         SERIAL        PRIMARY KEY,
  user_id    INTEGER       NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  currency   VARCHAR(10)   NOT NULL,   -- e.g. 'USDT'
  network    VARCHAR(20)   NOT NULL,   -- e.g. 'TRX'
  address    TEXT          NOT NULL UNIQUE,
  slave_key  TEXT          NOT NULL,   -- OxaPay slave merchant API key (used for HMAC verify)
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency, network)
);

CREATE INDEX IF NOT EXISTS idx_deposit_addresses_user    ON deposit_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_addresses_address ON deposit_addresses(address);

-- ── static_deposit_log ────────────────────────────────────────
-- Idempotency log for static-address deposits.
-- Prevents double-credit if OxaPay fires the same webhook twice.
CREATE TABLE IF NOT EXISTS static_deposit_log (
  id         SERIAL        PRIMARY KEY,
  user_id    INTEGER       NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  currency   VARCHAR(10)   NOT NULL,
  amount     NUMERIC(28,10) NOT NULL,
  address    TEXT          NOT NULL,
  tx_id      TEXT          NOT NULL UNIQUE,   -- blockchain txId — idempotency key
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── static_coin_config ───────────────────────────────────────
-- Admin-controlled custom coin with a fixed trading price range.
-- The bot places orders within [min_price, max_price] using current_price as mid.
CREATE TABLE IF NOT EXISTS static_coin_config (
  id            SERIAL         PRIMARY KEY,
  symbol        VARCHAR(20)    NOT NULL UNIQUE,   -- e.g. 'AVG'
  min_price     NUMERIC(28,10) NOT NULL,
  max_price     NUMERIC(28,10) NOT NULL,
  current_price NUMERIC(28,10) NOT NULL,          -- bot mid price, set by admin
  enabled            BOOLEAN        NOT NULL DEFAULT TRUE,
  price_24h_ago      NUMERIC(28,10),
  price_24h_updated_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── password_reset_tokens ─────────────────────────────────────
-- Short-lived 6-digit OTP codes for the forgot-password flow.
-- One active token per user; new requests overwrite the old one.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL        PRIMARY KEY,
  user_id    INTEGER       NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE CASCADE,
  code       VARCHAR(6)    NOT NULL,
  expires_at TIMESTAMPTZ   NOT NULL,
  used       BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);
