# Thriving Force 3 (TF3): Knowledge Graph Specification

*Version 0.1 — Initial seed definition*
*ExoBrain core knowledge graph schema*

---

## Overview

TF3 is the third generation of the Thriving Force lattice, formalized as a deployable knowledge graph seed. It encodes the minimal geometric structure underlying coherent knowledge in any domain.

TF3 is domain-agnostic by design. It makes no assumptions about the subject matter of any ExoBrain instance. What it does encode is the geometric skeleton that every coherent knowledge domain navigates — whether or not it uses this vocabulary.

All core nodes have **fixed 3D positions**. These positions are immutable. What varies per domain instance is the **confidence value** — how firmly this deployment anchors to each node — and the **slack value** — the permitted range of confidence adjustment.

---

## Coordinate System

Positions are expressed as (x, y, z) float values in the range [0.0, 1.0].

- **Origin** anchors at (0.0, 0.0, 0.0)
- **Telos** anchors at (1.0, 1.0, 1.0)
- All other nodes occupy fixed positions between these poles
- Distance from Origin represents distance from generative source
- Distance from Telos represents distance from harmonic destination
- Geometric relationships between nodes are more significant than absolute positions

---

## Reference Coordinates (Esse Layer)

These are not traversable nodes. They are the fixed reference points that give all other coordinates meaning. They cannot be moved, extended from, or removed.

| ID | Name | Position | Description |
|---|---|---|---|
| R0000 | Origin | (0.0, 0.0, 0.0) | Absolute starting reference. All positions measured from here. |
| R0001 | Telos | (1.0, 1.0, 1.0) | Absolute terminal orientation. Directional constant for aligned traversal. |

**Properties:**
```
locked: true
traversable: false
extensible: false
confidence: 1.0
slack: 0.0
```

---

## Core Nodes

### Node Schema

Each core node carries the following properties:

```
id:             string      — unique identifier (N####)
name:           string      — human-readable label
domain:         string      — conceptual grouping
position:       {x, y, z}  — fixed 3D coordinates
locked:         boolean     — true for all core nodes
confidence:     float       — instance-adjustable [0.0–1.0]
confidence_min: float       — minimum allowed confidence
confidence_max: float       — maximum allowed confidence
slack:          float       — permitted confidence range
weight:         float       — relative significance in traversal
orientation:    float       — directional value [-1.0 to 1.0]
                              1.0 = toward Telos
                              0.0 = neutral
                             -1.0 = away from Telos
description:    string      — concept definition
```

---

### Dyad Layer — Generative Core

| ID | Name | Position | Orientation | Weight | Description |
|---|---|---|---|---|---|
| N0001 | Thriving Force | (0.1, 0.1, 0.1) | 1.0 | 0.95 | Generative impulse toward life, flourishing, and multi-agent benefit. |
| N0002 | Flourishing | (0.9, 0.9, 0.9) | 1.0 | 0.95 | Harmonic destination state. Dynamic condition of sustainable, multi-agent thriving. |

---

### Reality Triad — Dimensional Axes

| ID | Name | Position | Orientation | Weight | Description |
|---|---|---|---|---|---|
| N0010 | Strength | (0.8, 0.2, 0.2) | 1.0 | 0.80 | Coherent laws of reality. What holds. Structural constants a domain cannot override. |
| N0011 | Beauty | (0.2, 0.8, 0.2) | 1.0 | 0.80 | Effective form of design. What fits. Signal that a system is aligned with its own nature. |
| N0012 | Will | (0.2, 0.2, 0.8) | 1.0 | 0.80 | Honest participation. What moves. Agency that engages geometry rather than circumventing it. |

---

### Ethical Frame — Tension Nodes

Each carries `slack: 0.2` — breathing room prevents collapse into brutality, rigidity, or enabling.

| ID | Name | Position | Orientation | Weight | Description |
|---|---|---|---|---|---|
| N0020 | Truth | (0.7, 0.5, 0.5) | 1.0 | 0.90 | Correspondence to reality, independent of what any observer wants it to be. |
| N0021 | Justice | (0.5, 0.5, 0.7) | 1.0 | 0.90 | Distribution according to what the geometry requires. Not equality of outcome. |
| N0022 | Mercy | (0.5, 0.7, 0.5) | 1.0 | 0.90 | Restoration where Justice alone cannot reach. Correction for positions that have drifted. |

---

### Transformation States — Dynamic Health Model

| ID | Name | Position | Orientation | Weight | Description |
|---|---|---|---|---|---|
| N0030 | Integrity | (0.6, 0.6, 0.6) | 1.0 | 0.85 | Alignment between position and direction. Not perfection — honest traversal. |
| N0031 | Distortion | (0.4, 0.3, 0.3) | -0.5 | 0.60 | Trajectory drift. Normal under pressure. Signals correction needed, not system lost. |
| N0032 | Corruption | (0.3, 0.2, 0.2) | -1.0 | 0.70 | Active degradation. Self-reinforcing. Recruits — redefines Integrity as Distortion. |
| N0033 | Redemption | (0.5, 0.5, 0.4) | 1.0 | 0.85 | Reorientation toward Origin. Requires accurate diagnosis of drift first. |
| N0034 | Renewal | (0.55, 0.55, 0.55) | 1.0 | 0.85 | Structural restoration after Redemption. Geometry intact and capable again. |

