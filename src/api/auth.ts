import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonResponse, readBody, requireAuth } from "./middleware.js";
import {
  hashPassword, verifyPassword,
  generateSessionToken, hashToken,
} from "../auth.js";
import type { DbAdapter } from "../adapters/db/types.js";

// Default session lifetime: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

type LoginAttemptState = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function loginAttemptKey(req: IncomingMessage, username: string): string {
  return `${clientAddress(req)}:${username.toLowerCase()}`;
}

function currentLoginBlock(req: IncomingMessage, username: string): number {
  const now = Date.now();
  const state = loginAttempts.get(loginAttemptKey(req, username));
  if (!state) return 0;
  if (state.blockedUntil <= now) {
    loginAttempts.delete(loginAttemptKey(req, username));
    return 0;
  }
  return state.blockedUntil - now;
}

function recordLoginFailure(req: IncomingMessage, username: string): number {
  const key = loginAttemptKey(req, username);
  const now = Date.now();
  const state = loginAttempts.get(key);

  if (!state || now - state.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: 0,
    });
    return 0;
  }

  state.count += 1;
  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    state.blockedUntil = now + LOGIN_WINDOW_MS;
  }
  loginAttempts.set(key, state);
  return state.blockedUntil > now ? state.blockedUntil - now : 0;
}

function clearLoginFailures(req: IncomingMessage, username: string): void {
  loginAttempts.delete(loginAttemptKey(req, username));
}

export function registerAuthRoutes(
  register: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>) => void,
  db: DbAdapter
): void {

  // ── POST /api/auth/login ──────────────────────────────────────────────────
  // Exchange username + password for a session token.

  register("POST", "/api/auth/login", async (req, res) => {
    let body: { username?: string; password?: string };
    try {
      body = await readBody(req);
    } catch {
      jsonResponse(res, 400, { error: "Invalid JSON body" });
      return;
    }

    if (!body.username || !body.password) {
      jsonResponse(res, 400, { error: "username and password are required" });
      return;
    }

    const blockedMs = currentLoginBlock(req, body.username);
    if (blockedMs > 0) {
      jsonResponse(res, 429, {
        error: "Too many login attempts. Try again later.",
        retryAfterSeconds: Math.ceil(blockedMs / 1000),
      });
      return;
    }

    const principal = await db.getPrincipalByUsername(body.username);

    // Always run verifyPassword (even on miss) to avoid timing oracle
    const storedHash = principal?.passwordHash ?? "x:x";
    const ok = await verifyPassword(body.password, storedHash);

    if (!principal || !ok) {
      const blockedAfterFailureMs = recordLoginFailure(req, body.username);
      await db.logAudit({
        action: "auth_failure",
        details: {
          method: "password",
          username: body.username,
          blockedAfterFailureMs,
        },
      });
      jsonResponse(res, blockedAfterFailureMs > 0 ? 429 : 401, {
        error: blockedAfterFailureMs > 0
          ? "Too many login attempts. Try again later."
          : "Invalid username or password",
        retryAfterSeconds: blockedAfterFailureMs > 0
          ? Math.ceil(blockedAfterFailureMs / 1000)
          : undefined,
      });
      return;
    }

    if (principal.disabledAt) {
      jsonResponse(res, 403, { error: "Account is disabled" });
      return;
    }

    clearLoginFailures(req, body.username);

    const { raw, hash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await db.createSession!(hash, principal.principalId, expiresAt);

    await db.logAudit({
      action: "auth_success",
      principalId: principal.principalId,
      details: { method: "password" },
    });

    jsonResponse(res, 200, {
      sessionToken: raw,
      expiresAt,
      principalId: principal.principalId,
      principalType: principal.principalType,
      name: principal.displayName ?? principal.name,
      username: principal.username,
    });
  });

  // ── POST /api/auth/logout ─────────────────────────────────────────────────

  register("POST", "/api/auth/logout", async (req, res) => {
    const auth = req.headers.authorization;
    if (auth) {
      const [, token] = auth.split(" ");
      if (token?.startsWith("exbs_")) {
        await db.revokeSession!(hashToken(token));
      }
    }
    await db.logAudit({ action: "auth_logout" });
    jsonResponse(res, 200, { ok: true });
  });

  // ── GET /api/auth/me ──────────────────────────────────────────────────────

  register("GET", "/api/auth/me", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    const record = await db.getPrincipal(principal.principalId);
    if (!record) { jsonResponse(res, 404, { error: "Principal not found" }); return; }

    jsonResponse(res, 200, {
      principalId: record.principalId,
      principalType: record.principalType,
      name: record.name,
      displayName: record.displayName,
      username: record.username,
      email: record.email,
      hasPassword: !!record.passwordHash,
      createdAt: record.createdAt,
    });
  });

  // ── PATCH /api/auth/me ────────────────────────────────────────────────────
  // Update display name, username, email, or password.
  // Changing password requires currentPassword (unless no password is set yet).

  register("PATCH", "/api/auth/me", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    let body: {
      displayName?: string;
      username?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };
    try {
      body = await readBody(req);
    } catch {
      jsonResponse(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const record = await db.getPrincipal(principal.principalId);
    if (!record) { jsonResponse(res, 404, { error: "Principal not found" }); return; }

    const updates: Parameters<typeof db.updateCredentials>[1] = {};

    if ("displayName" in body) updates.displayName = body.displayName?.trim() || null;
    if ("username"    in body) updates.username    = body.username?.trim()    || null;
    if ("email"       in body) updates.email       = body.email?.trim()       || null;

    if ("newPassword" in body) {
      if (!body.newPassword || body.newPassword.length < 8) {
        jsonResponse(res, 400, { error: "New password must be at least 8 characters" });
        return;
      }

      // Require current password if one is already set
      if (record.passwordHash) {
        if (!body.currentPassword) {
          jsonResponse(res, 400, { error: "currentPassword is required to change your password" });
          return;
        }
        const ok = await verifyPassword(body.currentPassword, record.passwordHash);
        if (!ok) {
          jsonResponse(res, 403, { error: "Incorrect current password" });
          return;
        }
      }

      updates.passwordHash = await hashPassword(body.newPassword);
    }

    if (Object.keys(updates).length === 0) {
      jsonResponse(res, 400, { error: "No fields to update" });
      return;
    }

    const updated = await db.updateCredentials(principal.principalId, updates);

    await db.logAudit({
      action: "credentials_update",
      principalId: principal.principalId,
      details: {
        fields: Object.keys(updates).filter(k => k !== "passwordHash"),
        passwordChanged: "passwordHash" in updates,
      },
    });

    jsonResponse(res, 200, {
      principalId: updated.principalId,
      name: updated.name,
      displayName: updated.displayName,
      username: updated.username,
      email: updated.email,
      hasPassword: !!updated.passwordHash,
    });
  });
}
