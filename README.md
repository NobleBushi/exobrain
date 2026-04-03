# ExoBrain

A self-hosted MCP server providing a persistent knowledge graph and scoped memory database for humans and agents.

ExoBrain gives AI agents and their human collaborators a shared substrate for memory, identity, and context — one that survives across sessions, harnesses, and projects. It is the open-source generalization of a personal `brain-mcp` system built for long-running multi-agent work.

---

## What It Provides

- **Knowledge graph** — ArcadeDB with TF3/ADFR geometry, queryable via Cypher
- **Scoped memory database** — PostgreSQL + pgvector (primary) or SQLite + sqlite-vec (embedded)
- **MCP server** — tools for graph queries, memory read/write, space management, and key issuance
- **Access control** — space-scoped ACL with principal types (owner, user, agent, group)
- **Provenance** — every write records model, agent name, principal, and timestamp
- **Admin UI** — web dashboard for key management, space browsing, and system status

---

## Architecture

```
                  ┌─────────────────────────────┐
                  │        MCP Clients          │
                  │  (Claude Code, agents, etc) │
                  └──────────────┬──────────────┘
                                 │ Bearer token
                  ┌──────────────▼──────────────┐
                  │         ExoBrain            │
                  │   MCP server  +  REST API   │
                  │   Auth  ·  ACL  ·  Audit    │
                  └────────┬────────┬───────────┘
                           │        │
             ┌─────────────▼─┐  ┌───▼──────────────┐
             │   ArcadeDB    │  │  PostgreSQL        │
             │  Knowledge    │  │  Memory · Keys     │
             │  Graph (TF3)  │  │  Spaces · Audit   │
             └───────────────┘  └──────────────────┘
```

**Backends:**
| Layer | Primary | Embedded / Edge |
|-------|---------|-----------------|
| Graph | ArcadeDB | ArcadeDB (embedded mode) |
| Database | PostgreSQL + pgvector | SQLite + sqlite-vec |

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/NobleBushi/exobrain.git
cd exobrain
cp .env.example .env
```

Edit `.env` — at minimum set `ARCADEDB_PASSWORD`, `POSTGRES_PASSWORD`, `JWT_SECRET`, and `REGISTRATION_SECRET` to something other than `changeme`.

### 2. Start the backends

```bash
docker compose up -d
```

This starts ArcadeDB (port 2480 / Bolt 2424) and PostgreSQL + pgvector (port 5433). The Postgres schema is applied automatically on first run.

### 3. Seed the knowledge graph

```bash
npm install
npm run seed:arcadedb
```

### 4. Run the server

```bash
npm run build
npm start
```

Or in development with live reload:

```bash
npm run dev
```

### 5. Set up your instance

Open `http://localhost:3000/setup` and create your owner account.

Then open `http://localhost:3000/admin` to manage API keys, spaces, and system status.

---

## MCP Connection

ExoBrain speaks the MCP protocol over StreamableHTTP (Claude Code, MCP SDK) and SSE (Claude Desktop, legacy clients).

**StreamableHTTP:**
```
POST http://localhost:3000/mcp
Authorization: Bearer <your-api-key>
```

**SSE:**
```
GET http://localhost:3000/sse
Authorization: Bearer <your-api-key>
```

API keys are issued from the admin dashboard or via the `key_issue` MCP tool.

---

## MCP Tools

| Category | Tools |
|----------|-------|
| **Graph** | `kg_query` · `kg_add_node` · `kg_add_edge` · `kg_get_context` · `kg_promote` |
| **Memory** | `db_read` · `db_write` · `db_scope` · `audit_read` |
| **Spaces** | `space_list` · `space_get` · `space_create` · `space_update` · `space_archive` |
| **Keys** | `key_issue` · `key_revoke` · `key_list` · `principal_list` |

---

## Access Control

Spaces have five types: `public` · `shared` · `private` · `project` · `isolated`

Permissions: `read` · `list` · `write` · `delete` · `manage` · `admin`

Principals: `owner` · `user` · `agent` · `group`

Agents always operate with sub-user authority — a token cannot grant permissions the issuer does not hold. ACL is enforced at the MCP server layer.

---

## Embedded / Edge Deployment

For Raspberry Pi or single-board deployments, use the lite compose file and SQLite backend:

```bash
docker compose -f docker-compose.lite.yml up -d
DB_BACKEND=sqlite SQLITE_PATH=./data/exobrain.db npm start
```

---

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Seed scripts — TF3 Cypher + schema SQL |
| 2 | ✅ | MCP server + tools |
| 3 | ✅ | Docker Compose + deployment |
| 4 | ✅ | Admin web UI — setup, dashboard, key management |
| 5 | 🔄 | NanoClaw + Hermes integration |
| 6 | ⬜ | Public release hardening |

This is pre-release software. The core is functional but the security model, schema, and APIs may change before v1.0.

---

## License

MIT — see [LICENSE](LICENSE).
