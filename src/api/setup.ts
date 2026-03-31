import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { jsonResponse, readBody } from "./middleware.js";
import { generateApiKey, hashPassword } from "../auth.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerSetupRoutes(
  register: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => void,
  db: DbAdapter
): void {
  register("POST", "/api/setup", async (req, res) => {
    // Idempotency check first — before reading body or validating secret
    if (await db.hasOwner()) {
      jsonResponse(res, 409, { error: "Already initialized" });
      return;
    }

    let body: { secret?: string; ownerName?: string; keyName?: string; username?: string; email?: string; password?: string };
    try {
      body = await readBody(req);
    } catch {
      jsonResponse(res, 400, { error: "Invalid JSON body" });
      return;
    }

    const expected = process.env.REGISTRATION_SECRET;
    if (!expected || expected === "changeme-replace-with-random-secret") {
      jsonResponse(res, 503, { error: "REGISTRATION_SECRET not configured — set it in .env before running setup" });
      return;
    }
    if (!body.secret || body.secret !== expected) {
      jsonResponse(res, 403, { error: "Invalid registration secret" });
      return;
    }

    // Validate credentials before any writes (atomicity)
    if (body.password && body.password.length < 8) {
      jsonResponse(res, 400, { error: "Password must be at least 8 characters" });
      return;
    }

    const ownerName = (body.ownerName ?? "Owner").trim() || "Owner";
    const owner = await db.createOwnerPrincipal(ownerName);

    // Optional: set username/email/password at setup time
    if (body.username || body.email || body.password) {
      const credUpdates: Parameters<typeof db.updateCredentials>[1] = {};
      if (body.username) credUpdates.username    = body.username.trim();
      if (body.email)    credUpdates.email       = body.email.trim();
      if (body.password) credUpdates.passwordHash = await hashPassword(body.password);
      await db.updateCredentials(owner.principalId, credUpdates);
    }

    const { raw, hash, prefix } = generateApiKey();
    const keyId = randomUUID();
    await db.issueApiKey({
      keyId,
      keyHash: hash,
      keyPrefix: prefix,
      principalId: owner.principalId,
      name: (body.keyName ?? "Admin Key").trim() || "Admin Key",
      spaceIds: [],
      permissions: ["read", "list", "write", "delete", "manage", "admin"],
      issuedBy: owner.principalId,
      expiresAt: null,
    });

    await db.logAudit({
      action: "owner_bootstrap",
      principalId: owner.principalId,
      details: { ownerName, keyName: body.keyName },
    });

    jsonResponse(res, 201, {
      principalId: owner.principalId,
      ownerName: owner.name,
      keyId,
      keyPrefix: prefix,
      apiKey: raw,
    });
  });
}
