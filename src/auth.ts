import { createHash } from "node:crypto";
import type { Principal } from "./context.js";

// Lazy-loaded db adapter reference (set during server init)
let _getDb: (() => import("./adapters/db/types.js").DbAdapter) | null = null;

export function setDbResolver(fn: () => import("./adapters/db/types.js").DbAdapter) {
  _getDb = fn;
}

function db() {
  if (!_getDb) throw new Error("DB resolver not set");
  return _getDb();
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = "exb_" + Buffer.from(bytes).toString("base64url");
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

export async function verifyRequest(
  authHeader: string | undefined
): Promise<Principal | null> {
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  const hash = hashToken(token);

  // Try API key first (exb_ prefix)
  if (token.startsWith("exb_")) {
    return resolveApiKey(hash);
  }

  // Otherwise treat as OAuth token
  return resolveOAuthToken(hash);
}

async function resolveApiKey(hash: string): Promise<Principal | null> {
  const key = await db().getApiKey(hash);
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

  await db().touchApiKey(key.keyId);

  return {
    principalId: key.principalId,
    principalType: "agent",
    name: key.name,
    allowedSpaces: key.spaceIds,
    permissions: key.permissions,
  };
}

async function resolveOAuthToken(hash: string): Promise<Principal | null> {
  const token = await db().getOAuthToken(hash);
  if (!token) return null;
  if (token.revokedAt) return null;
  if (new Date(token.expiresAt) < new Date()) return null;

  const principal = await db().getPrincipal(token.principalId);
  if (!principal || principal.disabledAt) return null;

  // OAuth users get access to all their explicitly granted spaces
  const aclSpaces = await db().getPrincipalSpaces(token.principalId);

  return {
    principalId: principal.principalId,
    principalType: principal.principalType as Principal["principalType"],
    name: principal.name,
    allowedSpaces: aclSpaces,
    permissions: token.scopes,
  };
}
