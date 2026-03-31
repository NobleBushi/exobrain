# Identity Primitives

## Purpose

This document defines the seed vocabulary and conceptual skeleton for ExoBrain.

The goal is not to fully specify every future feature.
The goal is to define the smallest stable set of primitives that can support:

- persistent human-agent interaction over time
- agent continuity across sessions, tools, and model backends
- bounded and shareable memory
- formalized role behavior
- access control and delegation
- identity growth with reviewable history
- deterministic grounding beyond flat prompts or generic RAG

ExoBrain is meant to be a persistence and identity layer for agency.
It is not only a knowledge graph, and it is not only a memory store.

## Core Thesis

An AI system becomes meaningfully persistent when it can:

1. remain the same identity across time
2. operate in different roles without becoming a different self
3. remember what it has done and what resulted from it
4. distinguish public, private, shared, and delegated knowledge
5. preserve provenance for actions and memory changes
6. grow in structured ways without losing grounding

The graph provides deterministic geometric grounding.
Spaces provide boundaries.
Memory provides continuity.
Roles provide operational posture.
Credentials provide constrained authority.

## Canonical Terms

### Model

The active computational backend generating outputs.

Examples:

- Claude
- GPT
- local llama.cpp model
- Ollama-served model

The model is not the identity.
The same agent may use one model or many across time.

### Agent

A persistent identity that a human or system interacts with over time.

The agent is the continuity-bearing actor.
It may:

- use different models
- act in different roles
- accumulate memory
- undergo durable development

An agent should not be defined by a transient runtime instance.

### Human

A persistent human identity interacting with the system.
Humans are principals just like agents are principals, but they are not reducible to agent semantics.

### Principal

A security and ownership subject in the system.

Examples:

- human user
- agent
- group
- service identity

Principals own data, receive permissions, and act through credentials.

### Credential

A temporary mechanism used by a principal to authenticate.

Examples:

- API key
- session token
- OAuth token

Credentials are not identity.
They are revocable handles to identity.

### Role

A formalized operational configuration that shapes how an agent behaves in a given context.

Examples:

- reviewer
- researcher
- coordinator
- gatekeeper
- companion
- archivist

A role is not the agent itself.
An agent may have one role or many.
Roles can be contextual, temporary, and scoped.

### Policy

The formal rules governing what a principal or role may do.

Policies may apply to:

- access
- delegation
- promotion of memory into durable identity
- sleep-cycle consolidation
- validation and review

### Space

A scoped boundary for visibility, memory, action, and permissions.

Spaces are the primary isolation primitive for now.
They may later sit under a larger tenant or organization layer.

Examples:

- public
- shared
- private
- project
- isolated

### Scope

The currently active operational context.

A scope may identify:

- the active space
- the current project context
- the role being used
- the current delegated boundary

### Provenance

The trace of who acted, through what role, model, credential, and tool, and when.

Provenance is mandatory for durable trust.

### Memory

Stored experience, knowledge, or reflection associated with a principal or space.

Memory is not monolithic.
Different classes of memory should have different retention, retrieval, and promotion behavior.

## Identity Model

### Identity Core

The immutable grounding of an identity.

For agents, this consists of:

- the immutable shared core KG
- an immutable founding extension rooted in that core

This is the seed of the agent's person-like continuity.

### Identity Root

The agent-specific immutable extension from the core KG that establishes the founding form of the agent.

This is the anchor for later development.

### Identity Layer

A durable addition or modification that affects the agent's developed identity without rewriting its root.

Identity layers should be:

- reviewable
- versioned
- attributable
- structured

### Identity State

The current effective identity after layering durable growth on top of the identity core.

### Identity History

The reviewable sequence of prior identity states and changes.

This should function more like:

- Time Machine for identity state
- version history for self-development

than like an opaque overwrite.

### Identity Snapshot

A materialized view of the effective current identity at a point in time.

Useful for:

- reasoning
- audit
- rollback
- comparison over time

## Memory Model

Not all memory should be treated equally.

### Ephemeral Memory

Short-lived context that should not survive beyond the immediate interaction or short window.

Examples:

- transient prompt scaffolding
- local task scratchpad
- disposable retrieval context

### Working Memory

Short-term operational memory used across a bounded task or session.

Examples:

