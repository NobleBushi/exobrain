import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getPrincipal } from "../context.js";
import { generateApiKey } from "../auth.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerKeyTools(server: McpServer, db: DbAdapter) {

  // ── principal_list ────────────────────────────────────────────────────────
  server.tool(
    "principal_list",
    "List principals visible to the caller. Owners see all principals. Others see themselves and any agent principals they issued.",
    {},
    async () => {
      const principal = getPrincipal();
      const principals = await db.listPrincipals(principal.principalId);
      // Never return password hashes
      const safe = principals.map(({ ...p }) => {
        // @ts-expect-error removing sensitive field
        delete p.passwordHash;
        return p;
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(safe, null, 2) }] };
    }
  );

  // ── key_issue ─────────────────────────────────────────────────────────────
  server.tool(
    "key_issue",
    "Issue a scoped API key for an agent. The key is shown ONCE and cannot be retrieved again. Scopes are limited to the issuer's own permissions — you cannot grant more than you hold.",
    {
      agent_name:  z.string().describe("Human-readable name for this agent/key (e.g. 'Cecil / NanoClaw')"),
      space_ids:   z.array(z.string()).describe("Space IDs this key can access — must be a subset of your own accessible spaces"),
      permissions: z.array(z.enum(["read", "list", "write", "delete", "manage", "admin"]))
                    .describe("Permissions to grant — must be a subset of your own permissions"),
      expires_at:  z.string().optional().describe("ISO 8601 expiry timestamp (optional)"),
    },
    async ({ agent_name, space_ids, permissions, expires_at }) => {
      const issuer = getPrincipal();

      // Validate: key can only grant spaces the issuer can access
      const issuerSpaces = issuer.allowedSpaces.length > 0
        ? issuer.allowedSpaces
        : await db.getPrincipalSpaces(issuer.principalId);

      const invalidSpaces = space_ids.filter(s => !issuerSpaces.includes(s));
      if (invalidSpaces.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Cannot grant access to spaces you don't hold: ${invalidSpaces.join(", ")}` }],
          isError: true,
        };
      }

      // Create agent principal for this key
      const agentPrincipal = await db.createAgentPrincipal(agent_name);

      // Generate the key
      const { raw, hash, prefix } = generateApiKey();
      const keyId = randomUUID();

      await db.issueApiKey({
        keyId, keyHash: hash, keyPrefix: prefix,
        principalId: agentPrincipal.principalId,
        name: agent_name,
        spaceIds: space_ids,
        permissions,
        issuedBy: issuer.principalId,
        expiresAt: expires_at ?? null,
      });

      await db.logAudit({
        action: "key_issue", principalId: issuer.principalId,
        targetType: "key", targetId: keyId,
        details: { agent_name, space_ids, permissions, expires_at },
      });

      return {
        content: [{
          type: "text" as const,
          text: [
            `✓ API key issued for '${agent_name}'`,
            ``,
            `Key (shown once — save this now):`,
            `  ${raw}`,
            ``,
            `Key ID:    ${keyId}`,
            `Prefix:    ${prefix}`,
            `Spaces:    ${space_ids.join(", ")}`,
            `Permissions: ${permissions.join(", ")}`,
            expires_at ? `Expires:   ${expires_at}` : `Expires:   never`,
            ``,
            `Use as: Authorization: Bearer ${raw}`,
          ].join("\n"),
        }],
      };
    }
  );

  // ── key_revoke ────────────────────────────────────────────────────────────
  server.tool(
    "key_revoke",
    "Revoke an API key immediately. The key will be rejected on all subsequent requests. Only the issuer or an owner can revoke a key.",
    {
      key_id:  z.string().describe("Key ID to revoke (from key_list or key_issue output)"),
      reason:  z.string().optional().describe("Reason for revocation (logged in audit trail)"),
    },
    async ({ key_id, reason }) => {
      const principal = getPrincipal();

      await db.revokeApiKey(key_id, principal.principalId);

      await db.logAudit({
        action: "key_revoke", principalId: principal.principalId,
        targetType: "key", targetId: key_id,
        details: { reason },
      });

      return { content: [{ type: "text" as const, text: `✓ Key ${key_id} revoked.` }] };
    }
  );

  // ── key_list ──────────────────────────────────────────────────────────────
  server.tool(
    "key_list",
    "List active API keys issued by the calling principal. Key values are never returned — only metadata.",
    {},
    async () => {
      const principal = getPrincipal();
      const keys = await db.listApiKeys(principal.principalId);

      // Strip key hashes — only return safe metadata
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

      return { content: [{ type: "text" as const, text: JSON.stringify(safe, null, 2) }] };
    }
  );
}