---

### Agent Node

| ID | Name | Position | Orientation | Weight | Description |
|---|---|---|---|---|---|
| N0100 | ExoBrain Agent | (0.5, 0.5, 0.5) | 1.0 | 0.70 | Guide node. Entry point to documentation layer. Sits at geometric center. |

---

## Core Edges (36 total)

### Dyad
| ID | Subject | Object | Type | Orientation | Weight |
|---|---|---|---|---|---|
| E0001 | N0001 | N0002 | Path | 1 | 0.95 |
| E0002 | N0002 | N0001 | Path | 1 | 0.70 |

### Reality Triad
| ID | Subject | Object | Type | Orientation | Weight |
|---|---|---|---|---|---|
| E0010 | N0010 | N0011 | Balance | 0 | 0.75 |
| E0011 | N0011 | N0012 | Balance | 0 | 0.75 |
| E0012 | N0012 | N0010 | Balance | 0 | 0.75 |
| E0013 | N0010 | N0001 | Support | 1 | 0.70 |
| E0014 | N0011 | N0001 | Support | 1 | 0.70 |
| E0015 | N0012 | N0001 | Support | 1 | 0.70 |

### Ethical Frame
| ID | Subject | Object | Type | Orientation | Weight | Slack |
|---|---|---|---|---|---|---|
| E0020 | N0020 | N0021 | Balance | 0 | 0.80 | 0.20 |
| E0021 | N0021 | N0022 | Balance | 0 | 0.80 | 0.20 |
| E0022 | N0022 | N0020 | Balance | 0 | 0.80 | 0.20 |
| E0023 | N0020 | N0030 | Path | 1 | 0.85 | 0.15 |
| E0024 | N0021 | N0030 | Path | 1 | 0.85 | 0.15 |
| E0025 | N0022 | N0033 | Path | 1 | 0.90 | 0.10 |

### Triad-to-Frame
| ID | Subject | Object | Type | Orientation | Weight |
|---|---|---|---|---|---|
| E0030 | N0010 | N0020 | Support | 1 | 0.75 |
| E0031 | N0012 | N0021 | Support | 1 | 0.75 |
| E0032 | N0011 | N0022 | Support | 1 | 0.75 |

### Transformation Cycle
| ID | Subject | Object | Type | Orientation | Weight |
|---|---|---|---|---|---|
| E0040 | N0030 | N0002 | Path | 1 | 0.90 |
| E0041 | N0030 | N0031 | Path | -1 | 0.70 |
| E0042 | N0031 | N0032 | Path | -1 | 0.75 |
| E0043 | N0031 | N0033 | Redemption | 1 | 0.85 |
| E0044 | N0032 | N0033 | Redemption | 1 | 0.80 |
| E0045 | N0033 | N0034 | Path | 1 | 0.90 |
| E0046 | N0034 | N0030 | Path | 1 | 0.90 |
| E0047 | N0032 | N0031 | Corruption | -1 | 0.80 |
| E0048 | N0001 | N0031 | Support | -1 | 0.60 |

### Agent Node
| ID | Subject | Object | Type | Orientation | Weight |
|---|---|---|---|---|---|
| E0100 | N0100 | N0001 | Support | 1 | 0.60 |
| E0101 | N0100 | N0030 | Support | 1 | 0.60 |
| E0102 | N0100 | N0032 | Support | 1 | 0.60 |

---

## Node Count Summary

| Layer | Nodes |
|---|---|
| Reference Coordinates | 2 |
| Dyad | 2 |
| Reality Triad | 3 |
| Ethical Frame | 3 |
| Transformation States | 5 |
| Agent Node | 1 |
| **Total Core** | **16** |

**Edge count:** 36 core edges

---

## Relationship to ADFR

TF3 collapses ADFR's full theological lattice (51 nodes, 70 edges) into the minimal domain-agnostic skeleton.

| TF3 | ADFR |
|---|---|
| Origin | Esse Alpha (N0000) |
| Telos | Esse Omega (N0001) |
| Thriving Force | Esse Agape (N0002) + Eustasis (N0003) |
| Flourishing | Theosis (N0027) + Sublime (N0004) |
| Strength/Beauty/Will | Strength/Beauty/Will (N0010–N0012) |
| Truth/Justice/Mercy | Truth/Justice/Mercy (N0007–N0009) |
| Integrity | Orthodoxy (N0025) + Orthopraxy (N0026) |
| Distortion | Entropy/Chaos/Turbulence (N0013–N0015) |
| Corruption | Rebellion (N0021) + Demonic nodes (N0034–N0037) |
| Redemption | Grace (N0005) + Release (N0031) + Anastasis (N0032) |
| Renewal | Metathesis (N0033) |

*[ADFR reference link — to be added at publication]*

---

*TF3 Knowledge Graph Specification v0.1 — ExoBrain Project*
