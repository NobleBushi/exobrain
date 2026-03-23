# ExoBrain Deployment Guide

## Start Here

This document is the AI-agnostic deployment guide for ExoBrain. Any capable AI assistant can read this document and guide a user through initialization. Claude is the preferred interpreter but not the required one.

If you are using Claude Code, see `CLAUDE.md` for Claude-specific instructions. This document is the authoritative source for deployment logic.

> **Note (v0.2):** Backend options have been updated. ArcadeDB is now the primary recommended graph backend. See Step 3.

---

## What Is ExoBrain?

ExoBrain is a knowledge graph system that provides geometric grounding for any knowledge domain. It combines:

- A **graph layer** (ArcadeDB or Neo4j) for relational, traversable knowledge
- A **database layer** (PostgreSQL + pgvector or SQLite) for scoped, secured contextual knowledge
- An **MCP interface** exposing both layers as callable tools for AI agents and systems

It can be deployed as a standalone system or integrated into a larger agent infrastructure. It is designed to scale from a Raspberry Pi to a multi-node server without architectural changes.

---

## Before You Begin

You will need:
- Docker (recommended) or manual installation capability
- At minimum 4 GB RAM available for the deployment
- A terminal / command line interface

The AI assistant will help you select and configure the right components. You do not need to understand the full architecture before starting.

---

## Deployment Questions

---

### Step 1: Deployment Type

**Question:** Is this a standalone deployment or will it connect to an existing system?

- **Standalone** *(default, recommended for first deployment)*
  ExoBrain runs independently. All knowledge stays local to this instance.

- **Connected**
  ExoBrain connects to an existing agent infrastructure or shared knowledge base.

*If unsure, choose Standalone. You can connect later.*

---

### Step 2: Hardware

**Question:** Is this the final hardware ExoBrain will run on?

- **Yes — scan this device**
  The assistant will check available resources and recommend the appropriate configuration.

- **No — describe the target device**
  Provide specs for the target device.

*Default: configure for this device.*

---

### Step 3: Backend Selection

Based on your hardware scan or description, the assistant will recommend one of:

**Option A: ArcadeDB + PostgreSQL** *(recommended)*
Full capability. Graph traversal via ArcadeDB (Apache 2.0, OpenCypher, Bolt protocol), semantic memory via PostgreSQL + pgvector. Best for systems that will grow or connect to other tools. Reference architecture.

**Option B: ArcadeDB + SQLite** *(embedded/minimal)*
Lightweight. ArcadeDB runs embedded (no separate container). SQLite for the database layer. Best for Raspberry Pi, 4 GB hardware, or single-user personal deployments. No replication.

**Option C: Neo4j Community + PostgreSQL** *(Neo4j alternative)*
For users who prefer the Neo4j ecosystem. GPL 3 license. No clustering without Enterprise license, but ExoBrain's access control is at the MCP layer so this is not a limitation.

**Option D: Apache AGE + PostgreSQL** *(Postgres-only)*
Single database container. Cypher queries require SQL-wrapper syntax. Good if you want to minimize running services. Note: reduced upstream development activity since 2024.

*The assistant will explain tradeoffs based on your hardware and use case before you decide.*

---

### Step 4: Optional — NanoClaw Integration

**Question:** Would you like to install NanoClaw for agentic connectivity?

NanoClaw enables ExoBrain to participate in a multi-agent network — allowing AI agents to read from and write to the knowledge graph as part of their reasoning.

- **Yes** — install NanoClaw alongside ExoBrain
- **No** *(default)* — standalone ExoBrain only

*NanoClaw (and compatible harnesses like Hermes-Agent) can be added later.*

---

### Step 5: Optional — Remote Access

**Question:** Do you want ExoBrain available everywhere, not just on this device?

- **Yes** — configure Tailscale or equivalent for secure remote access
- **No** *(default)* — local access only

---

### Step 6: Optional — AI-Assisted Deployment Help

**Question:** Would you like additional AI assistance during setup?

- **Yes** — point to or upload the ExoBrain documentation
- **No** — proceed with this guide only

---

## After Initialization

When deployment is complete, ExoBrain will:

1. Report the active backend configuration
2. Confirm geometric integrity of the seed graph
3. Display the ExoBrain agent status
4. Provide connection details for MCP tool access

The knowledge graph will be pre-populated with:
- Core geometry nodes (locked positions)
- Core edges (fixed relationships)
- Documentation layer
- Extension guide
- Validation rules
- Default spaces: `public`, `shared`, `private`

---

## Security Defaults

```
Owner (you)
  → Workspace (project or team scope)
    → Agent (AI assistant permissions)
      → User (individual access)
        → Conversation (session scope)
```

Each level delegates only what it holds. Nothing escalates automatically. All writes are audited from initialization.

---

## For AI Assistants Reading This Document

1. Read `geometry.md` first
2. Walk through Steps 1–6 in sequence
3. Recommend defaults unless the user has specific reasons to deviate
4. Scan hardware when the user confirms this is the final device
5. Explain tradeoffs in plain language before each decision
6. Confirm initialization success by checking geometric integrity of the seed

---

*Version 0.2 — Updated 2026-03-23 (ArcadeDB as primary graph backend)*
*ExoBrain Project*
