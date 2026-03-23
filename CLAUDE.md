# ExoBrain — Claude Code Instructions

## Session Bootstrap

At the start of every session, bootstrap brain-mcp for context continuity:

```
bootstrap_session("mesh-infra")
```

Search brain-mcp for relevant prior decisions before making architectural changes:
```
search_memory("exobrain [topic]", space_id="mesh-infra")
```

Save significant decisions back to brain-mcp so other agents and future sessions have full context:
```
add_memory(content, space_id="mesh-infra", importance_score=0.9, tags=["exobrain", ...])
```

## What This Project Is

ExoBrain is an open-source MCP server providing a knowledge graph (TF3/ADFR-derived geometry) plus a scoped memory/context database layer. It is the public, generalized version of the personal `brain-mcp` project.

**Key design decisions are stored in brain-mcp** (space: `mesh-infra`). Search there first before re-deriving anything significant. The Box folder (ID: 372259531135) holds the specification documents.

## Project Structure

```
exobrain/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── adapters/
│   │   ├── graph/            # ArcadeDB, Neo4j adapters
│   │   └── db/               # Postgres, SQLite, libSQL adapters
│   ├── tools/                # MCP tool implementations
│   └── middleware/           # Auth, scope enforcement, audit logging
├── seed/
│   ├── arcadedb/             # TF3 Cypher seed (primary)
│   ├── neo4j/                # TF3 Cypher seed (alternative)
│   ├── postgres/             # Schema SQL (principals, ACL, spaces, audit)
│   └── sqlite/               # Lightweight schema
├── docs/                     # Spec documents (from Box)
├── docker-compose.yml        # ArcadeDB + Postgres (standard)
└── docker-compose.lite.yml   # Embedded / Pi-friendly
```

## Architecture Decisions (Summary)

Full rationale is in brain-mcp. Short version:

- **Graph:** ArcadeDB (Apache 2.0, 97.8% Cypher TCK, Bolt protocol, Raspberry Pi → K8s)
- **Database:** PostgreSQL + pgvector (primary), SQLite + sqlite-vec (embedded tier)
- **Auth:** OAuth 2.0/PKCE (Google + GitHub) for humans; scoped API keys for agents
- **ACL:** NTFS-inspired — space types with default permission templates, enforced at MCP layer
- **Provenance:** Every write records `model`, `agent_name`, `principal_id`, `timestamp` — built in from init

## Access Control Model

Spaces: `public` · `shared` · `private` · `project` · `isolated`
Permissions: `read` · `list` · `write` · `delete` · `manage` · `admin`
Principals: `owner` · `user` · `agent` (always sub-user) · `group` · `authenticated` · `everyone`

ACL is enforced at the MCP server layer. The database layer does not need RBAC.

## Build Sequence

- **Phase 1 (current):** Seed scripts — TF3 Cypher + Postgres schema
- **Phase 2:** MCP server + tools
- **Phase 3:** Docker Compose + deployment guide
- **Phase 4:** Web interface (registration, key management, permissions browser)
- **Phase 5:** NanoClaw + Hermes integration
- **Phase 6:** Public release (MIT)

## MCP Tools (Phase 2 target)

**Graph:** `kg_query`, `kg_add_node`, `kg_add_edge`, `kg_get_context`, `kg_promote`
**Spaces:** `space_list`, `space_get`, `space_create`, `space_update`, `space_archive`
**Database:** `db_read`, `db_write`, `db_scope`, `audit_read`
**Keys:** `principal_list`, `key_issue`, `key_revoke`, `key_list`

## Related Projects

- `~/brain/` — personal brain-mcp instance (brain-mcp is ExoBrain's predecessor)
- `~/nanoclaw/` — NanoClaw personal assistant (Cecil); primary agent integration target
- `~/hermes-agent/` — Hermes-Agent (cloned for evaluation)
- Box folder 372259531135 — spec documents (agent.md, geometry.md, REQUIREMENTS.md, TF3_KG_SPEC.md)

## Session Conventions

- Space for brain-mcp writes from this project: `mesh-infra`
- Tag all ExoBrain-related memories: `["exobrain", ...]`
- Document backend decisions, schema changes, and architectural pivots — not implementation details
