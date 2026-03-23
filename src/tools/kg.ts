import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPrincipal } from "../context.js";
import type { GraphAdapter } from "../adapters/graph/types.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerKgTools(
  server: McpServer,
  graph: GraphAdapter,
  db: DbAdapter,
) {
  // ── kg_query ──────────────────────────────────────────────────────────────
  server.tool(
    "kg_query",
    "Execute a Cypher query against the TF3 knowledge graph. Use MATCH patterns to traverse nodes and edges. Core nodes are read-only.",
    {
      cypher:  z.string().describe("Cypher query to execute"),
      params:  z.record(z.unknown()).optional().describe("Query parameters"),
      limit:   z.number().int().min(1).max(500).optional().default(50),
    },
    async ({ cypher, params, limit }) => {
      const safeQuery = cypher.includes("LIMIT") ? cypher : `${cypher} LIMIT ${limit}`;
      const results = await graph.query(safeQuery, params ?? {});
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // ── kg_get_context ────────────────────────────────────────────────────────
  server.tool(
    "kg_get_context",
    "Retrieve a subgraph relevant to a task. Provide node IDs (e.g. N0020, N0030) or a topic string. Returns nodes and their immediate neighbours with edges.",
    {
      node_ids: z.array(z.string()).optional().describe("TF3 node IDs to retrieve context for"),
      topic:    z.string().optional().describe("Topic string — will fuzzy-match node names and descriptions"),
    },
    async ({ node_ids, topic }) => {
      let ids = node_ids ?? [];

      if (topic && ids.length === 0) {
        // Fuzzy match node names
        const matches = await graph.query(
          `MATCH (n) WHERE toLower(n.name) CONTAINS toLower($topic)
             OR toLower(n.description) CONTAINS toLower($topic)
           RETURN n.node_id AS id LIMIT 5`,
          { topic }
        ) as { id: string }[];
        ids = matches.map(m => m.id);
      }

      if (ids.length === 0) {
        return { content: [{ type: "text" as const, text: "No matching nodes found." }] };
      }

      const { nodes, edges } = await graph.getContext(ids);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ nodes, edges, queried_ids: ids }, null, 2),
        }],
      };
    }
  );

  // ── kg_add_node ───────────────────────────────────────────────────────────
  server.tool(
    "kg_add_node",
    "Add a domain extension node to the knowledge graph. Must declare an anchor (a core node it extends from). Position must be geometrically coherent with the anchor. Cannot override locked core nodes.",
    {
      node_id:     z.string().describe("Unique node ID (e.g. N1001 for domain extensions)"),
      name:        z.string(),
      domain:      z.string().describe("Conceptual domain (e.g. 'legal', 'medical', 'creative')"),
      anchor:      z.string().describe("Core node ID this extends from (required for geometric validation)"),
      x:           z.number().min(0).max(1),
      y:           z.number().min(0).max(1),
      z_coord:     z.number().min(0).max(1).describe("z coordinate (named z_coord to avoid JS keyword)"),
      description: z.string(),
      confidence:  z.number().min(0).max(1).optional().default(0.8),
      weight:      z.number().min(0).max(1).optional().default(0.7),
      orientation: z.number().min(-1).max(1).optional().default(1.0),
    },
    async ({ node_id, name, domain, anchor, x, y, z_coord, description, confidence, weight, orientation }) => {
      // Validate: anchor must exist
      const anchorResult = await graph.query(
        "MATCH (n {node_id: $id}) RETURN n.locked AS locked, n.x AS ax, n.y AS ay, n.z AS az",
        { id: anchor }
      ) as { locked: boolean; ax: number; ay: number; az: number }[];

      if (!anchorResult.length) {
        return { content: [{ type: "text" as const, text: `Error: Anchor node ${anchor} not found.` }], isError: true };
      }

      // Validate: don't override locked nodes
      const existing = await graph.query(
        "MATCH (n {node_id: $id}) RETURN n.locked AS locked",
        { id: node_id }
      ) as { locked: boolean }[];
      if (existing[0]?.locked) {
        return { content: [{ type: "text" as const, text: `Error: Node ${node_id} is locked and cannot be overridden.` }], isError: true };
      }

      // Geometric validation: node must be within reasonable distance of anchor
      const { ax, ay, az } = anchorResult[0];
      const dist = Math.sqrt((x - ax) ** 2 + (y - ay) ** 2 + (z_coord - az) ** 2);
      if (dist > 0.6) {
        return {
          content: [{ type: "text" as const, text: `Error: Position (${x},${y},${z_coord}) is too far from anchor ${anchor} at (${ax},${ay},${az}). Distance ${dist.toFixed(3)} exceeds 0.6. Move the node closer to its anchor.` }],
          isError: true,
        };
      }

      await graph.upsertNode({
        id: node_id, name, domain,
        position: { x, y, z: z_coord },
        locked: false, confidence, confidenceMin: 0.3, confidenceMax: 1.0,
        slack: 0.2, weight, orientation, description,
        anchor,
      });

      const principal = getPrincipal();
      await db.logAudit({
        action: "entry_write", principalId: principal.principalId,
        targetType: "kg_node", targetId: node_id,
        details: { name, domain, anchor },
      });

      return { content: [{ type: "text" as const, text: `✓ Node ${node_id} (${name}) added. Anchor: ${anchor}, distance: ${dist.toFixed(3)}.` }] };
    }
  );

  // ── kg_add_edge ───────────────────────────────────────────────────────────
  server.tool(
    "kg_add_edge",
    "Add an edge between two nodes. Edge orientation should be consistent with the traversal direction of the connected nodes.",
    {
      edge_id:     z.string().describe("Unique edge ID (e.g. E1001 for domain extensions)"),
      subject:     z.string().describe("Source node ID"),
      object:      z.string().describe("Target node ID"),
      type:        z.enum(["PATH", "BALANCE", "SUPPORT", "REDEMPTION", "CORRUPTION"]).describe("Edge type"),
      orientation: z.number().int().min(-1).max(1).describe("1=toward Telos, 0=neutral, -1=away"),
      weight:      z.number().min(0).max(1).optional().default(0.7),
      slack:       z.number().min(0).max(0.5).optional().default(0.1),
      description: z.string(),
    },
    async ({ edge_id, subject, object, type, orientation, weight, slack, description }) => {
      // Validate both nodes exist
      for (const id of [subject, object]) {
        const r = await graph.query("MATCH (n {node_id: $id}) RETURN n.node_id", { id });
        if (!r.length) {
          return { content: [{ type: "text" as const, text: `Error: Node ${id} not found.` }], isError: true };
        }
      }

      await graph.upsertEdge({
        id: edge_id, subject, object, type,
        orientation, weight, slack: slack ?? 0.1,
        bidirectional: false, description,
      });

      return { content: [{ type: "text" as const, text: `✓ Edge ${edge_id} (${subject} -[${type}]-> ${object}) added.` }] };
    }
  );

  // ── kg_promote ────────────────────────────────────────────────────────────
  server.tool(
    "kg_promote",
    "Elevate a piece of conversation knowledge to a persistent graph node. Validates geometry before committing.",
    {
      name:        z.string().describe("Name for the new node"),
      domain:      z.string(),
      anchor:      z.string().describe("Core node this concept extends from"),
      description: z.string().describe("What this concept represents"),
      space_id:    z.string().optional().describe("Also write a memory entry for this promotion"),
    },
    async ({ name, domain, anchor, description, space_id }) => {
      const principal = getPrincipal();

      // Auto-generate node ID
      const existing = await graph.query("MATCH (n:Node) RETURN count(n) AS c") as { c: number }[];
      const count = existing[0]?.c ?? 0;
      const node_id = `N${String(1000 + count).padStart(4, "0")}`;

      // Get anchor position for auto-placement (offset slightly)
      const anchorData = await graph.query(
        "MATCH (n {node_id: $id}) RETURN n.x AS x, n.y AS y, n.z AS z",
        { id: anchor }
      ) as { x: number; y: number; z: number }[];

      if (!anchorData.length) {
        return { content: [{ type: "text" as const, text: `Error: Anchor ${anchor} not found.` }], isError: true };
      }

      const { x, y, z } = anchorData[0];
      const offset = 0.05;
      const newPos = {
        x: Math.min(1, x + offset),
        y: Math.min(1, y + offset),
        z: Math.min(1, z + offset),
      };

      await graph.upsertNode({
        id: node_id, name, domain,
        position: newPos,
        locked: false, confidence: 0.7,
        confidenceMin: 0.3, confidenceMax: 1.0,
        slack: 0.3, weight: 0.6, orientation: 1.0,
        description, anchor,
      });

      // Optionally write a memory entry linking back
      if (space_id) {
        await db.write(space_id, {
          principalId: principal.principalId,
          content: `Promoted to KG node ${node_id}: ${name} — ${description}`,
          entryType: "semantic",
          importanceScore: 0.7,
          kgNodes: [node_id, anchor],
          agentName: principal.name,
        });
      }

      return {
        content: [{
          type: "text" as const,
          text: `✓ Promoted to node ${node_id} (${name})\nAnchor: ${anchor}\nPosition: (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`,
        }],
      };
    }
  );
}
