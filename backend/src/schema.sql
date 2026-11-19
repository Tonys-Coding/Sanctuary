-- Sanctuary 2 schema. Everything lives in its own Postgres schema ("sanctuary")
-- so tables from the original prototype in "public" are left untouched.
-- This file is idempotent and runs on every server start.

CREATE SCHEMA IF NOT EXISTS sanctuary;
SET search_path TO sanctuary;

CREATE TABLE IF NOT EXISTS organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,
  tax_id        text,
  address       text,
  city          text,
  state         text,
  postal_code   text,
  country       text NOT NULL DEFAULT 'US',
  phone         text,
  email         text,
  pastor_name   text,
  treasurer_name text,
  currency      text NOT NULL DEFAULT 'USD',
  logo_file     text,
  statement_note text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  avatar_file   text,
  language      text NOT NULL DEFAULT 'es',
  theme         text NOT NULL DEFAULT 'system',
  session_version int NOT NULL DEFAULT 1,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  note        text,
  max_uses    int,
  uses        int NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name    text NOT NULL,
  last_name     text NOT NULL DEFAULT '',
  email         text,
  phone         text,
  address       text,
  city          text,
  state         text,
  postal_code   text,
  birth_date    date,
  joined_date   date,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','visitor')),
  church_role   text NOT NULL DEFAULT 'member' CHECK (church_role IN ('pastor','leader','member','visitor')),
  envelope_number text,
  notes         text,
  avatar_file   text,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_org_idx ON members(org_id);

CREATE TABLE IF NOT EXISTS funds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color_slot    int NOT NULL DEFAULT 1,
  tax_deductible boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funds_org_idx ON funds(org_id);

-- A "conteo": the count sheet for one service.
CREATE TABLE IF NOT EXISTS batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date          date NOT NULL,
  name          text NOT NULL,
  attendance    int,
  counted_by    text,
  denominations jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at     timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS batches_org_idx ON batches(org_id, date);

CREATE TABLE IF NOT EXISTS offerings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  fund_id       uuid NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  batch_id      uuid REFERENCES batches(id) ON DELETE SET NULL,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  date          date NOT NULL,
  method        text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','check','card','transfer','other')),
  check_number  text,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offerings_org_date_idx ON offerings(org_id, date);
CREATE INDEX IF NOT EXISTS offerings_member_idx ON offerings(member_id);
CREATE INDEX IF NOT EXISTS offerings_batch_idx ON offerings(batch_id);

CREATE TABLE IF NOT EXISTS goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  fund_id       uuid REFERENCES funds(id) ON DELETE SET NULL,
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_statements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year          int NOT NULL,
  total         numeric(12,2) NOT NULL,
  emailed_to    text,
  emailed_at    timestamptz,
  UNIQUE (org_id, member_id, year)
);

CREATE TABLE IF NOT EXISTS email_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient     text NOT NULL,
  subject       text NOT NULL,
  kind          text NOT NULL,
  status        text NOT NULL,
  error         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name     text,
  action        text NOT NULL,
  entity        text NOT NULL,
  entity_id     text,
  summary       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_idx ON audit_log(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_cache (
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key           text NOT NULL,
  content       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

-- ─── Text messages (SMS) ─────────────────────────────────────────────────────
-- Members must agree to receive texts before any is sent to them.
ALTER TABLE members ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sms_birthday_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sms_birthday_message text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sms_birthday_last_run date;

-- One row per text, whether it went out right away, is waiting for its time, or failed.
CREATE TABLE IF NOT EXISTS sms_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id     uuid REFERENCES members(id) ON DELETE SET NULL,
  to_phone      text NOT NULL,
  body          text NOT NULL,
  kind          text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','reminder','birthday')),
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sending','sent','failed','canceled')),
  send_at       timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  provider_id   text,
  error         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_due_idx ON sms_messages(status, send_at);
CREATE INDEX IF NOT EXISTS sms_org_idx ON sms_messages(org_id, created_at DESC);
-- Texts sent together (one "Nuevo mensaje" to many people) share a batch, so they are listed and cancelled as one.
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS sms_batch_idx ON sms_messages(batch_id);

-- ─── v3: time zone, idle sign-out, audit details, envelope uniqueness ────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS idle_minutes int NOT NULL DEFAULT 15;

-- The church's own "today", whatever time zone the server runs in.
CREATE OR REPLACE FUNCTION sanctuary.org_today(o uuid) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM sanctuary.organizations WHERE id = o), 'UTC'))::date
$$;

