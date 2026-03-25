import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DbAdapter, Space, ApiKeyRecord, OAuthTokenRecord, PrincipalRecord, MemoryEntry } from "./types.js";

export class SqliteAdapter implements DbAdapter {
  private db: Database.Database | null = null;

  constructor(private path: string) {}

  async connect(): Promise<void> {
    const dir = this.path.split("/").slice(0, -1).join("/");
    if (dir) mkdirSync(dir, { recursive: true });
    this.db = new Database(this.path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    console.log(`✓ SQLite connected (${this.path})`);
  }

  async disconnect(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private get(): Database.Database {
    if (!this.db) throw new Error("SQLite not connected");
    return this.db;
  }

  // ─── Spaces ──────────────────────────────────────────────────────────────

  async listSpaces(principalId: string): Promise<Space[]> {
    const isOwner = this.get()
      .prepare("SELECT 1 FROM principals WHERE principal_id = ? AND principal_type = 'owner'")
      .get(principalId);

    if (isOwner) {
      return this.get()
        .prepare("SELECT * FROM spaces WHERE archived_at IS NULL ORDER BY space_id")
        .all() as Space[];
    }

    return this.get().prepare(`
      SELECT DISTINCT s.* FROM spaces s
      LEFT JOIN acl_entries a ON a.space_id = s.space_id AND a.principal_id = ?
      LEFT JOIN space_acl_templates t ON t.space_type = s.space_type
        AND t.principal_class IN ('authenticated', 'everyone')
      WHERE s.archived_at IS NULL
        AND (a.permissions NOT IN ('[]','') OR t.principal_class IS NOT NULL)
      ORDER BY s.space_id
    `).all(principalId) as Space[];
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    return (this.get()
      .prepare("SELECT * FROM spaces WHERE space_id = ?")
      .get(spaceId) as Space) ?? null;
  }

  async createSpace(space: Omit<Space, "createdAt" | "updatedAt">): Promise<Space> {
    this.get().prepare(`
      INSERT INTO spaces (space_id, name, description, space_type, sensitivity_tier, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(space.spaceId, space.name, space.description, space.spaceType,
           space.sensitivityTier ?? 2, JSON.stringify(space.metadata ?? {}));
    return this.getSpace(space.spaceId) as Promise<Space>;
  }

  async updateSpace(spaceId: string, updates: Partial<Space>): Promise<Space> {
    const sets: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
    const vals: unknown[] = [];
    if (updates.name)        { sets.push("name = ?");        vals.push(updates.name); }
    if (updates.description) { sets.push("description = ?"); vals.push(updates.description); }
    if (updates.spaceType)   { sets.push("space_type = ?");  vals.push(updates.spaceType); }
    vals.push(spaceId);
    this.get().prepare(`UPDATE spaces SET ${sets.join(", ")} WHERE space_id = ?`).run(...vals);
    return (await this.getSpace(spaceId))!;
  }

  async archiveSpace(spaceId: string): Promise<void> {
    this.get().prepare(
      "UPDATE spaces SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE space_id = ?"
    ).run(spaceId);
  }

  // ─── Permission checking ──────────────────────────────────────────────────

  async hasPermission(principalId: string, spaceId: string, permission: string): Promise<boolean> {
    const isOwner = this.get()
      .prepare("SELECT 1 FROM principals WHERE principal_id = ? AND principal_type = 'owner'")
      .get(principalId);
    if (isOwner) return true;

    // Check explicit ACL
    const acl = this.get()
      .prepare("SELECT permissions FROM acl_entries WHERE principal_id = ? AND space_id = ?")
      .get(principalId, spaceId) as { permissions: string } | undefined;
    if (acl) {
      const perms = JSON.parse(acl.permissions) as string[];
      if (perms.includes(permission)) return true;
      if (perms.length === 0) return false; // explicit deny
    }

    // Check template for 'authenticated'
    const space = await this.getSpace(spaceId);
    if (!space) return false;
    const tmpl = this.get().prepare(
      "SELECT permissions FROM space_acl_templates WHERE space_type = ? AND principal_class = 'authenticated'"
    ).get(space.spaceType) as { permissions: string } | undefined;
    if (tmpl) {
      const perms = JSON.parse(tmpl.permissions) as string[];
      return perms.includes(permission);
    }

    return false;
  }

  async getPrincipalSpaces(principalId: string): Promise<string[]> {
    const spaces = await this.listSpaces(principalId);
    return spaces.map(s => s.spaceId);
  }

  // ─── Principals ───────────────────────────────────────────────────────────

  async getPrincipal(principalId: string): Promise<PrincipalRecord | null> {
    return (this.get()
      .prepare("SELECT * FROM principals WHERE principal_id = ?")
      .get(principalId) as PrincipalRecord) ?? null;
  }

  async listPrincipals(requestorId: string): Promise<PrincipalRecord[]> {
    const isOwner = this.get()
      .prepare("SELECT 1 FROM principals WHERE principal_id = ? AND principal_type = 'owner'")
      .get(requestorId);
    if (isOwner) {
      return this.get()
        .prepare("SELECT * FROM principals WHERE disabled_at IS NULL ORDER BY created_at")
        .all() as PrincipalRecord[];
    }
    return this.get().prepare(`
      SELECT p.* FROM principals p
      WHERE p.disabled_at IS NULL
        AND (p.principal_id = ?
          OR EXISTS (SELECT 1 FROM api_keys k WHERE k.issued_by = ? AND k.principal_id = p.principal_id))
      ORDER BY p.created_at
    `).all(requestorId, requestorId) as PrincipalRecord[];
  }

  async createAgentPrincipal(name: string): Promise<PrincipalRecord> {
    const id = randomUUID();
    this.get().prepare(
      "INSERT INTO principals (principal_id, principal_type, name) VALUES (?, 'agent', ?)"
    ).run(id, name);
    return (await this.getPrincipal(id))!;
  }

  async hasOwner(): Promise<boolean> {
    const row = this.get()
      .prepare("SELECT 1 FROM principals WHERE principal_type = 'owner' LIMIT 1")
      .get();
    return row !== undefined;
  }

  async createOwnerPrincipal(name: string, displayName?: string): Promise<PrincipalRecord> {
    const id = randomUUID();
    this.get().prepare(
      "INSERT INTO principals (principal_id, principal_type, name, display_name) VALUES (?, 'owner', ?, ?)"
    ).run(id, name, displayName ?? null);
    return (await this.getPrincipal(id))!;
  }

  // ─── API Keys ─────────────────────────────────────────────────────────────

  async getApiKey(hash: string): Promise<ApiKeyRecord | null> {
    const row = this.get()
      .prepare("SELECT * FROM api_keys WHERE key_hash = ?")
      .get(hash) as (ApiKeyRecord & { space_ids: string; permissions: string }) | undefined;
    if (!row) return null;
    return {
      ...row,
      spaceIds: JSON.parse(row.space_ids as unknown as string),
      permissions: JSON.parse(row.permissions as unknown as string),
    };
  }

  async touchApiKey(keyId: string): Promise<void> {
    this.get().prepare(
      "UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ?"
    ).run(keyId);
  }

  async issueApiKey(key: Omit<ApiKeyRecord, "issuedAt" | "lastUsedAt">): Promise<ApiKeyRecord> {
    this.get().prepare(`
      INSERT INTO api_keys
        (key_id, key_hash, key_prefix, principal_id, name, space_ids, permissions, issued_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(key.keyId, key.keyHash, key.keyPrefix, key.principalId, key.name,
           JSON.stringify(key.spaceIds), JSON.stringify(key.permissions),
           key.issuedBy, key.expiresAt ?? null);
    return (await this.getApiKey(key.keyHash))!;
  }

  async revokeApiKey(keyId: string, requestorId: string): Promise<void> {
    this.get().prepare(
      "UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key_id = ? AND issued_by = ?"
    ).run(keyId, requestorId);
  }

  async listApiKeys(issuerId: string): Promise<ApiKeyRecord[]> {
    const rows = this.get().prepare(
      "SELECT * FROM api_keys WHERE issued_by = ? AND revoked_at IS NULL ORDER BY issued_at DESC"
    ).all(issuerId) as (ApiKeyRecord & { space_ids: string; permissions: string })[];
    return rows.map(r => ({
      ...r,
      spaceIds: JSON.parse(r.space_ids as unknown as string),
      permissions: JSON.parse(r.permissions as unknown as string),
    }));
  }

  // ─── OAuth ────────────────────────────────────────────────────────────────

  async getOAuthToken(hash: string): Promise<OAuthTokenRecord | null> {
    const row = this.get()
      .prepare("SELECT * FROM oauth_tokens WHERE token_hash = ?")
      .get(hash) as (OAuthTokenRecord & { scopes: string }) | undefined;
    if (!row) return null;
    return { ...row, scopes: JSON.parse(row.scopes as unknown as string) };
  }

  // ─── Memory entries ───────────────────────────────────────────────────────

  async read(spaceId: string, query: string, _principalId: string, limit = 20): Promise<MemoryEntry[]> {
    if (query) {
      return this.get().prepare(`
        SELECT * FROM memory_entries
        WHERE space_id = ? AND archived_at IS NULL
          AND content LIKE ?
        ORDER BY importance_score DESC, created_at DESC LIMIT ?
      `).all(spaceId, `%${query}%`, limit) as MemoryEntry[];
    }
    return this.get().prepare(`
      SELECT * FROM memory_entries
      WHERE space_id = ? AND archived_at IS NULL
      ORDER BY importance_score DESC, created_at DESC LIMIT ?
    `).all(spaceId, limit) as MemoryEntry[];
  }

  async write(spaceId: string, entry: Partial<MemoryEntry> & { principalId: string; content: string }): Promise<string> {
    const id = randomUUID();
    this.get().prepare(`
      INSERT INTO memory_entries
        (entry_id, space_id, principal_id, content, summary, entry_type, importance_score,
         tags, kg_nodes, model, agent_name, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, spaceId, entry.principalId, entry.content, entry.summary ?? null,
           entry.entryType ?? "semantic", entry.importanceScore ?? 0.5,
           JSON.stringify(entry.tags ?? []), JSON.stringify(entry.kgNodes ?? []),
           entry.model ?? null, entry.agentName ?? null,
           JSON.stringify(entry.metadata ?? {}));
    return id;
  }

  async vectorSearch(_spaceId: string, _embedding: number[], _k = 10): Promise<MemoryEntry[]> {
    // sqlite-vec virtual table must be loaded at runtime and requires extension setup
    // Falls back to recency-sorted results when vector search is unavailable
    return [];
  }

  // ─── Audit ────────────────────────────────────────────────────────────────

  async logAudit(entry: Record<string, unknown>): Promise<void> {
    const id = randomUUID();
    this.get().prepare(`
      INSERT INTO audit_log
        (audit_id, action, principal_id, target_type, target_id, space_id,
         details, model, agent_name, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entry.action, entry.principalId ?? null, entry.targetType ?? null,
           entry.targetId ?? null, entry.spaceId ?? null,
           entry.details ? JSON.stringify(entry.details) : null,
           entry.model ?? null, entry.agentName ?? null, entry.ipAddress ?? null);
  }

  async readAuditLog(filters: {
    spaceId?: string; principalId?: string; action?: string;
    since?: string; limit?: number;
  }): Promise<unknown[]> {
    const conditions: string[] = [];
    const vals: unknown[] = [];
    if (filters.spaceId)     { conditions.push("space_id = ?");     vals.push(filters.spaceId); }
    if (filters.principalId) { conditions.push("principal_id = ?"); vals.push(filters.principalId); }
    if (filters.action)      { conditions.push("action = ?");       vals.push(filters.action); }
    if (filters.since)       { conditions.push("logged_at >= ?");   vals.push(filters.since); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    vals.push(filters.limit ?? 100);
    return this.get()
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY logged_at DESC LIMIT ?`)
      .all(...vals) as unknown[];
  }
}

export function createSqliteAdapter(): SqliteAdapter {
  return new SqliteAdapter(process.env.SQLITE_PATH ?? "./data/exobrain.db");
}
