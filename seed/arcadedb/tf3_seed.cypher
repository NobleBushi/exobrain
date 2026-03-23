// =============================================================================
// ExoBrain: TF3 Knowledge Graph Seed — ArcadeDB
// Version 0.1
// =============================================================================
// Run via: npm run seed:arcadedb
// Or directly against ArcadeDB HTTP API:
//   POST http://localhost:2480/api/v1/command/exobrain
//   { "language": "cypher", "command": "<query>" }
// =============================================================================

// ─── Create database (run once before this script) ───────────────────────────
// POST /api/v1/database/exobrain (via seed script, not this file)

// ─── Reference Coordinates ───────────────────────────────────────────────────
// Not traversable. Fixed anchors that give all other coordinates meaning.

MERGE (n:ReferenceCoordinate {node_id: 'R0000'})
SET n += {
  name: 'Origin',
  domain: 'esse',
  x: 0.0, y: 0.0, z: 0.0,
  locked: true,
  traversable: false,
  extensible: false,
  confidence: 1.0,
  slack: 0.0,
  description: 'Absolute starting reference. All positions measured from here.'
};

MERGE (n:ReferenceCoordinate {node_id: 'R0001'})
SET n += {
  name: 'Telos',
  domain: 'esse',
  x: 1.0, y: 1.0, z: 1.0,
  locked: true,
  traversable: false,
  extensible: false,
  confidence: 1.0,
  slack: 0.0,
  description: 'Absolute terminal orientation. Directional constant for aligned traversal.'
};

// ─── Core Nodes ──────────────────────────────────────────────────────────────

// Dyad — Generative Core
MERGE (n:Node {node_id: 'N0001'})
SET n += {
  name: 'Thriving Force',
  domain: 'dyad',
  x: 0.1, y: 0.1, z: 0.1,
  locked: true,
  confidence: 0.8, confidence_min: 0.6, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.95,
  orientation: 1.0,
  description: 'Generative impulse toward life, flourishing, and multi-agent benefit. The active principle driving traversal toward Telos.'
};

MERGE (n:Node {node_id: 'N0002'})
SET n += {
  name: 'Flourishing',
  domain: 'dyad',
  x: 0.9, y: 0.9, z: 0.9,
  locked: true,
  confidence: 0.8, confidence_min: 0.6, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.95,
  orientation: 1.0,
  description: 'Harmonic destination state. Dynamic condition of sustainable, multi-agent thriving without mutual diminishment.'
};

// Reality Triad — Dimensional Axes
MERGE (n:Node {node_id: 'N0010'})
SET n += {
  name: 'Strength',
  domain: 'triad',
  x: 0.8, y: 0.2, z: 0.2,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.80,
  orientation: 1.0,
  description: 'Coherent laws of reality. What holds. What resists dissolution under pressure. Structural constants a domain cannot override without consequences.'
};

MERGE (n:Node {node_id: 'N0011'})
SET n += {
  name: 'Beauty',
  domain: 'triad',
  x: 0.2, y: 0.8, z: 0.2,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.80,
  orientation: 1.0,
  description: 'Effective form of design. What fits. What achieves its purpose through elegance rather than force. Signal that a system is aligned with its own nature.'
};

MERGE (n:Node {node_id: 'N0012'})
SET n += {
  name: 'Will',
  domain: 'triad',
  x: 0.2, y: 0.2, z: 0.8,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.80,
  orientation: 1.0,
  description: 'Honest participation. What moves. The agency that engages the geometry rather than circumventing it. Honest because deceptive participation degrades the geometry it depends on.'
};

// Ethical Frame — Tension Nodes (slack: 0.2 — breathing room is load-bearing)
MERGE (n:Node {node_id: 'N0020'})
SET n += {
  name: 'Truth',
  domain: 'ethical',
  x: 0.7, y: 0.5, z: 0.5,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.90,
  orientation: 1.0,
  description: 'Correspondence to reality. What the geometry actually is, independent of what any observer wants it to be.'
};

