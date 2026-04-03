# ExoBrain

A self-hosted MCP server providing a persistent knowledge graph and scoped memory database for humans and agents.

ExoBrain gives AI agents and their human collaborators a shared substrate for memory, identity, and context — one that survives across sessions, harnesses, and projects. It is the open-source generalization of a personal `brain-mcp` system built for long-running multi-agent work.

---

## What ExoBrain Is For

ExoBrain is an **intelligence layer**, not a document store or RAG pipeline.

It is designed to remember:
- What was learned and from what source
- What was decided and why
- What went wrong and how that changed the approach
- What an agent or human needs to carry forward across sessions and projects

It is **not** designed to:
- Store raw documents (use cloud storage — Box, Drive, S3)
- Bulk-index text for retrieval (use a dedicated RAG system)
- Replace a wiki or knowledge base

ExoBrain *can* do semantic retrieval, and is capable of full-fidelity recall when that matters. But its default posture is lean — distilled insight over verbose ingestion. A well-used ExoBrain stays sharp as it grows; a misused one becomes a dump.

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

**Recommended alongside ExoBrain:**
A dedicated RAG system (LightRAG, Chroma, etc.) for document-level retrieval. The two are complementary — RAG handles the archive, ExoBrain holds the intelligence. An agent queries RAG, finds something significant, distills it, and writes the insight into ExoBrain with source provenance.

---

## Agent Patterns

These are the core behaviors that make ExoBrain effective. Agents and their system prompts should follow this workflow.

### 1. Bootstrap at session start

Before doing anything else, load relevant context:

```
kg_get_context  topic: "current project or domain"
db_read         query: "relevant topic or recent decisions"
```

Don't skip this. Cold-starting without context is the main way agents repeat mistakes or re-derive things already known.

### 2. Take notes during work

When something important happens — a decision, a discovery, a constraint — write it immediately, not just at session end:

```
db_write  content: "distilled insight"
          entry_type: "semantic" | "episodic" | "procedural"
          importance_score: 0.0–1.0
          tags: ["project", "topic"]
          source_url / source_filename / source_file_id  (if derived from a document)
```

Write the *learning*, not the raw content. If you read a 50-page spec, write what it means for the work — not the spec itself.

### 3. Record corrections explicitly

When something previously believed turns out to be wrong, write a correction — don't just overwrite silently:

```
db_write  content: "corrected understanding of X"
          entry_type: "correction"
          importance_score: 0.8
          tags: ["correction", "topic"]
```

Corrections surface in future context and prevent the same mistake from recurring.

### 4. Collapse learning periodically

When several related entries accumulate, consolidate them into one stronger memory:

```
db_read   query: "topic to consolidate"
          → gather related entries

db_write  content: "synthesized understanding combining entry IDs [x, y, z]"
          importance_score: 0.85
          tags: ["consolidated", "topic"]
          metadata: { supersedes: ["entry-id-1", "entry-id-2", "entry-id-3"] }
```

This keeps the memory store from becoming noisy. High-importance consolidated entries surface before their lower-scored predecessors.

### 5. Promote durable concepts to the graph

When a concept proves genuinely foundational — appearing across multiple sessions, anchoring other decisions — promote it from memory to the knowledge graph:

```
kg_promote  name: "concept name"
            domain: "domain"
            anchor: "nearest core node ID"
            description: "what this concept represents and why it matters"
            space_id: "also write a memory entry linking back"
```

Not everything deserves graph promotion. Reserve it for concepts that should anchor future reasoning, not transient observations.

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