-- What a change was, field by field: {"amount": [50, 60], …}
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes jsonb;

-- One envelope number per person. Created only when the existing data has no clashes;
-- the API also checks, and the Members page lists clashes so they can be fixed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'sanctuary' AND indexname = 'members_envelope_unique')
     AND NOT EXISTS (SELECT 1 FROM sanctuary.members WHERE envelope_number IS NOT NULL AND archived_at IS NULL
                     GROUP BY org_id, envelope_number HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX members_envelope_unique ON sanctuary.members (org_id, envelope_number)
      WHERE envelope_number IS NOT NULL AND archived_at IS NULL;
  END IF;
END $$;

-- Pairs someone confirmed are different people, so they stop being suggested as duplicates.
CREATE TABLE IF NOT EXISTS member_not_duplicates (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  a uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  b uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (a, b)
);

-- Fiscal year: the month it starts (1 = January, the default; 7 = July…).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fiscal_year_start int NOT NULL DEFAULT 1;
-- First day of the church's current fiscal year, in the church's time zone.
CREATE OR REPLACE FUNCTION sanctuary.fy_start(o uuid) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT make_date(
    extract(year FROM t.d)::int - CASE WHEN extract(month FROM t.d) < t.m THEN 1 ELSE 0 END, t.m, 1)
  FROM (SELECT sanctuary.org_today(o) AS d,
               COALESCE((SELECT fiscal_year_start FROM sanctuary.organizations WHERE id = o), 1) AS m) t
$$;

-- ─── v3: bank deposits ───────────────────────────────────────────────────────
-- A deposit slip groups closed counts (their cash and checks) taken to the bank together.
CREATE TABLE IF NOT EXISTS deposits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date           date NOT NULL,
  account        text,
  reference      text,
  notes          text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deposited','reconciled')),
  deposited_at   date,
  bank_amount    numeric(12,2),
  reconciled_at  timestamptz,
  reconcile_note text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deposits_org_idx ON deposits(org_id, date);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS deposit_id uuid REFERENCES deposits(id) ON DELETE SET NULL;

-- ─── v3: expenses, budgets and the church balance ────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS opening_balance numeric(12,2);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS opening_balance_date date;

CREATE TABLE IF NOT EXISTS expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color_slot  int NOT NULL DEFAULT 1,
  sort_order  int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Yearly budget per category; "year" is the fiscal year (named by the year it starts).
CREATE TABLE IF NOT EXISTS budgets (
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  year        int NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (category_id, year)
);
CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date         date NOT NULL,
  category_id  uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  fund_id      uuid REFERENCES funds(id) ON DELETE SET NULL,
  payee        text NOT NULL,
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  method       text NOT NULL DEFAULT 'check' CHECK (method IN ('cash','check','card','transfer','other')),
  reference    text,
  notes        text,
  receipt_file text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_org_date_idx ON expenses(org_id, date);

-- ─── v3: offering details ────────────────────────────────────────────────────
-- Value of goods or services the giver received in return (dinner ticket, raffle…). Only
-- amount − goods_value is tax-deductible; gifts over $75 with goods_value > 0 need a disclosure.
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS goods_value numeric(12,2) NOT NULL DEFAULT 0;
-- Reference of an imported online gift or an entry saved offline, so the same gift is never saved twice.
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS offerings_external_ref ON offerings(org_id, external_ref) WHERE external_ref IS NOT NULL;

-- ─── v3: households, pledges, non-cash gifts, personal links ─────────────────
CREATE TABLE IF NOT EXISTS households (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  joint_statement boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE members ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id) ON DELETE SET NULL;

-- What a person committed to give toward a goal (a "compromiso de fe").
CREATE TABLE IF NOT EXISTS pledges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  goal_id    uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount     numeric(12,2) NOT NULL CHECK (amount > 0),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, member_id)
);

-- Gifts of goods (furniture, food, equipment). The church describes them; it does not value them.
CREATE TABLE IF NOT EXISTS noncash_gifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date        date NOT NULL,
  description text NOT NULL,
  notes       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS noncash_org_idx ON noncash_gifts(org_id, date);

-- A private link a member opens to see their own giving and download their statement.
CREATE TABLE IF NOT EXISTS member_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  last_viewed_at timestamptz,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Monthly report e-mailed to the board, and the per-church AI switch.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS board_emails text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS board_report_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS board_report_day int NOT NULL DEFAULT 5;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS board_report_last text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS board_report_lang text NOT NULL DEFAULT 'es';
