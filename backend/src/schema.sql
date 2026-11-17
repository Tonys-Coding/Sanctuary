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
