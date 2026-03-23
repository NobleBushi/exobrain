export interface Space {
  spaceId: string;
  name: string;
  description: string;
  spaceType: "public" | "shared" | "private" | "project" | "isolated";
  sensitivityTier: number;
  createdAt: string;
  updatedAt: string;
}

export interface Principal {
  principalId: string;
  principalType: "owner" | "user" | "agent" | "group";
  name: string;
  createdAt: string;
}

export interface AclEntry {
  principalId: string;
  spaceId: string;
  permissions: string[]; // read, list, write, delete, manage, admin
  grantedBy: string;
  grantedAt: string;
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

  // Memory entries
  read(spaceId: string, query: string, limit?: number): Promise<unknown[]>;
  write(spaceId: string, entry: Record<string, unknown>): Promise<string>;
  vectorSearch(spaceId: string, embedding: number[], k?: number): Promise<unknown[]>;

  // Audit
  logAudit(entry: Record<string, unknown>): Promise<void>;
}
