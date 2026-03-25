import pg from "pg";
import type { DbAdapter, Space, ApiKeyRecord, OAuthTokenRecord, PrincipalRecord, MemoryEntry } from "./types.js";

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function rowToCamel<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [snakeToCamel(k), v])
  ) as T;
}

export class PostgresAdapter implements DbAdapter {
  private pool: pg.Pool | null = null;

  constructor(private connectionString: string) {}

  async connect(): Promise<void> {
    this.pool = new pg.Pool({ connectionString: this.connectionString });
    await this.pool.query("SELECT 1");
    console.log("✓ PostgreSQL connected");
  }

  async disconnect(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }

  private async q<T extends pg.QueryResultRow>(
    text: string, values?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    if (!this.pool) throw new Error("Postgres not connected");
    const result = await this.pool.query(text, values);
    result.rows = result.rows.map(rowToCamel<T>);
    return result as pg.QueryResult<T>;
  }

  // ─── Spaces ──────────────────────────────────────────────────────────────

  async listSpaces(principalId: string): Promise<Space[]> {
    const res = await this.q<Space>(`
      SELECT DISTINCT s.*
      FROM spaces s
      LEFT JOIN acl_entries a ON a.space_id = s.space_id AND a.principal_id = $1
      LEFT JOIN space_acl_templates t ON t.space_type = s.space_type
        AND t.principal_class IN ('authenticated', 'everyone')
      WHERE s.archived_at IS NULL
        AND (
          a.permissions != '{}'::permission[]
          OR t.principal_class IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM principals p
            WHERE p.principal_id = $1 AND p.principal_type = 'owner'
          )
        )
      ORDER BY s.space_id
    `, [principalId]);
    return res.rows;
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    const res = await this.q<Space>(
      "SELECT * FROM spaces WHERE space_id = $1",
      [spaceId]
    );
    return res.rows[0] ?? null;
  }