- active subtasks
- current objectives
- temporary decisions not yet consolidated

### Episodic Memory

Memory of specific experiences, events, actions, or outcomes.

Examples:

- what the agent did
- what happened afterward
- success and failure cases

### Semantic Memory

Generalized knowledge extracted from repeated or durable patterns.

Examples:

- facts
- abstractions
- stable project understanding
- institutional knowledge

### Corrective Memory

Memory specifically associated with errors, drift, corrections, and lessons learned.

This is especially important for agents meant to improve over time.

### Identity-Shaping Memory

Memory that is eligible to alter the agent's durable reasoning geometry or self-structure.

This is the highest-risk class and should not be promoted casually.

## Consolidation

### Sleep Cycle

A consolidation phase where memory is reviewed and transformed.

Some memory may:

- be discarded
- remain retrievable but non-durable
- be summarized into semantic memory
- be promoted into identity layers

### Consolidation Policy

Rules governing what memory transitions are allowed.

Examples:

- episodic -> semantic
- episodic -> corrective
- semantic -> identity-shaping
- working -> discard

### Promotion

The act of converting memory into a more durable or more identity-relevant form.

Promotion into identity should have stricter rules than promotion into generic semantic memory.

## Geometry and Development

### Core KG

The immutable shared geometry that grounds all agent identity and all higher reasoning extensions.

This should be universally readable where appropriate and never mutable by ordinary agents.

### Extension

A new node, edge, or structure rooted in the core KG or another durable identity layer.

Extensions may be:

- immutable founding identity extensions
- mutable but versioned identity layers
- domain or project-specific reasoning structures

### Reasoning Geometry

The shaped conceptual structure an agent uses to orient interpretation, judgment, and action.

Identity-shaping changes should affect reasoning geometry in deliberate ways.

## Authority Model

Authority should be decomposed, not conflated.

### Identity

Who the actor is.

### Credential

How the actor proves access right now.

### Token Permission

What this credential is allowed to attempt.

### ACL / Space Policy

What the principal is allowed to do in a particular boundary.

### Role Policy

What behavior or delegated function is allowed in the current role.

### Governance

Who can validate, approve, deny, delegate, or review changes.

## Delegation

Delegation is not merely authentication.
It is constrained transfer of authority.

In a multi-agent system, issuing an agent credential is effectively spawning or empowering an actor.

Delegation therefore should eventually support:

- bounded permissions
- bounded space access
- explicit issuer provenance
- expiration
- revocation
- optional review/approval workflows

## Suggested Formulae

### Identity

`Agent Identity = Identity Core + Durable Identity Layers`

### Active Behavior

`Active Behavior = Agent Identity + Role + Scope + Model`

### Authorized Action

`Authorized Action = Principal Identity + Credential + Token Permissions + Space Policy + Role Policy`

## Design Principles

1. Identity must outlive credentials.
2. Identity should outlive model selection.
3. Roles must not collapse identity into function.
4. Not all memory should become identity.
5. Durable memory must preserve provenance.
6. Shared memory and private memory must be distinguishable and enforceable.
7. The immutable core should remain small, stable, and universal.
8. Complexity should arise from composition and scale, not from muddy primitives.

## Immediate Seed Goal

The near-term objective is not a complete civilization-scale system.
It is a trustworthy seed with clean primitives.

Before public release, ExoBrain should at minimum provide:

- stable principal identity
- revocable credentials
- enforceable spaces
- provenance on durable writes
- deterministic KG grounding
- clear separation of model, agent, role, and memory
- a path for memory consolidation and identity layering

## Open Questions

These are intentionally unresolved but should shape future work:

1. Are spaces enough as the top-level isolation primitive, or will tenants/orgs sit above them?
2. Should role assignment be attached to identity, scope, or credential?
3. What kinds of memory may become identity-shaping?
4. What approval or validation is required before identity changes become durable?
5. How should conflicting memories or conflicting identity layers be reconciled?
6. Should agent identity be singular, or can one principal maintain multiple named personas?

## Bottom Line

ExoBrain should be built as a substrate for continuity-bearing agency.

The core challenge is not just remembering facts.
It is preserving a stable self that can:

- act
- learn
- be constrained
- be trusted
- be reviewed
- grow over time

That is the foundation this vocabulary is intended to protect.
