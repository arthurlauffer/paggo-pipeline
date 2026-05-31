-- =============================================================================
-- Paggo Pipeline — Schema inicial para Neon / Supabase (PostgreSQL)
-- Execute este arquivo uma vez no SQL Editor do seu banco antes do primeiro deploy.
-- =============================================================================

-- Deals
CREATE TABLE IF NOT EXISTS deals (
  "dealId"                   TEXT PRIMARY KEY,
  "accountName"              TEXT NOT NULL,
  "accountSegment"           TEXT NOT NULL,
  "industry"                 TEXT NOT NULL,
  "ownerName"                TEXT NOT NULL,
  stage                      TEXT NOT NULL,
  amount                     REAL NOT NULL,
  "createdAt"                TEXT NOT NULL,
  "expectedCloseDate"        TEXT NOT NULL,
  "lastActivityAt"           TEXT,
  "lastActivityType"         TEXT,
  "daysInCurrentStage"       INTEGER NOT NULL DEFAULT 0,
  "contactsLogged"           INTEGER NOT NULL DEFAULT 0,
  source                     TEXT NOT NULL,
  "productInterest"          TEXT NOT NULL,
  "previousDealsWithAccount" INTEGER NOT NULL DEFAULT 0,
  "riskScore"                INTEGER NOT NULL DEFAULT 0,
  "riskFlags"                TEXT NOT NULL DEFAULT '[]',
  "riskLevel"                TEXT NOT NULL DEFAULT 'LOW',
  "updatedAt"                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_stage    ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_owner    ON deals("ownerName");
CREATE INDEX IF NOT EXISTS idx_deals_risk     ON deals("riskScore" DESC);
CREATE INDEX IF NOT EXISTS idx_deals_segment  ON deals("accountSegment");

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id           BIGSERIAL PRIMARY KEY,
  "dealId"     TEXT NOT NULL,
  type         TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  "activityAt" TEXT NOT NULL,
  "isNextStep" INTEGER NOT NULL DEFAULT 0,
  "isCompleted" INTEGER NOT NULL DEFAULT 0,
  "dueAt"      TEXT,
  "createdAt"  TEXT NOT NULL,
  "createdBy"  TEXT NOT NULL DEFAULT 'user'
);

CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities("dealId");

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  "dealId"      TEXT NOT NULL,
  action        TEXT NOT NULL,
  "oldValue"    TEXT,
  "newValue"    TEXT,
  reason        TEXT,
  notes         TEXT,
  "performedBy" TEXT NOT NULL DEFAULT 'manager',
  "originatedBy" TEXT NOT NULL DEFAULT 'user',
  "createdAt"   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_deal ON audit_log("dealId");

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id               TEXT PRIMARY KEY,
  "dealId"         TEXT NOT NULL,
  "authorId"       TEXT NOT NULL DEFAULT 'user-0',
  "authorName"     TEXT NOT NULL DEFAULT 'Você',
  content          TEXT NOT NULL,
  "mentionedUsers" TEXT NOT NULL DEFAULT '[]',
  "createdAt"      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_deal ON comments("dealId");

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id           TEXT PRIMARY KEY,
  "dealId"     TEXT,
  "dealName"   TEXT,
  message      TEXT NOT NULL,
  "triggerAt"  TEXT NOT NULL,
  "createdBy"  TEXT NOT NULL DEFAULT 'manager',
  "isDismissed" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders("triggerAt", "isDismissed");

-- Google credentials (OAuth)
CREATE TABLE IF NOT EXISTS google_credentials (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  access_token  TEXT,
  refresh_token TEXT,
  expiry_date   BIGINT,
  email         TEXT,
  display_name  TEXT,
  updated_at    TEXT NOT NULL
);

-- Calendar event links
CREATE TABLE IF NOT EXISTS calendar_event_links (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  deal_id     TEXT NOT NULL,
  event_title TEXT,
  event_start TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE(event_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_links_deal ON calendar_event_links(deal_id);

-- Calendar event notes
CREATE TABLE IF NOT EXISTS calendar_event_notes (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL,
  event_title TEXT,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cal_notes_event ON calendar_event_notes(event_id);

-- Workspace settings
CREATE TABLE IF NOT EXISTS workspace_settings (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  name       TEXT NOT NULL DEFAULT 'Paggo',
  slug       TEXT NOT NULL DEFAULT 'paggo',
  logo       TEXT,
  updated_at TEXT NOT NULL
);

-- Insert default workspace row (idempotent)
INSERT INTO workspace_settings (id, name, slug, logo, updated_at)
VALUES ('default', 'Paggo', 'paggo', NULL, NOW()::TEXT)
ON CONFLICT (id) DO NOTHING;

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  email     TEXT,
  role      TEXT NOT NULL DEFAULT 'Member',
  initials  TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT 'bg-indigo-500',
  status    TEXT NOT NULL DEFAULT 'active',
  "createdAt" TEXT NOT NULL
);

-- Seed default team members (idempotent)
INSERT INTO team_members (id, name, email, role, initials, color, status, "createdAt") VALUES
  ('user-0', 'Você',            'voce@paggo.com.br',           'Owner',             'VC', 'bg-indigo-500',  'active', NOW()::TEXT),
  ('user-1', 'Ana Paula',       'ana.paula@paggo.com.br',      'Sales Manager',     'AP', 'bg-purple-500',  'active', NOW()::TEXT),
  ('user-2', 'Rafael Souza',    'rafael.souza@paggo.com.br',   'Account Executive', 'RS', 'bg-blue-500',    'active', NOW()::TEXT),
  ('user-3', 'Juliana Costa',   'juliana.costa@paggo.com.br',  'Customer Success',  'JC', 'bg-emerald-500', 'active', NOW()::TEXT),
  ('user-4', 'Marcos Ferreira', 'marcos.ferreira@paggo.com.br','Sales Director',    'MF', 'bg-amber-500',   'active', NOW()::TEXT),
  ('user-5', 'Camila Rocha',    'camila.rocha@paggo.com.br',   'Biz Dev',           'CR', 'bg-pink-500',    'active', NOW()::TEXT)
ON CONFLICT (id) DO NOTHING;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'bg-indigo-500',
  "memberIds" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TEXT NOT NULL
);

-- Seed default teams (idempotent)
INSERT INTO teams (id, name, color, "memberIds", "createdAt") VALUES
  ('team-vendas', 'Vendas',           'bg-indigo-500',  '["user-0","user-1","user-2","user-4"]', NOW()::TEXT),
  ('team-cs',     'Customer Success', 'bg-emerald-500', '["user-3","user-5"]',                  NOW()::TEXT)
ON CONFLICT (id) DO NOTHING;
