-- =============================================================================
-- ExoBrain: SQLite Schema (embedded/minimal tier)
-- Version 0.1
-- =============================================================================
-- SQLite does not support enums or arrays. We use TEXT with CHECK constraints
-- and JSON for array-like fields.
-- Vector search via sqlite-vec (loaded as extension at runtime).
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ─── Spaces ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spaces (
  space_id         TEXT     PRIMARY KEY,
  name             TEXT     NOT NULL,
  description      TEXT     NOT NULL DEFAULT '',
  space_type       TEXT     NOT NULL DEFAULT 'private'
                            CHECK (space_type IN ('public','shared','private','project','isolated')),
  sensitivity_tier INTEGER  NOT NULL DEFAULT 2,
  metadata         TEXT     NOT NULL DEFAULT '{}',  -- JSON
  archived_at      TEXT,    -- ISO 8601
  created_at       TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS space_acl_templates (
  space_type       TEXT  NOT NULL,
  principal_class  TEXT  NOT NULL,
  permissions      TEXT  NOT NULL,  -- JSON array: ["read","list","write",...]
  PRIMARY KEY (space_type, principal_class)
);

-- ─── Principals ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS principals (
  principal_id    TEXT  PRIMARY KEY,  -- UUID string
  principal_type  TEXT  NOT NULL CHECK (principal_type IN ('owner','user','agent','group')),
  name            TEXT  NOT NULL,
  display_name    TEXT,
  username        TEXT  UNIQUE,
  email           TEXT  UNIQUE,
  password_hash   TEXT,
  oauth_provider  TEXT,
  oauth_subject   TEXT,
  disabled_at     TEXT,
  created_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (oauth_provider, oauth_subject)
);

CREATE INDEX IF NOT EXISTS idx_principals_email    ON principals(email)    WHERE email    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_principals_username ON principals(username) WHERE username IS NOT NULL;

-- ─── ACL Entries ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acl_entries (
  acl_id        TEXT  PRIMARY KEY,  -- UUID string
  principal_id  TEXT  NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  space_id      TEXT  NOT NULL REFERENCES spaces(space_id) ON DELETE CASCADE,
  permissions   TEXT  NOT NULL,     -- JSON array
  granted_by    TEXT  NOT NULL REFERENCES principals(principal_id),
  granted_at    TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT,
  UNIQUE (principal_id, space_id)
);

-- ─── API Keys ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  key_id        TEXT  PRIMARY KEY,
  key_hash      TEXT  NOT NULL UNIQUE,
  key_prefix    TEXT  NOT NULL,
  principal_id  TEXT  NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  name          TEXT  NOT NULL,
  space_ids     TEXT  NOT NULL,  -- JSON array
  permissions   TEXT  NOT NULL,  -- JSON array
  issued_by     TEXT  NOT NULL REFERENCES principals(principal_id),
  issued_at     TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT,
  revoked_at    TEXT,
  last_used_at  TEXT
);

-- ─── OAuth ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id          TEXT  PRIMARY KEY,
  client_secret_hash TEXT  NOT NULL,
  name               TEXT  NOT NULL,
  redirect_uris      TEXT  NOT NULL,  -- JSON array
  principal_id       TEXT  REFERENCES principals(principal_id),
  created_at         TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_id      TEXT  PRIMARY KEY,
  token_hash    TEXT  NOT NULL UNIQUE,
  token_type    TEXT  NOT NULL DEFAULT 'access',
  client_id     TEXT  NOT NULL REFERENCES oauth_clients(client_id),
  principal_id  TEXT  NOT NULL REFERENCES principals(principal_id),
  scopes        TEXT  NOT NULL,  -- JSON array
  issued_at     TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT  NOT NULL,
  revoked_at    TEXT
);

-- ─── Sessions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT  PRIMARY KEY,
  token_hash    TEXT  NOT NULL UNIQUE,
  principal_id  TEXT  NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  created_at    TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT  NOT NULL,
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash   ON sessions(token_hash)   WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_principal_id ON sessions(principal_id) WHERE revoked_at IS NULL;

-- ─── Memory Entries ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_entries (
  entry_id         TEXT     PRIMARY KEY,
  space_id         TEXT     NOT NULL REFERENCES spaces(space_id),
  principal_id     TEXT     NOT NULL REFERENCES principals(principal_id),
  content          TEXT     NOT NULL,
  summary          TEXT,
  entry_type       TEXT     NOT NULL DEFAULT 'semantic'
                            CHECK (entry_type IN ('semantic','procedural','episodic','correction')),
  importance_score REAL     NOT NULL DEFAULT 0.5,
  tags             TEXT     NOT NULL DEFAULT '[]',    -- JSON array
  metadata         TEXT     NOT NULL DEFAULT '{}',   -- JSON object
  -- Provenance
  model            TEXT,
  agent_name       TEXT,
  -- Embedding handled by sqlite-vec virtual table (see below)
  embedding_model  TEXT,
  embedding_status TEXT     NOT NULL DEFAULT 'pending'
                            CHECK (embedding_status IN ('pending','complete','failed')),
  -- KG links
  kg_nodes         TEXT     NOT NULL DEFAULT '[]',   -- JSON array of TF3 node IDs
  -- Timestamps
  archived_at      TEXT,
  created_at       TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_space      ON memory_entries(space_id);
CREATE INDEX IF NOT EXISTS idx_memory_principal  ON memory_entries(principal_id);
CREATE INDEX IF NOT EXISTS idx_memory_type       ON memory_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_entries(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memory_created    ON memory_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_pending    ON memory_entries(entry_id)
  WHERE embedding_status = 'pending';

-- sqlite-vec virtual table for vector search.
-- Load the extension first: db.loadExtension('sqlite-vec');
-- Dimension must match your embedding model (768 = nomic-embed-text).
-- CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
--   entry_id TEXT PRIMARY KEY,
--   embedding FLOAT[768]
-- );

-- ─── Audit Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id      TEXT  PRIMARY KEY,
  action        TEXT  NOT NULL,
  principal_id  TEXT  REFERENCES principals(principal_id),
  target_type   TEXT,
  target_id     TEXT,
  space_id      TEXT,
  details       TEXT,  -- JSON
  model         TEXT,
  agent_name    TEXT,
  ip_address    TEXT,
  logged_at     TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_principal ON audit_log(principal_id);
CREATE INDEX IF NOT EXISTS idx_audit_space     ON audit_log(space_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_logged_at ON audit_log(logged_at DESC);

-- ─── Seed Data ────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO spaces (space_id, name, description, space_type, sensitivity_tier) VALUES
  ('public',  'Public',  'Public content — no sensitivity',          'public',  0),
  ('shared',  'Shared',  'Shared across all registered principals',  'shared',  1),
  ('private', 'Private', 'Owner-only private content',               'private', 3);

INSERT OR IGNORE INTO space_acl_templates (space_type, principal_class, permissions) VALUES
  ('public',   'everyone',      '["read"]'),
  ('public',   'authenticated', '["read","list","write"]'),
  ('public',   'owner',         '["read","list","write","delete","manage","admin"]'),
  ('shared',   'authenticated', '["read","list","write"]'),
  ('shared',   'owner',         '["read","list","write","delete","manage","admin"]'),
  ('private',  'owner',         '["read","list","write","delete","manage","admin"]'),
  ('project',  'owner',         '["read","list","write","delete","manage","admin"]'),
  ('isolated', 'owner',         '["read","list","write","delete","manage","admin"]');