  async createSpace(space: Omit<Space, "createdAt" | "updatedAt">): Promise<Space> {
    const res = await this.q<Space>(`
      INSERT INTO spaces (space_id, name, description, space_type, sensitivity_tier, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [space.spaceId, space.name, space.description, space.spaceType,
        space.sensitivityTier ?? 2, JSON.stringify(space.metadata ?? {})]);
    return res.rows[0];
  }

  async updateSpace(spaceId: string, updates: Partial<Space>): Promise<Space> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (updates.name)        { sets.push(`name = $${i++}`);        vals.push(updates.name); }
    if (updates.description) { sets.push(`description = $${i++}`); vals.push(updates.description); }
    if (updates.spaceType)   { sets.push(`space_type = $${i++}`);  vals.push(updates.spaceType); }
    sets.push(`updated_at = NOW()`);
    vals.push(spaceId);
    const res = await this.q<Space>(
      `UPDATE spaces SET ${sets.join(", ")} WHERE space_id = $${i} RETURNING *`,
      vals
    );
    return res.rows[0];
  }

  async archiveSpace(spaceId: string): Promise<void> {
    await this.q(
      "UPDATE spaces SET archived_at = NOW(), updated_at = NOW() WHERE space_id = $1",
      [spaceId]
    );
  }

  // ─── Permission checking ──────────────────────────────────────────────────

  async hasPermission(principalId: string, spaceId: string, permission: string): Promise<boolean> {
    const res = await this.q<{ hasPerm: boolean }>(`
      SELECT (
        -- owners have all permissions on all spaces
        EXISTS (
          SELECT 1 FROM principals
          WHERE principal_id = $1 AND principal_type = 'owner'
        )
        OR
        -- explicit ACL entry grants the requested permission
        EXISTS (
          SELECT 1 FROM acl_entries
          WHERE principal_id = $1 AND space_id = $2
            AND $3::text = ANY(permissions::text[])
            AND (expires_at IS NULL OR expires_at > NOW())
        )
        OR
        -- space ACL template grants permission to 'authenticated' class
        EXISTS (
          SELECT 1 FROM space_acl_templates t
          JOIN spaces s ON s.space_type = t.space_type
          WHERE s.space_id = $2
            AND t.principal_class = 'authenticated'
            AND $3::text = ANY(t.permissions::text[])
        )
      ) AS has_perm
    `, [principalId, spaceId, permission]);
    return res.rows[0]?.hasPerm ?? false;
  }

  async getPrincipalSpaces(principalId: string): Promise<string[]> {
    const spaces = await this.listSpaces(principalId);
    return spaces.map(s => s.spaceId);
  }

  // ─── Principals ───────────────────────────────────────────────────────────

  async getPrincipal(principalId: string): Promise<PrincipalRecord | null> {
    const res = await this.q<PrincipalRecord>(
      "SELECT * FROM principals WHERE principal_id = $1",
      [principalId]
    );
    return res.rows[0] ?? null;
  }

  async listPrincipals(requestorId: string): Promise<PrincipalRecord[]> {
    // Owners see all principals; others see only themselves + agents they issued
    const res = await this.q<PrincipalRecord>(`
      SELECT p.* FROM principals p
      WHERE p.disabled_at IS NULL
        AND (
          EXISTS (SELECT 1 FROM principals o WHERE o.principal_id = $1 AND o.principal_type = 'owner')
          OR p.principal_id = $1
          OR EXISTS (SELECT 1 FROM api_keys k WHERE k.issued_by = $1 AND k.principal_id = p.principal_id)
        )
      ORDER BY p.created_at
    `, [requestorId]);
    return res.rows;
  }

  // ─── API Keys ─────────────────────────────────────────────────────────────

  // pg doesn't auto-parse custom enum arrays — coerce to string[] if needed
  private parseKeyRow(row: ApiKeyRecord): ApiKeyRecord {
    return {
      ...row,
      permissions: Array.isArray(row.permissions)
        ? row.permissions
        : String(row.permissions).replace(/^{|}$/g, "").split(",").filter(Boolean),
      spaceIds: Array.isArray(row.spaceIds)
        ? row.spaceIds
        : String(row.spaceIds).replace(/^{|}$/g, "").split(",").filter(Boolean),
    };
  }

  async getApiKey(hash: string): Promise<ApiKeyRecord | null> {
    const res = await this.q<ApiKeyRecord>(
      "SELECT * FROM api_keys WHERE key_hash = $1",
      [hash]
    );
    return res.rows[0] ? this.parseKeyRow(res.rows[0]) : null;
  }

  async touchApiKey(keyId: string): Promise<void> {
    await this.q(
      "UPDATE api_keys SET last_used_at = NOW() WHERE key_id = $1",
      [keyId]
    );
  }

  async issueApiKey(key: Omit<ApiKeyRecord, "issuedAt" | "lastUsedAt">): Promise<ApiKeyRecord> {
    const res = await this.q<ApiKeyRecord>(`
      INSERT INTO api_keys
        (key_id, key_hash, key_prefix, principal_id, name, space_ids, permissions, issued_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::permission[], $8, $9)
      RETURNING *
    `, [key.keyId, key.keyHash, key.keyPrefix, key.principalId, key.name,
        key.spaceIds, key.permissions, key.issuedBy, key.expiresAt ?? null]);
    return this.parseKeyRow(res.rows[0]);
  }

  async revokeApiKey(keyId: string, requestorId: string): Promise<void> {
    await this.q(
      "UPDATE api_keys SET revoked_at = NOW() WHERE key_id = $1 AND issued_by = $2",
      [keyId, requestorId]
    );
  }

  async listApiKeys(issuerId: string): Promise<ApiKeyRecord[]> {
    const res = await this.q<ApiKeyRecord>(
      "SELECT * FROM api_keys WHERE issued_by = $1 AND revoked_at IS NULL ORDER BY issued_at DESC",
      [issuerId]
    );
    return res.rows.map(r => this.parseKeyRow(r));
  }

  async createAgentPrincipal(name: string): Promise<PrincipalRecord> {
    const res = await this.q<PrincipalRecord>(`
      INSERT INTO principals (principal_type, name) VALUES ('agent', $1) RETURNING *
    `, [name]);
    return res.rows[0];
  }

  async hasOwner(): Promise<boolean> {
    const res = await this.q<{ hasOwner: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM principals WHERE principal_type = 'owner') AS has_owner"
    );
    return res.rows[0]?.hasOwner ?? false;
  }

  async createOwnerPrincipal(name: string, displayName?: string): Promise<PrincipalRecord> {
    const res = await this.q<PrincipalRecord>(`
      INSERT INTO principals (principal_type, name, display_name)
      VALUES ('owner', $1, $2) RETURNING *
    `, [name, displayName ?? null]);
    return res.rows[0];
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────

  async getOAuthToken(hash: string): Promise<OAuthTokenRecord | null> {
    const res = await this.q<OAuthTokenRecord>(
      "SELECT * FROM oauth_tokens WHERE token_hash = $1",
      [hash]
    );
    return res.rows[0] ?? null;
  }

  // ─── Memory entries ───────────────────────────────────────────────────────

  async read(
    spaceId: string, query: string, principalId: string, limit = 20
  ): Promise<MemoryEntry[]> {
    const res = await this.q<MemoryEntry>(`
      SELECT * FROM memory_entries
      WHERE space_id = $1
        AND archived_at IS NULL
        AND ($2 = '' OR to_tsvector('english', content) @@ plainto_tsquery('english', $2))
      ORDER BY importance_score DESC, created_at DESC
      LIMIT $3
    `, [spaceId, query, limit]);
    return res.rows;
  }

  async write(spaceId: string, entry: Partial<MemoryEntry> & { principalId: string; content: string }): Promise<string> {
    const res = await this.q<{ entryId: string }>(`
      INSERT INTO memory_entries
        (space_id, principal_id, content, summary, entry_type, importance_score,
         tags, kg_nodes, model, agent_name, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING entry_id
    `, [
      spaceId, entry.principalId, entry.content, entry.summary ?? null,
      entry.entryType ?? "semantic", entry.importanceScore ?? 0.5,
      entry.tags ?? [], entry.kgNodes ?? [],
      entry.model ?? null, entry.agentName ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ]);
    return res.rows[0].entryId;
  }

  async vectorSearch(spaceId: string, embedding: number[], k = 10): Promise<MemoryEntry[]> {
    const vectorStr = `[${embedding.join(",")}]`;
    const res = await this.q<MemoryEntry>(`
      SELECT *, (embedding <=> $1::vector) AS distance
      FROM memory_entries
      WHERE space_id = $2
        AND archived_at IS NULL
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [vectorStr, spaceId, k]);
    return res.rows;
  }

  async saveChunks(entryId: string, chunks: Array<{
    index: number; content: string; tokenEst: number; embedding: number[];
  }>): Promise<void> {
    for (const chunk of chunks) {
      const vectorStr = `[${chunk.embedding.join(",")}]`;
      await this.q(`
        INSERT INTO memory_chunks (entry_id, chunk_index, content, token_est, embedding)
        VALUES ($1, $2, $3, $4, $5::vector)
        ON CONFLICT (entry_id, chunk_index) DO UPDATE
          SET content = EXCLUDED.content, token_est = EXCLUDED.token_est,
              embedding = EXCLUDED.embedding
      `, [entryId, chunk.index, chunk.content, chunk.tokenEst, vectorStr]);
    }
  }

  async vectorSearchChunks(spaceId: string, embedding: number[], k = 10): Promise<MemoryEntry[]> {
    const vectorStr = `[${embedding.join(",")}]`;
    // Search chunks, return deduplicated parent entries ordered by best chunk match
    const res = await this.q<MemoryEntry>(`
      SELECT DISTINCT ON (e.entry_id) e.*,
             (c.embedding <=> $1::vector) AS distance
      FROM memory_chunks c
      JOIN memory_entries e ON e.entry_id = c.entry_id
      WHERE e.space_id = $2
        AND e.archived_at IS NULL
        AND c.embedding IS NOT NULL
      ORDER BY e.entry_id, c.embedding <=> $1::vector
      LIMIT $3
    `, [vectorStr, spaceId, k]);
    return res.rows;
  }

  async updateEmbedding(entryId: string, embedding: number[], model: string, status: "complete" | "failed"): Promise<void> {
    if (status === "failed" || embedding.length === 0) {
      await this.q(
        "UPDATE memory_entries SET embedding_status = 'failed', updated_at = NOW() WHERE entry_id = $1",
        [entryId]
      );
      return;
    }
    const vectorStr = `[${embedding.join(",")}]`;
    await this.q(`
      UPDATE memory_entries
      SET embedding = $1::vector, embedding_model = $2, embedding_status = 'complete', updated_at = NOW()
      WHERE entry_id = $3
    `, [vectorStr, model, entryId]);
  }

  async getPendingEmbeddingEntries(limit: number): Promise<MemoryEntry[]> {
    const res = await this.q<MemoryEntry>(`
      SELECT * FROM memory_entries
      WHERE embedding_status = 'pending' AND archived_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [limit]);
    return res.rows;
  }

  // ─── Audit ────────────────────────────────────────────────────────────────

  async logAudit(entry: Record<string, unknown>): Promise<void> {
    await this.q(`
      INSERT INTO audit_log
        (action, principal_id, target_type, target_id, space_id, details, model, agent_name, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      entry.action, entry.principalId ?? null, entry.targetType ?? null,
      entry.targetId ?? null, entry.spaceId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.model ?? null, entry.agentName ?? null, entry.ipAddress ?? null,
    ]);
  }

  async readAuditLog(filters: {
    spaceId?: string; principalId?: string; action?: string;
    since?: string; limit?: number;
  }): Promise<unknown[]> {
    const conditions: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (filters.spaceId)     { conditions.push(`space_id = $${i++}`);      vals.push(filters.spaceId); }
    if (filters.principalId) { conditions.push(`principal_id = $${i++}`);  vals.push(filters.principalId); }
    if (filters.action)      { conditions.push(`action = $${i++}`);        vals.push(filters.action); }
    if (filters.since)       { conditions.push(`logged_at >= $${i++}`);    vals.push(filters.since); }
    vals.push(filters.limit ?? 100);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.q(`
      SELECT * FROM audit_log ${where} ORDER BY logged_at DESC LIMIT $${i}
    `, vals);
    return res.rows;
  }

  // ─── Maintenance ──────────────────────────────────────────────────────────

  async countPendingEmbeddings(): Promise<number> {
    const res = await this.q<{ n: string }>(
      "SELECT count(*) AS n FROM memory_entries WHERE embedding_status = 'pending' AND archived_at IS NULL"
    );
    return parseInt(res.rows[0]?.n ?? "0", 10);
  }

  async markStaleEmbeddingsFailed(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const res = await this.q<{ count: string }>(`
      WITH updated AS (
        UPDATE memory_entries
        SET embedding_status = 'failed', updated_at = NOW()
        WHERE embedding_status = 'pending'
          AND created_at < $1
        RETURNING entry_id
      )
      SELECT count(*)::text AS count FROM updated
    `, [cutoff]);
    return parseInt(res.rows[0]?.count ?? "0", 10);
  }

  async countExpiredKeys(): Promise<number> {
    const res = await this.q<{ n: string }>(
      "SELECT count(*) AS n FROM api_keys WHERE expires_at < NOW() AND revoked_at IS NULL"
    );
    return parseInt(res.rows[0]?.n ?? "0", 10);
  }
}

export function createPostgresAdapter(): PostgresAdapter {
  return new PostgresAdapter(
    process.env.POSTGRES_URL ?? "postgresql://exobrain:changeme@localhost:5432/exobrain"
  );
}
