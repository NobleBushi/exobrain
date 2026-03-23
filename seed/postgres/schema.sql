-- =============================================================================
-- ExoBrain: PostgreSQL Schema
-- Version 0.1
-- =============================================================================
-- Run order: this file is mounted as docker-entrypoint-initdb.d/01-schema.sql
-- and executes automatically on first container start.
-- For manual runs: psql -U exobrain -d exobrain -f schema.sql
-- =============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- fuzzy text search

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE space_type AS ENUM (
  'public',    -- readable by everyone, writable by authenticated
  'shared',    -- readable/writable by all registered principals
  'private',   -- owner only
  'project',   -- named principals configured at creation
  'isolated'   -- explicit grant only
);

CREATE TYPE principal_type AS ENUM (
  'owner',   -- instance owner, always full control
  'user',    -- registered human
  'agent',   -- machine principal (API key)
  'group'    -- logical collection of users (future)
);

CREATE TYPE permission AS ENUM (
  'read',    -- read entry content
  'list',    -- enumerate space contents
  'write',   -- create/update entries
  'delete',  -- remove entries
  'manage',  -- change space ACL, issue API keys
  'admin'    -- full control including space creation/deletion
);

CREATE TYPE entry_type AS ENUM (
  'semantic',    -- factual/conceptual knowledge
  'procedural',  -- how-to, process knowledge
  'episodic',    -- event/experience-based
  'correction'   -- correction to a prior belief
);

CREATE TYPE embed_status AS ENUM ('pending', 'complete', 'failed');

CREATE TYPE audit_action AS ENUM (
  'space_create', 'space_update', 'space_archive',
  'entry_write', 'entry_update', 'entry_delete',
  'principal_create', 'principal_disable',
  'acl_grant', 'acl_revoke',
  'key_issue', 'key_revoke',
  'scope_change',
  'auth_success', 'auth_failure'
);

-- ─── Spaces ──────────────────────────────────────────────────────────────────

