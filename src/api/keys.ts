import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { jsonResponse, readBody, requireAuth } from "./middleware.js";
import { generateApiKey } from "../auth.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerKeyRoutes(
  register: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>) => void,
  db: DbAdapter
): void {
  // List keys issued by the caller
  register("GET", "/api/keys", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    const keys = await db.listApiKeys(principal.principalId);
    const safe = keys.map(k => ({
      keyId: k.keyId,
      prefix: k.keyPrefix,
      name: k.name,
      spaceIds: k.spaceIds,
      permissions: k.permissions,
      issuedAt: k.issuedAt,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
    }));
    jsonResponse(res, 200, safe);
  });

  // Issue a new key
  register("POST", "/api/keys", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    let body: { agentName?: string; spaceIds?: string[]; permissions?: string[]; expiresAt?: string };
    try {
      body = await readBody(req);
    } catch {
      jsonResponse(res, 400, { error: "Invalid JSON body" });
      return;
    }

    if (!body.agentName) {
      jsonResponse(res, 400, { error: "agentName is required" });
      return;
    }

    const issuerSpaces = principal.allowedSpaces.length > 0
      ? principal.allowedSpaces
      : await db.getPrincipalSpaces(principal.principalId);

    const spaceIds = body.spaceIds ?? [];
    const invalid = spaceIds.filter(s => issuerSpaces.length > 0 && !issuerSpaces.includes(s));
    if (invalid.length > 0) {
      jsonResponse(res, 403, { error: `Cannot grant spaces you don't hold: ${invalid.join(", ")}` });
      return;
    }

    const agentPrincipal = await db.createAgentPrincipal(body.agentName);
    const { raw, hash, prefix } = generateApiKey();
    const keyId = randomUUID();

    await db.issueApiKey({
      keyId,
      keyHash: hash,
      keyPrefix: prefix,
      principalId: agentPrincipal.principalId,
      name: body.agentName,
      spaceIds,
      permissions: body.permissions ?? ["read", "list"],
      issuedBy: principal.principalId,
      expiresAt: body.expiresAt ?? null,
    });

    await db.logAudit({
      action: "key_issue",
      principalId: principal.principalId,
      targetType: "key",
      targetId: keyId,
      details: { agentName: body.agentName, spaceIds, permissions: body.permissions },
    });

    jsonResponse(res, 201, {
      keyId,
      keyPrefix: prefix,
      name: body.agentName,
      apiKey: raw,
      spaceIds,
      permissions: body.permissions ?? ["read", "list"],
      expiresAt: body.expiresAt ?? null,
    });
  });

  // Revoke a key
  register("DELETE", "/api/keys/:id", async (req, res, params) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    await db.revokeApiKey(params.id, principal.principalId);
    await db.logAudit({
      action: "key_revoke",
      principalId: principal.principalId,
      targetType: "key",
      targetId: params.id,
    });
    jsonResponse(res, 200, { revoked: true, keyId: params.id });
  });
}
