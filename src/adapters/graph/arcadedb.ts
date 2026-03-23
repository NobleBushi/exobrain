import type { GraphAdapter, GraphNode, GraphEdge } from "./types.js";

interface ArcadeResult {
  result?: unknown[];
}

export class ArcadeDbAdapter implements GraphAdapter {
  private auth: string;

  constructor(
    private httpUrl: string,   // e.g. http://localhost:2480
    private user: string,
    private password: string,
    private database: string,
  ) {
    this.auth = Buffer.from(`${user}:${password}`).toString("base64");
  }

  async connect(): Promise<void> {
    const res = await fetch(`${this.httpUrl}/api/v1/ready`);
    if (!res.ok) throw new Error(`ArcadeDB not ready (${res.status})`);
    console.log(`✓ ArcadeDB connected (${this.httpUrl})`);
  }

  async disconnect(): Promise<void> {
    // HTTP — nothing to tear down
  }

  async query(cypher: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    const res = await fetch(`${this.httpUrl}/api/v1/query/${this.database}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ language: "cypher", command: cypher, params }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ArcadeDB query failed (${res.status}): ${text}`);
    }

    const data = await res.json() as ArcadeResult;
    return data.result ?? [];
  }

  private async command(cypher: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    const res = await fetch(`${this.httpUrl}/api/v1/command/${this.database}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ language: "cypher", command: cypher, params }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ArcadeDB command failed (${res.status}): ${text}`);
    }

    const data = await res.json() as ArcadeResult;
    return data.result ?? [];
  }

  async upsertNode(node: GraphNode): Promise<void> {
    if (node.locked) throw new Error(`Node ${node.id} is locked and cannot be modified`);
    await this.command(
      `MERGE (n:Node {node_id: $id})
       SET n.name = $name, n.domain = $domain,
           n.x = $x, n.y = $y, n.z = $z,
           n.locked = false, n.confidence = $confidence,
           n.weight = $weight, n.orientation = $orientation,
           n.description = $description`,
      {
        id: node.id, name: node.name, domain: node.domain,
        x: node.position.x, y: node.position.y, z: node.position.z,
        confidence: node.confidence, weight: node.weight,
        orientation: node.orientation, description: node.description,
      }
    );
  }

  async upsertEdge(edge: GraphEdge): Promise<void> {
    const relType = edge.type.toUpperCase().replace(/\s+/g, "_");
    await this.command(
      `MATCH (a {node_id: $subject}), (b {node_id: $object})
       MERGE (a)-[r:${relType} {edge_id: $edgeId}]->(b)
       SET r.weight = $weight, r.orientation = $orientation,
           r.slack = $slack, r.description = $description`,
      {
        subject: edge.subject, object: edge.object, edgeId: edge.id,
        weight: edge.weight, orientation: edge.orientation,
        slack: edge.slack, description: edge.description,
      }
    );
  }

  async getContext(nodeIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const records = await this.query(
      `MATCH (n) WHERE n.node_id IN $ids
       OPTIONAL MATCH (n)-[r]-(m)
       RETURN n, r, m`,
      { ids: nodeIds }
    ) as Array<{
      n?: { node_id: string; name: string; domain: string; x: number; y: number; z: number;
            locked: boolean; confidence: number; confidence_min?: number; confidence_max?: number;
            slack?: number; weight: number; orientation: number; description: string };
      r?: { "@rid"?: string; "@type"?: string; edge_id?: string; subject?: string; object?: string;
            weight?: number; orientation?: number; slack?: number; description?: string };
      m?: { node_id: string; name: string; domain: string; x: number; y: number; z: number;
            locked: boolean; confidence: number; confidence_min?: number; confidence_max?: number;
            slack?: number; weight: number; orientation: number; description: string };
    }>;

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();

    const toNode = (p: NonNullable<typeof records[0]["n"]>): GraphNode => ({
      id: p.node_id, name: p.name, domain: p.domain,
      position: { x: p.x, y: p.y, z: p.z },
      locked: p.locked, confidence: p.confidence,
      confidenceMin: p.confidence_min ?? 0, confidenceMax: p.confidence_max ?? 1,
      slack: p.slack ?? 0.2, weight: p.weight, orientation: p.orientation,
      description: p.description,
    });

    for (const row of records) {
      if (row.n?.node_id) nodes.set(row.n.node_id, toNode(row.n));
      if (row.m?.node_id) nodes.set(row.m.node_id, toNode(row.m));
      if (row.r) {
        const edgeId = row.r.edge_id ?? row.r["@rid"] ?? "unknown";
        edges.set(edgeId, {
          id: edgeId,
          subject: row.r.subject ?? "",
          object: row.r.object ?? "",
          type: row.r["@type"] ?? "UNKNOWN",
          orientation: row.r.orientation ?? 0,
          weight: row.r.weight ?? 0.5,
          slack: row.r.slack ?? 0.1,
          bidirectional: false,
          description: row.r.description ?? "",
        });
      }
    }

    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }

  async validateGeometry(nodeId: string, anchorId: string): Promise<boolean> {
    const result = await this.query(
      `MATCH (anchor {node_id: $anchorId}), (n {node_id: $nodeId})
       RETURN anchor.x AS ax, anchor.y AS ay, anchor.z AS az,
              n.x AS nx, n.y AS ny, n.z AS nz, anchor.slack AS slack`,
      { anchorId, nodeId }
    ) as Array<{ ax: number; ay: number; az: number; nx: number; ny: number; nz: number; slack: number }>;

    if (!result.length) return false;
    const { ax, ay, az, nx, ny, nz, slack } = result[0];
    const dist = Math.sqrt((nx - ax) ** 2 + (ny - ay) ** 2 + (nz - az) ** 2);
    return dist <= (slack ?? 0.5);
  }
}

export function createArcadeDbAdapter(): ArcadeDbAdapter {
  const httpUrl  = process.env.ARCADEDB_URL      ?? "http://localhost:2480";
  const user     = process.env.ARCADEDB_USER     ?? "root";
  const password = process.env.ARCADEDB_PASSWORD ?? "changeme";
  const database = process.env.ARCADEDB_DATABASE ?? "exobrain";

  return new ArcadeDbAdapter(httpUrl, user, password, database);
}