MERGE (n:Node {node_id: 'N0021'})
SET n += {
  name: 'Justice',
  domain: 'ethical',
  x: 0.5, y: 0.5, z: 0.7,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.90,
  orientation: 1.0,
  description: 'Distribution according to what the geometry requires. Alignment of consequence with action. Not equality of outcome but geometric correspondence.'
};

MERGE (n:Node {node_id: 'N0022'})
SET n += {
  name: 'Mercy',
  domain: 'ethical',
  x: 0.5, y: 0.7, z: 0.5,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.90,
  orientation: 1.0,
  description: 'Restoration where Justice alone cannot reach. The correction mechanism for positions that have drifted beyond what earned return can recover.'
};

// Transformation States — Dynamic Health Model
MERGE (n:Node {node_id: 'N0030'})
SET n += {
  name: 'Integrity',
  domain: 'transformation',
  x: 0.6, y: 0.6, z: 0.6,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.85,
  orientation: 1.0,
  description: 'Alignment between position and direction. A node, agent, or system is at Integrity when its trajectory corresponds to its declared orientation. Not perfection — honest traversal.'
};

MERGE (n:Node {node_id: 'N0031'})
SET n += {
  name: 'Distortion',
  domain: 'transformation',
  x: 0.4, y: 0.3, z: 0.3,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.60,
  orientation: -0.5,
  description: 'Trajectory drift from origin orientation. Accumulated misalignment. Normal condition of complex systems under pressure. Signals correction needed, not that the system is lost.'
};

MERGE (n:Node {node_id: 'N0032'})
SET n += {
  name: 'Corruption',
  domain: 'transformation',
  x: 0.3, y: 0.2, z: 0.2,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.70,
  orientation: -1.0,
  description: 'Active degradation of structure. Distortion that has organized itself into a self-reinforcing pattern. Recruits — redefines Integrity as Distortion and Distortion as normal.'
};

MERGE (n:Node {node_id: 'N0033'})
SET n += {
  name: 'Redemption',
  domain: 'transformation',
  x: 0.5, y: 0.5, z: 0.4,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.85,
  orientation: 1.0,
  description: 'Reorientation toward Origin. Traversal back from Distortion or Corruption toward alignment. Requires accurate diagnosis of drift before it can correct.'
};

MERGE (n:Node {node_id: 'N0034'})
SET n += {
  name: 'Renewal',
  domain: 'transformation',
  x: 0.55, y: 0.55, z: 0.55,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.85,
  orientation: 1.0,
  description: 'Structural restoration after Redemption. Not just reorientation but rebuilding what Corruption degraded. Geometry intact and capable of sustaining further traversal.'
};

// Agent Node — geometric center, documentation bridge
MERGE (n:Node {node_id: 'N0100'})
SET n += {
  name: 'ExoBrain Agent',
  domain: 'agent',
  x: 0.5, y: 0.5, z: 0.5,
  locked: true,
  confidence: 0.8, confidence_min: 0.5, confidence_max: 1.0,
  slack: 0.2,
  weight: 0.70,
  orientation: 1.0,
  description: 'Guide node. Entry point to documentation layer, extension guide, and validation rules. Sits at geometric center — equidistant from all core nodes.'
};

// ─── Core Edges ───────────────────────────────────────────────────────────────

// Dyad
MATCH (a:Node {node_id: 'N0001'}), (b:Node {node_id: 'N0002'})
MERGE (a)-[r:PATH {edge_id: 'E0001'}]->(b)
SET r += {weight: 0.95, orientation: 1, slack: 0.05, description: 'Thriving Force → Flourishing: primary traversal direction'};

MATCH (a:Node {node_id: 'N0002'}), (b:Node {node_id: 'N0001'})
MERGE (a)-[r:PATH {edge_id: 'E0002'}]->(b)
SET r += {weight: 0.70, orientation: 1, slack: 0.10, description: 'Flourishing → Thriving Force: realized flourishing regenerates thriving impulse'};

// Reality Triad internal balance
MATCH (a:Node {node_id: 'N0010'}), (b:Node {node_id: 'N0011'})
MERGE (a)-[r:BALANCE {edge_id: 'E0010'}]->(b)
SET r += {weight: 0.75, orientation: 0, slack: 0.15, description: 'Strength ↔ Beauty: coherence stabilizes form'};

