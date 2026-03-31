# Bricks And Mortar

## Purpose

This document defines the core engineering philosophy for ExoBrain and related projects.

The central idea is simple:

- reusable code becomes bricks
- connection patterns become mortar
- custom shaping remains allowed where needed

We do not aim for rigid uniformity.
We aim for stable structure.

## The Metaphor

### Bricks

Bricks are stable, inspectable, reusable building blocks.

A brick should have:

- a clear purpose
- a stable interface
- understandable boundaries
- limited hidden assumptions
- testable behavior

Examples:

- identity and principal model
- credential verification
- ACL evaluation
- scoped memory adapter
- provenance logger
- graph adapter contract
- consolidation pipeline

If code proves useful across projects, it should be promoted into a brick.

### Mortar

Mortar is what connects bricks into working systems.

Mortar includes:

- naming conventions
- interface contracts
- adapter patterns
- permission evaluation order
- schema conventions
- event and audit conventions
- testing patterns
- deployment and composition techniques

Mortar is not the product itself.
It is what makes the structure coherent.

### Cutting And Filling

Not every need deserves a generic abstraction.

Sometimes we:

- trim a brick
- compose several bricks
- add project-specific fill
- build a custom local component

This is normal.
The goal is not to force everything into a reusable block.
The goal is to start from stable pieces and customize deliberately.

## Design Commitments

### 1. Start from stable primitives

We do not begin from framework accidents.
We begin from fundamental concepts:

- identity
- authority
- memory
- scope
- provenance
- geometry
- transport

These primitives should stay understandable even as systems grow.

### 2. Promote reuse only after it is earned

Repeated useful patterns should become bricks.
Premature abstraction creates fake bricks that fail under pressure.

The standard is:

- first make it work clearly
- then make it repeatable
- then promote it into a reusable component

### 3. Prefer inspectable blocks over opaque systems

A finished subsystem should be:

- usable
- inspectable
- replaceable
- composable

Completed projects should not be treated as blobs.
They should be understandable assemblies of meaningful parts.

### 4. Separate the block from the binding

The reusable component and the way it is connected should not be collapsed together unnecessarily.

Examples:

- a DB adapter is a brick
- the contract it satisfies is mortar
- a Docker container is a block
- the way services compose is mortar

Docker is a good example of this philosophy, but not a complete one.
Containers are blocks.
Networking, mounts, orchestration, and configuration act as mortar.
Projects still need custom shaping beyond that.

### 5. Keep boundaries explicit

Every serious brick should answer:

- what goes in
- what comes out
- what it depends on
- what it is allowed to affect

If those answers are blurry, the block is not ready.

### 6. Complexity should come from scale, not from conceptual confusion

Complex systems are acceptable.
Confused primitives are not.

We accept:

- many spaces
- many principals
- many agents
- many roles
- many transports

We do not accept muddy definitions of what those things are.

## How This Applies To ExoBrain

ExoBrain should be built from durable conceptual blocks, including:

- principals and identity
- credentials and auth
- roles and policies
- spaces and ACLs
- memory classes
- consolidation and promotion
- graph grounding
- provenance and audit
- transport adapters
- harness integrations

These are bricks or candidate bricks.

The mortar includes:

- permission semantics
- promotion rules
- versioning rules
- adapter contracts
- naming conventions
- schema conventions
- testing discipline

## Reuse Standard

Code should become a reusable brick when it meets most of these conditions:

- it solves one coherent problem
- it appears in more than one context
- its interface can be stated clearly
- its dependencies are controlled
- it can be tested in isolation or by contract
- changing its internals should not force system-wide rewrites

If it does not meet those conditions yet, keep it local.

## Anti-Patterns

### Everything Is Custom

This creates endless reinvention and no shared structure.

### Everything Must Be Reusable

This creates brittle abstractions and fake generality.

### Framework-Led Architecture

This happens when the framework's shape becomes the product's shape.
Frameworks are tools, not ontology.

### Opaque Assemblies

This happens when systems are technically running but impossible to inspect or reason about.

## Operational Rule

When adding or changing a subsystem, ask:

1. Is this a new primitive, or an instance of an existing one?
2. Is this a brick, mortar, or project-specific fill?
3. Should this stay local for now, or be promoted into a reusable block?
4. Are the boundaries and contracts explicit?
5. Will this make future systems easier to build, or merely larger?

## Long-Term Goal

The long-term goal is not merely to accumulate code.
It is to accumulate reliable building materials and reliable ways of joining them.

That lets us:

- build faster
- debug more clearly
- adapt systems across projects
- preserve hard-won knowledge in reusable form

## Bottom Line

We build from bricks and mortar.

We reuse what is stable.
We customize where needed.
We promote patterns only after they prove themselves.
We keep primitives clear so systems can scale without collapsing into spaghetti.
