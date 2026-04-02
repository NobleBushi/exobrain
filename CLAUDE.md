# ExoBrain — Claude Code Instructions

## What This Project Is

ExoBrain is an open-source MCP server providing:
- A **knowledge graph** layer (ArcadeDB, TF3/ADFR-derived geometry) accessible via Cypher
- A **scoped memory/context database** (PostgreSQL + pgvector or SQLite + sqlite-vec)
- **Multi-principal access control** — humans, agents, groups — with space-scoped ACL
- **Provenance tracking** on every write (model, agent, principal, timestamp)

It is designed to serve as a persistent identity, memory, and coordination substrate for humans and agents working together across projects, harnesses, and time.

## Project Structure

```
exobrain/
├── src/
│   ├── index.ts              # HTTP server, MCP transport, request routing
│   ├── auth.ts               # API key + session token verification
│   ├── adapters/
│   │   ├── graph/            # ArcadeDB adapter (Neo4j interface planned)
│   │   └── db/               # PostgreSQL and SQLite adapters + shared types
│   ├── tools/                # MCP tool implementations (kg, db, spaces, keys)
│   ├── api/                  # REST API route handlers
│   └── middleware/           # Auth middleware, JSON helpers
├── seed/
│   ├── arcadedb/             # TF3 Cypher seed (primary graph backend)
│   ├── neo4j/                # TF3 Cypher seed (alternative)
│   ├── postgres/             # Schema SQL + seed script
│   └── sqlite/               # Lightweight schema + seed script
├── docs/                     # Specification and architecture documents
├── public/                   # Admin web UI (HTML/CSS/JS, no framework)
├── scripts/                  # Setup, backup, port-check utilities
├── docker-compose.yml        # ArcadeDB + PostgreSQL (standard)
└── docker-compose.lite.yml   # Embedded / Pi-friendly
```

## Architecture Decisions

- **Graph:** ArcadeDB — Apache 2.0, 97.8% Cypher TCK, Bolt protocol, runs on Raspberry Pi through K8s
- **Database:** PostgreSQL + pgvector (primary); SQLite + sqlite-vec (embedded/edge tier)
- **Auth:** Username/password sessions + scoped API keys for agents; OAuth 2.0/PKCE placeholders in schema
- **ACL:** NTFS-inspired — space types with default permission templates, enforced at the MCP layer
- **Provenance:** Every write records `model`, `agent_name`, `principal_id`, `timestamp`

## Access Control Model

Spaces: `public` · `shared` · `private` · `project` · `isolated`
Permissions: `read` · `list` · `write` · `delete` · `manage` · `admin`
Principals: `owner` · `user` · `agent` (always sub-user authority) · `group`

Token permissions are enforced before ACL: a token cannot grant more than the issuer holds.

## Build Phases

- **Phase 1** ✓ Seed scripts — TF3 Cypher + schema SQL
- **Phase 2** ✓ MCP server + tools
- **Phase 3** ✓ Docker Compose + deployment
- **Phase 4** ✓ Web UI — setup, admin dashboard, key management
- **Phase 5** NanoClaw + Hermes integration
- **Phase 6** Public release (MIT)

## MCP Tools

**Graph:** `kg_query` · `kg_add_node` · `kg_add_edge` · `kg_get_context` · `kg_promote`
**Spaces:** `space_list` · `space_get` · `space_create` · `space_update` · `space_archive`
**Database:** `db_read` · `db_write` · `db_scope` · `audit_read`
**Keys:** `principal_list` · `key_issue` · `key_revoke` · `key_list`

## Development Notes

- TypeScript throughout — `npm run build` compiles to `dist/`
- No frontend framework — admin UI is vanilla HTML/CSS/JS in `public/`
- Both DB adapters must implement the full `DbAdapter` interface in `src/adapters/db/types.ts`
- API keys are never stored raw — only a hash is persisted; the raw value is returned once on issuance
- Audit logging is mandatory on all key and space mutations

## Personal Context Files (`.claude/`)

The `.claude/` directory is gitignored. Use it for individual context files that are specific to your setup — session bootstrap instructions, integration details for personal tooling, per-topic working notes, or environment-specific configuration guidance for AI assistants.

Example layout:
```
.claude/
├── CLAUDE.md          # personal session bootstrap (brain-mcp, local agent setup, etc.)
├── integrations.md    # notes on local integrations not in the public repo
└── hardware.md        # deployment target context
```

These files are never committed. Contributors are encouraged to maintain their own `.claude/` for context that improves AI-assisted work without leaking personal details into the shared repo.
