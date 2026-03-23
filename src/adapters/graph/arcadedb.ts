import neo4j, { type Driver, type Session } from "neo4j-driver";
import type { GraphAdapter, GraphNode, GraphEdge } from "./types.js";

export class ArcadeDbAdapter implements GraphAdapter {
  private driver: Driver | null = null;

  constructor(
    private boltUri: string,   // e.g. bolt://localhost:2424
    private user: string,
    private password: string,
    private database: string,
  ) {}

  async connect(): Promise<void> {
    this.driver = neo4j.driver(
      this.boltUri,
      neo4j.auth.basic(this.user, this.password),
      { disableLosslessIntegers: true }
    );
    await this.driver.verifyConnectivity();
    console.log(`✓ ArcadeDB connected (${this.boltUri})`);
  }

  async disconnect(): Promise<void> {
    await this.driver?.close();
    this.driver = null;
  }

  private session(): Session {
    if (!this.driver) throw new Error("ArcadeDB not connected");
    return this.driver.session({ database: this.database });
  }

  async query(cypher: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
    const s = this.session();
    try {
      const result = await s.run(cypher, params);
      return result.records.map(r => {
        const obj: Record<string, unknown> = {};
        r.keys.forEach(k => { obj[k as string] = r.get(k); });
        return obj;
      });
    } finally {
      await s.close();
    }
  }

  async upsertNode(node: GraphNode): Promise<void> {
    if (node.locked) throw new Error(`Node ${node.id} is locked and cannot be modified`);
    const s = this.session();
    try {
      await s.run(
        `MERGE (n:Node {node_id: $id})
         SET n += $props`,
        {
          id: node.id,
          props: {
            name: node.name,
            domain: node.domain,
            x: node.position.x, y: node.position.y, z: node.position.z,
            locked: node.locked,
            confidence: node.confidence,
            weight: node.weight,
            orientation: node.orientation,
            description: node.description,
          },
        }
      );
    } finally {
      await s.close();
    }
  }

  async upsertEdge(edge: GraphEdge): Promise<void> {
    const s = this.session();
    try {
      const relType = edge.type.toUpperCase().replace(/\s+/g, "_");
      await s.run(
        `MATCH (a {node_id: $subject}), (b {node_id: $object})
         MERGE (a)-[r:${relType} {edge_id: $edgeId}]->(b)
         SET r += $props`,
        {
          subject: edge.subject,
          object: edge.object,
          edgeId: edge.id,
          props: {
            weight: edge.weight,
            orientation: edge.orientation,
            slack: edge.slack,
            description: edge.description,
          },
        }
      );
    } finally {
      await s.close();
    }
  }

  async getContext(nodeIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const s = this.session();
    try {
      // Get the requested nodes plus one hop of neighbours
      const result = await s.run(
        `MATCH (n) WHERE n.node_id IN $ids
         OPTIONAL MATCH (n)-[r]-(m)
         RETURN n, r, m`,
        { ids: nodeIds }
      );

      const nodes = new Map<string, GraphNode>();
      const edges = new Map<string, GraphEdge>();

      for (const record of result.records) {
        const n = record.get("n");
        const r = record.get("r");
        const m = record.get("m");

        if (n?.properties) {
          const p = n.properties;
          nodes.set(p.node_id, {
            id: p.node_id, name: p.name, domain: p.domain,
            position: { x: p.x, y: p.y, z: p.z },
            locked: p.locked, confidence: p.confidence,
            confidenceMin: p.confidence_min ?? 0, confidenceMax: p.confidence_max ?? 1,
            slack: p.slack ?? 0.2, weight: p.weight, orientation: p.orientation,
            description: p.description,
          });
        }
        if (m?.properties) {
          const p = m.properties;
          nodes.set(p.node_id, {
            id: p.node_id, name: p.name, domain: p.domain,
            position: { x: p.x, y: p.y, z: p.z },
            locked: p.locked, confidence: p.confidence,
            confidenceMin: p.confidence_min ?? 0, confidenceMax: p.confidence_max ?? 1,
            slack: p.slack ?? 0.2, weight: p.weight, orientation: p.orientation,
            description: p.description,
          });
        }
        if (r?.properties) {
          const p = r.properties;
          const edgeId = p.edge_id ?? `${r.startNodeElementId}-${r.type}-${r.endNodeElementId}`;
          edges.set(edgeId, {
            id: edgeId, subject: p.subject ?? "", object: p.object ?? "",
            type: r.type, orientation: p.orientation ?? 0,
            weight: p.weight ?? 0.5, slack: p.slack ?? 0.1,
            bidirectional: false, description: p.description ?? "",
          });
        }
      }

      return { nodes: [...nodes.values()], edges: [...edges.values()] };
    } finally {
      await s.close();
    }
  }

  async validateGeometry(nodeId: string, anchorId: string): Promise<boolean> {
    // Node must be within slack distance of its anchor
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

  // Derive Bolt URI from HTTP URL (ArcadeDB Bolt port is 2424)
  const boltUri = (process.env.ARCADEDB_BOLT_URI)
    ?? httpUrl.replace(/^https?:\/\//, "bolt://").replace(/:\d+$/, ":2424");

  return new ArcadeDbAdapter(boltUri, user, password, database);
}
