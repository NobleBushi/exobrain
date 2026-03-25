import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Principal } from "./context.js";

function scryptDerive(password: string, salt: string, keyLen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, opts, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

// Lazy-loaded db adapter reference (set during server init)
let _getDb: (() => import("./adapters/db/types.js").DbAdapter) | null = null;

export function setDbResolver(fn: () => import("./adapters/db/types.js").DbAdapter) {
  _getDb = fn;
}

function db() {
  if (!_getDb) throw new Error("DB resolver not set");
  return _getDb();
}

// ── Token helpers ──────────────────────────────────────────────────────────

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(32);
  const raw = "exb_" + bytes.toString("base64url");
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

export function generateSessionToken(): { raw: string; hash: string } {
  const raw = "exbs_" + randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

// ── Password hashing (scrypt, no external deps) ────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN  = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptDerive(password, salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashed] = stored.split(":");
  if (!salt || !hashed) return false;
  try {
    const derived = await scryptDerive(password, salt, KEY_LEN, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
    });
    const hashedBuf = Buffer.from(hashed, "hex");
    if (derived.length !== hashedBuf.length) return false;
    return timingSafeEqual(derived, hashedBuf);
  } catch {
    return false;
  }
}

// ── Request verification ───────────────────────────────────────────────────

export async function verifyRequest(
  authHeader: string | undefined
): Promise<Principal | null> {
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  if (token.startsWith("exbs_")) {
    return resolveSession(hashToken(token));
  }

  if (token.startsWith("exb_")) {
    return resolveApiKey(hashToken(token));
  }

  // Fall through to OAuth token
  return resolveOAuthToken(hashToken(token));
}

async function resolveApiKey(hash: string): Promise<Principal | null> {
  const key = await db().getApiKey(hash);
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

  await db().touchApiKey(key.keyId);

  const principal = await db().getPrincipal(key.principalId);

  return {
    principalId: key.principalId,
    principalType: (principal?.principalType ?? "agent") as Principal["principalType"],
    name: key.name,
    allowedSpaces: key.spaceIds,
    permissions: key.permissions,
  };
}

async function resolveSession(hash: string): Promise<Principal | null> {
  const session = await db().getSession?.(hash);
  if (!session) return null;
  if (session.revokedAt) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  const principal = await db().getPrincipal(session.principalId);
  if (!principal || principal.disabledAt) return null;

  const spaces = await db().getPrincipalSpaces(principal.principalId);

  return {
    principalId: principal.principalId,
    principalType: principal.principalType as Principal["principalType"],
    name: principal.displayName ?? principal.name,
    allowedSpaces: spaces,
    permissions: ["read", "list", "write", "delete", "manage", "admin"],
  };
}

async function resolveOAuthToken(hash: string): Promise<Principal | null> {
  const token = await db().getOAuthToken(hash);
  if (!token) return null;
  if (token.revokedAt) return null;
  if (new Date(token.expiresAt) < new Date()) return null;

  const principal = await db().getPrincipal(token.principalId);
  if (!principal || principal.disabledAt) return null;

  const aclSpaces = await db().getPrincipalSpaces(token.principalId);

  return {
    principalId: principal.principalId,
    principalType: principal.principalType as Principal["principalType"],
    name: principal.name,
    allowedSpaces: aclSpaces,
    permissions: token.scopes,
  };
}
