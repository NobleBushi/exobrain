# ExoBrain Seed Scripts

Initialization scripts for all supported backends. Run once on first deployment.

## Directory Structure

```
seed/
├── arcadedb/     — TF3 Cypher seed (primary graph backend)
├── neo4j/        — TF3 Cypher seed (alternative graph backend)
├── postgres/     — PostgreSQL schema + seed data (primary database backend)
│   └── schema.sql
└── sqlite/       — SQLite schema + seed data (embedded/minimal tier)
    └── schema.sql
```

## Running the Seeds

### Docker (recommended)

The Postgres schema runs automatically on first container start — it is mounted as
`/docker-entrypoint-initdb.d/01-schema.sql`. No manual step needed.

ArcadeDB and Neo4j seeds must be run manually after the containers are healthy:

```bash
# Standard deployment
docker compose up -d
docker compose exec exobrain npm run seed:arcadedb   # or seed:neo4j

# Lite deployment
docker compose -f docker-compose.lite.yml up -d
# SQLite is seeded automatically by the MCP server on first start
```

### Manual

```bash
# PostgreSQL
psql -U exobrain -d exobrain -f seed/postgres/schema.sql

# SQLite
sqlite3 data/exobrain.db < seed/sqlite/schema.sql

# ArcadeDB / Neo4j (via seed scripts)
npm run seed:arcadedb
npm run seed:neo4j
```

## Vector Index Notes

Vector indexes are commented out in both schemas. After seeding and loading initial
data, create the appropriate index for your hardware:

**PostgreSQL — 4 GB / Raspberry Pi (IVFFlat, lower memory):**
```sql
CREATE INDEX idx_memory_embedding_ivfflat ON memory_entries
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
```

**PostgreSQL — 8 GB+ (HNSW, highest recall):**
```sql
CREATE INDEX idx_memory_embedding_hnsw ON memory_entries
  USING hnsw(embedding vector_cosine_ops);
```

**SQLite — enable sqlite-vec extension, then:**
```sql
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
  entry_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);
```

## After Seeding

The MCP server's initialization routine will:
1. Verify geometric integrity of the TF3 graph seed
2. Create the owner principal (prompted on first start)
3. Grant owner ACL to the three default spaces (public, shared, private)
4. Display connection details
