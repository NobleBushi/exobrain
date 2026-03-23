import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPrincipal } from "../context.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerSpaceTools(server: McpServer, db: DbAdapter) {

  // ── space_list ────────────────────────────────────────────────────────────
  server.tool(
    "space_list",
    "List all spaces visible to the calling principal. Returns space metadata and type.",
    {},
    async () => {
      const principal = getPrincipal();
      const spaces = await db.listSpaces(principal.principalId);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(spaces, null, 2),
        }],
      };
    }
  );

  // ── space_get ─────────────────────────────────────────────────────────────
  server.tool(
    "space_get",
    "Get details of a single space including its ACL template permissions.",
    {
      space_id: z.string(),
    },
    async ({ space_id }) => {
      const principal = getPrincipal();
      const canRead = await db.hasPermission(principal.principalId, space_id, "read");
      if (!canRead) {
        return { content: [{ type: "text" as const, text: `Access denied to space '${space_id}'.` }], isError: true };
      }

      const space = await db.getSpace(space_id);
      if (!space) {
        return { content: [{ type: "text" as const, text: `Space '${space_id}' not found.` }], isError: true };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(space, null, 2) }] };
    }
  );

  // ── space_create ──────────────────────────────────────────────────────────
  server.tool(
    "space_create",
    "Create a new space. Requires 'manage' permission (owner by default). space_type determines default ACL template.",
    {
      space_id:        z.string().regex(/^[a-z0-9_-]+$/, "space_id must be lowercase alphanumeric with hyphens/underscores"),
      name:            z.string(),
      description:     z.string().optional().default(""),
      space_type:      z.enum(["public", "shared", "private", "project", "isolated"]).optional().default("private"),
      sensitivity_tier: z.number().int().min(0).max(4).optional().default(2),
    },
    async ({ space_id, name, description, space_type, sensitivity_tier }) => {
      const principal = getPrincipal();

      // Only owners can create spaces by default (or those with admin permission)
      const canManage = principal.principalType === "owner"
        || principal.permissions.includes("admin");

      if (!canManage) {
        return { content: [{ type: "text" as const, text: "Creating spaces requires owner or admin permission." }], isError: true };
      }

      const existing = await db.getSpace(space_id);
      if (existing) {
        return { content: [{ type: "text" as const, text: `Space '${space_id}' already exists.` }], isError: true };
      }

      const space = await db.createSpace({
        spaceId: space_id, name, description: description ?? "",
        spaceType: space_type, sensitivityTier: sensitivity_tier,
      });

      await db.logAudit({
        action: "space_create", principalId: principal.principalId,
        targetType: "space", targetId: space_id,
        details: { name, space_type, sensitivity_tier },
      });

      return { content: [{ type: "text" as const, text: `✓ Space '${space_id}' created.\n${JSON.stringify(space, null, 2)}` }] };
    }
  );

  // ── space_update ──────────────────────────────────────────────────────────
  server.tool(
    "space_update",
    "Update space metadata. Requires 'manage' permission on the space.",
    {
      space_id:    z.string(),
      name:        z.string().optional(),
      description: z.string().optional(),
    },
    async ({ space_id, name, description }) => {
      const principal = getPrincipal();
      const canManage = await db.hasPermission(principal.principalId, space_id, "manage");
      if (!canManage) {
        return { content: [{ type: "text" as const, text: `Manage permission required on '${space_id}'.` }], isError: true };
      }

      const space = await db.updateSpace(space_id, { name, description });

      await db.logAudit({
        action: "space_update", principalId: principal.principalId,
        targetType: "space", targetId: space_id,
        details: { name, description },
      });

      return { content: [{ type: "text" as const, text: `✓ Space '${space_id}' updated.\n${JSON.stringify(space, null, 2)}` }] };
    }
  );

  // ── space_archive ─────────────────────────────────────────────────────────
  server.tool(
    "space_archive",
    "Archive (soft-delete) a space. Preserves all entries but blocks new writes. Requires 'admin' permission. Cannot archive default spaces (public, shared, private).",
    {
      space_id: z.string(),
      confirm:  z.literal(true).describe("Must be true — prevents accidental archival"),
    },
    async ({ space_id }) => {
      const principal = getPrincipal();

      if (["public", "shared", "private"].includes(space_id)) {
        return { content: [{ type: "text" as const, text: `Cannot archive default space '${space_id}'.` }], isError: true };
      }

      const canAdmin = await db.hasPermission(principal.principalId, space_id, "admin");
      if (!canAdmin) {
        return { content: [{ type: "text" as const, text: `Admin permission required to archive '${space_id}'.` }], isError: true };
      }

      await db.archiveSpace(space_id);

      await db.logAudit({
        action: "space_archive", principalId: principal.principalId,
        targetType: "space", targetId: space_id,
      });

      return { content: [{ type: "text" as const, text: `✓ Space '${space_id}' archived. Entries preserved, new writes blocked.` }] };
    }
  );
}
