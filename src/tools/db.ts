import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getContext, getPrincipal } from "../context.js";
import type { DbAdapter } from "../adapters/db/types.js";

function checkPerm(permissions: string[], required: string): string | null {
  if (!permissions.includes(required)) {
    return `Your token does not have '${required}' permission.`;
  }
  return null;
}

export function registerDbTools(server: McpServer, db: DbAdapter) {

  // ── db_write ──────────────────────────────────────────────────────────────
  server.tool(
    "db_write",
    "Write a memory entry to a space. Requires 'write' permission. Write when: a decision is made, something important is learned, a mistake is corrected, a task produces durable knowledge, or a session ends with context worth preserving. Entries should be distilled — insights, decisions, corrections, references — not raw document content. Use entry_type='correction' when overriding or refining a prior belief. Use importance_score to signal how much this should shape future context. Provenance (model, agent_name) is encouraged for all writes.",
    {
      space_id:        z.string().optional().describe("Target space ID (defaults to active scope set by db_scope)"),
      content:         z.string().describe("The knowledge content to store. Should be distilled insight, not raw source text."),
      summary:         z.string().optional().describe("Short summary (used in bootstrap context)"),
      entry_type:      z.enum(["semantic", "procedural", "episodic", "correction"]).optional().default("semantic"),
      importance_score: z.number().min(0).max(1).optional().default(0.5)
                         .describe("0.0–1.0; higher surfaces sooner in searches"),
      tags:            z.array(z.string()).optional().default([]),
      kg_nodes:        z.array(z.string()).optional().default([])
                         .describe("TF3 node IDs this entry relates to (e.g. ['N0020','N0030'])"),
      model:           z.string().optional().describe("LLM that generated this content (e.g. claude-sonnet-4-6)"),
      agent_name:      z.string().optional().describe("Agent identity (e.g. Cecil, coordinator)"),
      source_filename: z.string().optional().describe("Original filename this knowledge was derived from"),
      source_url:      z.string().optional().describe("URL of the source (web page, cloud storage link, etc.)"),
      source_file_id:  z.string().optional().describe("External system file ID (e.g. Box, Drive, Notion)"),
      source_type:     z.string().optional().describe("Brief source descriptor, e.g. 'pdf', 'webpage', 'slack-thread', 'email', 'meeting-notes'"),
    },
    async ({ space_id: rawSpaceId, content, summary, entry_type, importance_score, tags, kg_nodes, model, agent_name,
             source_filename, source_url, source_file_id, source_type }) => {
      const principal = getPrincipal();
      const ctx = getContext();
      const space_id = rawSpaceId ?? ctx.scopedSpaceId;

      if (!space_id) {
        return { content: [{ type: "text" as const, text: "No space_id provided and no active scope. Call db_scope first or supply space_id." }], isError: true };
      }

      // Check token-level write permission
      const permErr = checkPerm(principal.permissions, "write");
      if (permErr) return { content: [{ type: "text" as const, text: permErr }], isError: true };

      // Check API key space allowlist
      if (principal.allowedSpaces.length > 0 && !principal.allowedSpaces.includes(space_id)) {
        return { content: [{ type: "text" as const, text: `API key not scoped to space '${space_id}'.` }], isError: true };
      }

      const canWrite = await db.hasPermission(principal.principalId, space_id, "write");
      if (!canWrite) {
        return { content: [{ type: "text" as const, text: `Write permission required on '${space_id}'.` }], isError: true };
      }

      const source = (source_filename || source_url || source_file_id || source_type)
        ? {
            ...(source_filename && { filename: source_filename }),
            ...(source_url      && { url:      source_url }),
            ...(source_file_id  && { file_id:  source_file_id }),
            ...(source_type     && { type:     source_type }),
          }
        : undefined;

      const entryId = await db.write(space_id, {
        principalId: principal.principalId,
        content, summary, entryType: entry_type,
        importanceScore: importance_score,
        tags: tags ?? [], kgNodes: kg_nodes ?? [],
        model, agentName: agent_name,
        ...(source && { metadata: { source } }),
      });

      const sourceNote = source ? ` (source: ${source.filename ?? source.url ?? source.file_id ?? source.type})` : "";
      return { content: [{ type: "text" as const, text: `✓ Written to '${space_id}'. Entry ID: ${entryId}${sourceNote}` }] };
    }
  );

  // ── db_read ───────────────────────────────────────────────────────────────
  server.tool(
    "db_read",
    "Read memory entries from a space. Call at session start to bootstrap context — search for topics relevant to the current task before proceeding. Also use to gather related entries before collapsing them: read several related memories, synthesize them into one stronger entry via db_write (higher importance_score, entry_type='correction'), then note the superseded entry IDs in the new entry's tags or metadata. Results ordered by importance then recency.",
    {
      space_id:  z.string().optional().describe("Space to read from (defaults to active scope set by db_scope)"),
      query:     z.string().optional().default("").describe("Keyword search (empty = return recent entries)"),
      limit:     z.number().int().min(1).max(100).optional().default(20),
      entry_type: z.enum(["semantic", "procedural", "episodic", "correction"]).optional(),
    },
    async ({ space_id: rawSpaceId, query, limit }) => {
      const principal = getPrincipal();
      const ctx = getContext();
      const space_id = rawSpaceId ?? ctx.scopedSpaceId;

      if (!space_id) {
        return { content: [{ type: "text" as const, text: "No space_id provided and no active scope. Call db_scope first or supply space_id." }], isError: true };
      }

      // Check token-level read permission
      const permErr = checkPerm(principal.permissions, "read");
      if (permErr) return { content: [{ type: "text" as const, text: permErr }], isError: true };

      if (principal.allowedSpaces.length > 0 && !principal.allowedSpaces.includes(space_id)) {
        return { content: [{ type: "text" as const, text: `API key not scoped to space '${space_id}'.` }], isError: true };
      }

      const canRead = await db.hasPermission(principal.principalId, space_id, "read");
      if (!canRead) {
        return { content: [{ type: "text" as const, text: `Read permission required on '${space_id}'.` }], isError: true };
      }

      const entries = await db.read(space_id, query ?? "", principal.principalId, limit);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ space_id, count: entries.length, entries }, null, 2),
        }],
      };
    }
  );

  // ── db_scope ──────────────────────────────────────────────────────────────
  server.tool(
    "db_scope",
    "Set the active space for this session. Subsequent db_read and db_write calls will use this space if space_id is omitted.",
    {
      space_id: z.string().describe("Space ID to set as active scope"),
    },
    async ({ space_id }) => {
      const principal = getPrincipal();
      const ctx = getContext();

      const canRead = await db.hasPermission(principal.principalId, space_id, "read");
      if (!canRead) {
        return { content: [{ type: "text" as const, text: `Cannot scope to '${space_id}' — no read permission.` }], isError: true };
      }

      ctx.scopedSpaceId = space_id;
      const space = await db.getSpace(space_id);

      return {
        content: [{
          type: "text" as const,
          text: `✓ Scoped to '${space_id}' (${space?.spaceType ?? "unknown"}: ${space?.name ?? space_id})`,
        }],
      };
    }
  );

  // ── audit_read ────────────────────────────────────────────────────────────
  server.tool(
    "audit_read",
    "Read the audit log. Owners can read all entries. Others can read entries for their own principal or spaces where they have 'manage' permission.",
    {
      space_id:     z.string().optional().describe("Filter by space"),
      principal_id: z.string().optional().describe("Filter by principal (owner only)"),
      action:       z.string().optional().describe("Filter by action type"),
      since:        z.string().optional().describe("ISO 8601 timestamp — return entries after this time"),
      limit:        z.number().int().min(1).max(500).optional().default(50),
    },
    async ({ space_id, principal_id, action, since, limit }) => {
      const principal = getPrincipal();
      const isOwner = principal.principalType === "owner";

      // Non-owners: allow all entries in a space if they have manage permission there,
      // otherwise restrict to their own entries only.
      let effectivePrincipalId: string | undefined;
      if (isOwner) {
        effectivePrincipalId = principal_id;
      } else if (space_id) {
        const canManage = await db.hasPermission(principal.principalId, space_id, "manage");
        effectivePrincipalId = canManage ? principal_id : principal.principalId;
      } else {
        effectivePrincipalId = principal.principalId;
      }

      const entries = await db.readAuditLog({
        spaceId: space_id,
        principalId: effectivePrincipalId,
        action,
        since,
        limit,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ count: entries.length, entries }, null, 2),
        }],
      };
    }
  );
}