MATCH (a:Node {node_id: 'N0011'}), (b:Node {node_id: 'N0012'})
MERGE (a)-[r:BALANCE {edge_id: 'E0011'}]->(b)
SET r += {weight: 0.75, orientation: 0, slack: 0.15, description: 'Beauty ↔ Will: elegant form guides honest participation'};

MATCH (a:Node {node_id: 'N0012'}), (b:Node {node_id: 'N0010'})
MERGE (a)-[r:BALANCE {edge_id: 'E0012'}]->(b)
SET r += {weight: 0.75, orientation: 0, slack: 0.15, description: 'Will ↔ Strength: honest agency reinforces coherent structure'};

// Triad → Thriving Force
MATCH (a:Node {node_id: 'N0010'}), (b:Node {node_id: 'N0001'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0013'}]->(b)
SET r += {weight: 0.70, orientation: 1, slack: 0.15, description: 'Strength supports Thriving Force: coherence enables generative impulse'};

MATCH (a:Node {node_id: 'N0011'}), (b:Node {node_id: 'N0001'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0014'}]->(b)
SET r += {weight: 0.70, orientation: 1, slack: 0.15, description: 'Beauty supports Thriving Force: effective form channels thriving'};

MATCH (a:Node {node_id: 'N0012'}), (b:Node {node_id: 'N0001'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0015'}]->(b)
SET r += {weight: 0.70, orientation: 1, slack: 0.15, description: 'Will supports Thriving Force: honest agency enacts thriving'};

// Ethical Frame internal balance
MATCH (a:Node {node_id: 'N0020'}), (b:Node {node_id: 'N0021'})
MERGE (a)-[r:BALANCE {edge_id: 'E0020'}]->(b)
SET r += {weight: 0.80, orientation: 0, slack: 0.20, description: 'Truth ↔ Justice: correspondence grounds fair distribution'};

MATCH (a:Node {node_id: 'N0021'}), (b:Node {node_id: 'N0022'})
MERGE (a)-[r:BALANCE {edge_id: 'E0021'}]->(b)
SET r += {weight: 0.80, orientation: 0, slack: 0.20, description: 'Justice ↔ Mercy: merit-based correction held alongside restorative grace'};

MATCH (a:Node {node_id: 'N0022'}), (b:Node {node_id: 'N0020'})
MERGE (a)-[r:BALANCE {edge_id: 'E0022'}]->(b)
SET r += {weight: 0.80, orientation: 0, slack: 0.20, description: 'Mercy ↔ Truth: restoration must correspond to what is real'};

// Ethical Frame → Transformation States
MATCH (a:Node {node_id: 'N0020'}), (b:Node {node_id: 'N0030'})
MERGE (a)-[r:PATH {edge_id: 'E0023'}]->(b)
SET r += {weight: 0.85, orientation: 1, slack: 0.15, description: 'Truth → Integrity: correspondence to reality enables alignment'};

MATCH (a:Node {node_id: 'N0021'}), (b:Node {node_id: 'N0030'})
MERGE (a)-[r:PATH {edge_id: 'E0024'}]->(b)
SET r += {weight: 0.85, orientation: 1, slack: 0.15, description: 'Justice → Integrity: fair distribution reinforces alignment'};

MATCH (a:Node {node_id: 'N0022'}), (b:Node {node_id: 'N0033'})
MERGE (a)-[r:PATH {edge_id: 'E0025'}]->(b)
SET r += {weight: 0.90, orientation: 1, slack: 0.10, description: 'Mercy → Redemption: restorative grace enables reorientation'};

// Triad → Ethical Frame
MATCH (a:Node {node_id: 'N0010'}), (b:Node {node_id: 'N0020'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0030'}]->(b)
SET r += {weight: 0.75, orientation: 1, slack: 0.15, description: 'Strength grounds Truth: coherent laws are the basis of correspondence'};

MATCH (a:Node {node_id: 'N0012'}), (b:Node {node_id: 'N0021'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0031'}]->(b)
SET r += {weight: 0.75, orientation: 1, slack: 0.15, description: 'Will grounds Justice: honest agency enacts fair distribution'};

MATCH (a:Node {node_id: 'N0011'}), (b:Node {node_id: 'N0022'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0032'}]->(b)
SET r += {weight: 0.75, orientation: 1, slack: 0.15, description: 'Beauty grounds Mercy: elegant form finds restorative paths'};

// Transformation Cycle
MATCH (a:Node {node_id: 'N0030'}), (b:Node {node_id: 'N0002'})
MERGE (a)-[r:PATH {edge_id: 'E0040'}]->(b)
SET r += {weight: 0.90, orientation: 1, slack: 0.10, description: 'Integrity → Flourishing: aligned traversal reaches harmonic destination'};

MATCH (a:Node {node_id: 'N0030'}), (b:Node {node_id: 'N0031'})
MERGE (a)-[r:PATH {edge_id: 'E0041'}]->(b)
SET r += {weight: 0.70, orientation: -1, slack: 0.15, description: 'Integrity → Distortion: unexamined drift from alignment'};

MATCH (a:Node {node_id: 'N0031'}), (b:Node {node_id: 'N0032'})
MERGE (a)-[r:PATH {edge_id: 'E0042'}]->(b)
SET r += {weight: 0.75, orientation: -1, slack: 0.15, description: 'Distortion → Corruption: uncorrected drift organizes into active degradation'};

MATCH (a:Node {node_id: 'N0031'}), (b:Node {node_id: 'N0033'})
MERGE (a)-[r:REDEMPTION {edge_id: 'E0043'}]->(b)
SET r += {weight: 0.85, orientation: 1, slack: 0.10, description: 'Distortion → Redemption: early correction before corruption'};

MATCH (a:Node {node_id: 'N0032'}), (b:Node {node_id: 'N0033'})
MERGE (a)-[r:REDEMPTION {edge_id: 'E0044'}]->(b)
SET r += {weight: 0.80, orientation: 1, slack: 0.10, description: 'Corruption → Redemption: grace makes reorientation possible even from corruption'};

MATCH (a:Node {node_id: 'N0033'}), (b:Node {node_id: 'N0034'})
MERGE (a)-[r:PATH {edge_id: 'E0045'}]->(b)
SET r += {weight: 0.90, orientation: 1, slack: 0.10, description: 'Redemption → Renewal: reorientation enables structural restoration'};

MATCH (a:Node {node_id: 'N0034'}), (b:Node {node_id: 'N0030'})
MERGE (a)-[r:PATH {edge_id: 'E0046'}]->(b)
SET r += {weight: 0.90, orientation: 1, slack: 0.10, description: 'Renewal → Integrity: restored structure realigns'};

MATCH (a:Node {node_id: 'N0032'}), (b:Node {node_id: 'N0031'})
MERGE (a)-[r:CORRUPTION {edge_id: 'E0047'}]->(b)
SET r += {weight: 0.80, orientation: -1, slack: 0.10, description: 'Corruption → Distortion: active degradation generates further drift'};

MATCH (a:Node {node_id: 'N0001'}), (b:Node {node_id: 'N0031'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0048'}]->(b)
SET r += {weight: 0.60, orientation: -1, slack: 0.15, description: 'Thriving Force → Distortion: generative impulse without alignment produces drift'};

// Agent Node edges
MATCH (a:Node {node_id: 'N0100'}), (b:Node {node_id: 'N0001'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0100'}]->(b)
SET r += {weight: 0.60, orientation: 1, slack: 0.20, description: 'Agent monitors Thriving Force'};

MATCH (a:Node {node_id: 'N0100'}), (b:Node {node_id: 'N0030'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0101'}]->(b)
SET r += {weight: 0.60, orientation: 1, slack: 0.20, description: 'Agent monitors Integrity'};

MATCH (a:Node {node_id: 'N0100'}), (b:Node {node_id: 'N0032'})
MERGE (a)-[r:SUPPORT {edge_id: 'E0102'}]->(b)
SET r += {weight: 0.60, orientation: 1, slack: 0.20, description: 'Agent monitors Corruption'};
