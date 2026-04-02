export interface Space {
  spaceId: string;
  name: string;
  description: string;
  spaceType: "public" | "shared" | "private" | "project" | "isolated";
  sensitivityTier: number;
  metadata?: Record<string, unknown>;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrincipalRecord {
  principalId: string;
  principalType: "owner" | "user" | "agent" | "group";
  name: string;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
  passwordHash?: string | null;
  oauthProvider?: string | null;
  oauthSubject?: string | null;
  disabledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  sessionId: string;
  tokenHash: string;
  principalId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface ApiKeyRecord {
  keyId: string;
  keyHash: string;
  keyPrefix: string;
  principalId: string;
  name: string;
  spaceIds: string[];
  permissions: string[];
  issuedBy: string;
  issuedAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
}

export interface OAuthTokenRecord {
  tokenId: string;
  tokenHash: string;
  tokenType: string;
  clientId: string;
  principalId: string;
  scopes: string[];
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface MemoryEntry {
  entryId: string;
  spaceId: string;
  principalId: string;
  content: string;
  summary?: string | null;
  entryType: "semantic" | "procedural" | "episodic" | "correction";
  importanceScore: number;
  tags: string[];
  metadata?: Record<string, unknown>;
  model?: string | null;
  agentName?: string | null;
  embeddingModel?: string | null;
  embeddingStatus: "pending" | "complete" | "failed";
  kgNodes: string[];
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Spaces
  listSpaces(principalId: string): Promise<Space[]>;
  getSpace(spaceId: string): Promise<Space | null>;
  createSpace(space: Omit<Space, "createdAt" | "updatedAt">): Promise<Space>;
  updateSpace(spaceId: string, updates: Partial<Space>): Promise<Space>;
  archiveSpace(spaceId: string): Promise<void>;

  // Permissions
  hasPermission(principalId: string, spaceId: string, permission: string): Promise<boolean>;
  getPrincipalSpaces(principalId: string): Promise<string[]>;

  // Principals
  getPrincipal(principalId: string): Promise<PrincipalRecord | null>;
  getPrincipalByUsername(username: string): Promise<PrincipalRecord | null>;
  listPrincipals(requestorId: string): Promise<PrincipalRecord[]>;
  createAgentPrincipal(name: string): Promise<PrincipalRecord>;
  updateCredentials(principalId: string, updates: {
    username?: string | null;
    email?: string | null;
    passwordHash?: string | null;
    displayName?: string | null;
  }): Promise<PrincipalRecord>;

  // Sessions (password login)
  createSession?(tokenHash: string, principalId: string, expiresAt: string): Promise<SessionRecord>;
  getSession?(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession?(tokenHash: string): Promise<void>;

  // API keys
  getApiKey(hash: string): Promise<ApiKeyRecord | null>;
  touchApiKey(keyId: string): Promise<void>;
  issueApiKey(key: Omit<ApiKeyRecord, "issuedAt" | "lastUsedAt">): Promise<ApiKeyRecord>;
  revokeApiKey(keyId: string, requestorId: string): Promise<void>;
  listApiKeys(issuerId: string): Promise<ApiKeyRecord[]>;
  updateApiKey(keyId: string, requestorId: string, updates: { permissions?: string[]; spaceIds?: string[]; name?: string }): Promise<void>;

  // OAuth
  getOAuthToken(hash: string): Promise<OAuthTokenRecord | null>;

  // Memory entries
  read(spaceId: string, query: string, principalId: string, limit?: number): Promise<MemoryEntry[]>;
  write(spaceId: string, entry: Partial<MemoryEntry> & { principalId: string; content: string }): Promise<string>;
  vectorSearch(spaceId: string, embedding: number[], k?: number): Promise<MemoryEntry[]>;

  // Audit
  logAudit(entry: Record<string, unknown>): Promise<void>;
  readAuditLog(filters: {
    spaceId?: string; principalId?: string; action?: string;
    since?: string; limit?: number;
  }): Promise<unknown[]>;

  // Chunks (for long-entry chunked embeddings)
  saveChunks?(entryId: string, chunks: Array<{
    index: number; content: string; tokenEst: number; embedding: number[];
  }>): Promise<void>;
  vectorSearchChunks?(spaceId: string, embedding: number[], k?: number): Promise<MemoryEntry[]>;

  // Setup / bootstrap
  hasOwner(): Promise<boolean>;
  createOwnerPrincipal(name: string, displayName?: string): Promise<PrincipalRecord>;

  // Maintenance (optional — adapters implement where supported)
  countPendingEmbeddings?(): Promise<number>;
  markStaleEmbeddingsFailed?(olderThanMs: number): Promise<number>;
  countExpiredKeys?(): Promise<number>;
  getPendingEmbeddingEntries?(limit: number): Promise<MemoryEntry[]>;
  updateEmbedding?(entryId: string, embedding: number[], model: string, status: "complete" | "failed"): Promise<void>;
}