CREATE TABLE spaces (
  space_id         TEXT         PRIMARY KEY,
  name             TEXT         NOT NULL,
  description      TEXT         NOT NULL DEFAULT '',
  space_type       space_type   NOT NULL DEFAULT 'private',
  sensitivity_tier INTEGER      NOT NULL DEFAULT 2 CHECK (sensitivity_tier BETWEEN 0 AND 4),
  metadata         JSONB        NOT NULL DEFAULT '{}',
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Default ACL templates — defines permissions per principal class per space type.
-- 'everyone' = all including unauthenticated (public only)
-- 'authenticated' = any registered user or valid agent key
-- 'owner' = instance owner
-- Extensions can add rows for custom space types without schema changes.
CREATE TABLE space_acl_templates (
  space_type       space_type   NOT NULL,
  principal_class  TEXT         NOT NULL,  -- 'everyone' | 'authenticated' | 'owner'
  permissions      permission[] NOT NULL,
  PRIMARY KEY (space_type, principal_class)
);

-- ─── Principals ──────────────────────────────────────────────────────────────

CREATE TABLE principals (
  principal_id    UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  principal_type  principal_type  NOT NULL,
  name            TEXT            NOT NULL,
  display_name    TEXT,
  email           TEXT,
  password_hash   TEXT,           -- for username/password auth (bcrypt)
  oauth_provider  TEXT,           -- 'google' | 'github'
  oauth_subject   TEXT,           -- provider's stable user ID
  disabled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (oauth_provider, oauth_subject)
);

CREATE INDEX idx_principals_email ON principals(email) WHERE email IS NOT NULL;
CREATE INDEX idx_principals_type  ON principals(principal_type);

-- ─── ACL Entries ─────────────────────────────────────────────────────────────
-- Explicit per-principal, per-space permission grants.
-- Deny is explicit: store a row with permissions = '{}' to block a principal
-- who would otherwise inherit a template grant.

CREATE TABLE acl_entries (
  acl_id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  principal_id  UUID         NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  space_id      TEXT         NOT NULL REFERENCES spaces(space_id) ON DELETE CASCADE,
  permissions   permission[] NOT NULL,
  granted_by    UUID         NOT NULL REFERENCES principals(principal_id),
  granted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  UNIQUE (principal_id, space_id)
);

CREATE INDEX idx_acl_entries_principal ON acl_entries(principal_id);
CREATE INDEX idx_acl_entries_space     ON acl_entries(space_id);

-- ─── API Keys (scoped agent credentials) ─────────────────────────────────────
-- Full key is never stored. key_hash = SHA-256(raw_key).
-- key_prefix (first 8 chars) is shown in UI for identification only.

CREATE TABLE api_keys (
  key_id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash      TEXT         NOT NULL UNIQUE,
  key_prefix    TEXT         NOT NULL,
  principal_id  UUID         NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  name          TEXT         NOT NULL,   -- e.g., "Cecil / NanoClaw"
  space_ids     TEXT[]       NOT NULL,   -- allowed space IDs
  permissions   permission[] NOT NULL,
  issued_by     UUID         NOT NULL REFERENCES principals(principal_id),
  issued_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_principal ON api_keys(principal_id);
CREATE INDEX idx_api_keys_hash      ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- ─── OAuth (human users, browser-based flow) ─────────────────────────────────

CREATE TABLE oauth_clients (
  client_id          TEXT         PRIMARY KEY,
  client_secret_hash TEXT         NOT NULL,
  name               TEXT         NOT NULL,
  redirect_uris      TEXT[]       NOT NULL,
  principal_id       UUID         REFERENCES principals(principal_id),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_tokens (
  token_id      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash    TEXT         NOT NULL UNIQUE,
  token_type    TEXT         NOT NULL DEFAULT 'access',  -- 'access' | 'refresh'
  client_id     TEXT         NOT NULL REFERENCES oauth_clients(client_id),
  principal_id  UUID         NOT NULL REFERENCES principals(principal_id),
  scopes        TEXT[]       NOT NULL,
  issued_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ  NOT NULL,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_oauth_tokens_hash      ON oauth_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_oauth_tokens_principal ON oauth_tokens(principal_id);

-- ─── Memory Entries ──────────────────────────────────────────────────────────
-- The primary knowledge store. Separated from the graph layer by design.

CREATE TABLE memory_entries (
  entry_id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_id         TEXT          NOT NULL REFERENCES spaces(space_id),
  principal_id     UUID          NOT NULL REFERENCES principals(principal_id),

  -- Content
  content          TEXT          NOT NULL,
  summary          TEXT,
  entry_type       entry_type    NOT NULL DEFAULT 'semantic',
  importance_score FLOAT         NOT NULL DEFAULT 0.5
                                 CHECK (importance_score BETWEEN 0.0 AND 1.0),
  tags             TEXT[],
  metadata         JSONB         NOT NULL DEFAULT '{}',

  -- Provenance (built in from day one — not retrofitted)
  model            TEXT,         -- e.g., 'claude-sonnet-4-6', 'gpt-4o', 'phi4mini'
  agent_name       TEXT,         -- e.g., 'Cecil', 'coordinator', 'exobrain-mcp'

  -- Vector embedding for semantic search
  -- nomic-embed-text: 768 dims. Change if swapping models (requires schema migration).
  embedding        vector(768),
  embedding_model  TEXT,
  embedding_status embed_status  NOT NULL DEFAULT 'pending',

  -- Knowledge graph links (TF3 node IDs this entry relates to)
  kg_nodes         TEXT[],

  -- Timestamps
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_memory_space       ON memory_entries(space_id);
CREATE INDEX idx_memory_principal   ON memory_entries(principal_id);
CREATE INDEX idx_memory_type        ON memory_entries(entry_type);
CREATE INDEX idx_memory_importance  ON memory_entries(importance_score DESC);
CREATE INDEX idx_memory_created     ON memory_entries(created_at DESC);
CREATE INDEX idx_memory_tags        ON memory_entries USING GIN(tags);
CREATE INDEX idx_memory_kg_nodes    ON memory_entries USING GIN(kg_nodes);
CREATE INDEX idx_memory_embedding_pending ON memory_entries(entry_id)
  WHERE embedding_status = 'pending';

-- Full-text search
CREATE INDEX idx_memory_content_fts ON memory_entries
  USING GIN(to_tsvector('english', content));

-- Vector indexes — choose one based on hardware:
--
-- IVFFlat: lower memory, good for 4 GB deployments, build requires some data first
-- CREATE INDEX idx_memory_embedding_ivfflat ON memory_entries
--   USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
--
-- HNSW: highest recall, more memory, best for 8 GB+ deployments
-- CREATE INDEX idx_memory_embedding_hnsw ON memory_entries
--   USING hnsw(embedding vector_cosine_ops);
--
-- On first deployment, leave indexes commented. Run the seed, load some data,
-- then create the appropriate index. See deployment guide for tuning.

-- ─── Memory Chunks (for long-entry chunked embeddings) ───────────────────────
-- Entries longer than ~400 tokens are split into overlapping chunks.
-- Vector search hits chunks and deduplicates back to parent entries.
-- Short entries (<= threshold) embed directly on memory_entries.embedding.

CREATE TABLE memory_chunks (
  chunk_id     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id     UUID          NOT NULL REFERENCES memory_entries(entry_id) ON DELETE CASCADE,
  chunk_index  INTEGER       NOT NULL,
  content      TEXT          NOT NULL,
  token_est    INTEGER,                  -- estimated token count
  embedding    vector(768),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, chunk_index)
);

CREATE INDEX idx_chunks_entry_id  ON memory_chunks(entry_id);
-- Chunk vector index (same pattern as memory_entries — uncomment after data load):
-- CREATE INDEX idx_chunks_embedding_hnsw ON memory_chunks
--   USING hnsw(embedding vector_cosine_ops);

-- ─── Audit Log (immutable, append-only) ──────────────────────────────────────
-- No UPDATE or DELETE should ever touch this table in production.
-- Enforce via a dedicated audit role with INSERT-only access.

CREATE TABLE audit_log (
  audit_id      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  action        audit_action  NOT NULL,
  principal_id  UUID          REFERENCES principals(principal_id),
  target_type   TEXT,         -- 'space' | 'entry' | 'principal' | 'key' | 'acl'
  target_id     TEXT,
  space_id      TEXT,
  details       JSONB,
  model         TEXT,
  agent_name    TEXT,
  ip_address    TEXT,
  logged_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_principal ON audit_log(principal_id);
CREATE INDEX idx_audit_space     ON audit_log(space_id);
CREATE INDEX idx_audit_action    ON audit_log(action);
CREATE INDEX idx_audit_logged_at ON audit_log(logged_at DESC);

-- ─── Seed Data ────────────────────────────────────────────────────────────────

-- Default spaces (created at init; owner ACL granted after principal creation)
INSERT INTO spaces (space_id, name, description, space_type, sensitivity_tier) VALUES
  ('public',  'Public',  'Public content — no sensitivity',             'public',  0),
  ('shared',  'Shared',  'Shared across all registered principals',     'shared',  1),
  ('private', 'Private', 'Owner-only private content',                  'private', 3);

-- ACL templates (defines what each principal class can do in each space type)
INSERT INTO space_acl_templates (space_type, principal_class, permissions) VALUES
  -- public
  ('public', 'everyone',      ARRAY['read']::permission[]),
  ('public', 'authenticated', ARRAY['read','list','write']::permission[]),
  ('public', 'owner',         ARRAY['read','list','write','delete','manage','admin']::permission[]),
  -- shared
  ('shared', 'authenticated', ARRAY['read','list','write']::permission[]),
  ('shared', 'owner',         ARRAY['read','list','write','delete','manage','admin']::permission[]),
  -- private
  ('private', 'owner',        ARRAY['read','list','write','delete','manage','admin']::permission[]),
  -- project (named principals configured at space creation)
  ('project', 'owner',        ARRAY['read','list','write','delete','manage','admin']::permission[]),
  -- isolated (explicit grant only)
  ('isolated', 'owner',       ARRAY['read','list','write','delete','manage','admin']::permission[]);
