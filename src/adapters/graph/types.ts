export interface GraphNode {
  id: string;
  name: string;
  domain: string;
  position: { x: number; y: number; z: number };
  locked: boolean;
  confidence: number;
  confidenceMin: number;
  confidenceMax: number;
  slack: number;
  weight: number;
  orientation: number;
  description: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  subject: string;
  object: string;
  type: string;
  orientation: number;
  weight: number;
  slack: number;
  bidirectional: boolean;
  description: string;
  [key: string]: unknown;
}

export interface GraphAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(cypher: string, params?: Record<string, unknown>): Promise<unknown[]>;
  upsertNode(node: GraphNode): Promise<void>;
  upsertEdge(edge: GraphEdge): Promise<void>;
  getContext(nodeIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
}
