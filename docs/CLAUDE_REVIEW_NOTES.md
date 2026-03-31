# Claude Review Notes

## Purpose

This document is a reviewer handoff for Claude as the main implementation agent.
It captures the current product intent, the remaining technical concerns found in review, and the questions that need explicit product decisions before implementation hardens in the wrong direction.

## Product Intent

ExoBrain is not just a knowledge graph or a note store.
It is becoming a persistent multi-agent identity, memory, and coordination substrate that can sit underneath:

- human + agent collaboration on projects
- teams of agents working with shared and private memory
- long-lived supporting agents that remember mistakes and corrections
- cross-harness agent portability across frameworks like OpenClaw, NanoClaw, Hermes-Agent, and similar systems
- persistent NPCs, personas, digital twins, and ideology/personality simulations
- a memory/identity core that survives beyond individual code repos and file trees

This means the system needs to treat identity, authority, provenance, permissions, auditability, and memory boundaries as first-class concerns, not just convenient metadata.

## Current Review Summary

A number of earlier implementation issues have been fixed:

- SQLite row mapping now aligns much better with the TypeScript model.
- `db_scope` now actually affects `db_read` and `db_write`.
- ArcadeDB node upsert now persists anchor/slack/confidence-bound metadata.
- the SQLite embedding dimension comment now matches the Postgres embedding shape.
- `GRAPH_BACKEND=neo4j` is now explicitly rejected instead of silently using the wrong adapter.
- key revocation now allows owner override in both DB adapters.

The codebase is moving in the right direction.
The remaining concerns are less about basic correctness and more about security semantics, privilege delegation, and production readiness for a persistent multi-agent system.

## Highest-Priority Concerns

### 1. Key issuance can still over-grant authority

The system currently checks whether the issuer can grant access to the requested spaces, but it does not enforce that requested token permissions are a subset of the issuer's own permissions.

Impact:

- a non-owner user session can issue a key with `admin`
- that agent token can then pass token-level checks even if the human issuer never had `admin`
- this violates the documented model that scopes are limited to what the issuer holds

This is the most important security issue currently visible in the implementation.

### 2. Setup/bootstrap is still not atomic

The early password validation fix helps, but setup can still partially succeed:

- owner principal created
- later credential update fails due to uniqueness or DB error
- or API key issuance fails
- instance now reports initialized and blocks re-run

For a one-shot bootstrap flow, this is dangerous and user-hostile.
It needs a transaction or compensating rollback logic.

### 3. Permission enforcement is inconsistent across tools/routes

Some operations now enforce token-level permissions (`db_read`, `db_write`), but others still rely only on ACL or only on authentication.

Examples:

- `space_create` trusts token `admin`
- `space_update` and `space_archive` rely on ACL only
- `space_get` ignores token permissions
- REST key routes authenticate but do not explicitly require `manage` or `admin`

If token permissions are part of the trust model, they must be enforced consistently.
If they are advisory only, that needs to be made explicit and the current docs changed.

### 4. SQLite fresh-start behavior is still unclear

The SQLite adapter opens a database file but does not apply schema automatically.

If the intended contract is "SQLite must be seeded before server startup", the docs and setup path should make that explicit.
If the intended contract is "standalone embedded mode should just work", startup should verify/apply schema.

### 5. Transport/auth model needs to be intentional, not accidental

SSE support was added, which is useful for compatibility.
The `/message?sessionId=...` leg currently trusts possession of the session ID after authenticated `/sse` setup.

That may be fine depending on the MCP transport design, but it should be a deliberate trust model, documented and reviewed as such.

## Architectural Suggestions

### Make authority explicit at three levels

Right now authority is split across:

- principal identity
- token permissions
- space ACL

That is correct in principle, but the enforcement boundary is inconsistent.
I suggest formalizing a model like:

- principal identity: who you are
- token permissions: what this credential is allowed to attempt
- ACL: what the principal is allowed to do in a target space

Then require all three to pass where relevant:

- token scope gate first
- space ACL second
- operation-specific ownership/admin rule third if needed

### Separate human account permissions from issued token permissions

Sessions currently synthesize permissions from principal type rather than stored grants.
That may be acceptable for now, but it will not scale cleanly to:

- multiple human roles
- team-scoped admins
- project-level managers
- constrained operators

If the long-term design includes multi-human and multi-team collaboration, it would help to decide now whether principal permissions are:

- derived only from ACL + principal type, or
- stored directly as grants/roles, with sessions reflecting them faithfully

### Treat key issuance as delegation, not just credential minting

For this product, issuing a key is effectively spawning an autonomous actor.
That implies stricter semantics:

- issuer must hold a delegation-capable permission like `manage` or `admin`
- granted permissions must be subset of issuer capabilities
- optional policy to prevent humans from issuing keys broader than the spaces they actively manage
- audit trail should clearly capture issuer, intended role, and purpose

### Model agent identity separately from credentials

The current design creates an agent principal per key issuance.
That may be fine short-term, but long-term it may become noisy.

Questions to consider:

- should an agent have one stable principal with rotating credentials?
- should a harness instance have a principal, and each issued key be a credential under it?
- should "agent persona" and "runtime credential" be distinct concepts?

For persistent memory and identity, stable agent identity is likely more useful than one-principal-per-key.

### Clarify memory semantics

If this is the substrate for persistent agents, NPCs, and digital twins, memory needs stronger semantics than "generic entries in spaces".

Potential future categories:

- core identity memory
- autobiographical/episodic memory
- procedural memory
- corrective memory
- project/task memory
- shared team memory
- immutable provenance memory

This does not all need to be implemented now, but the model should leave room for it.

## Questions For Product Clarification

These should be answered before Claude hardens the next implementation layer.

1. Can non-owner humans issue agent keys at all?
2. If yes, what permission is required: `manage`, `admin`, or something more specific like `delegate`?
3. Should granted key permissions always be a strict subset of the issuer's current effective permissions?
4. Should humans ever be able to mint agent keys with broader permissions than their session token currently has?
5. Is a user account meant to have stable global roles, or should everything be space/ACL-derived?
6. Should agent identity be stable across key rotation, or is one principal per key intentional?
7. Is SQLite supposed to be a serious embedded deployment mode or just a lightweight dev/test path for now?
8. Should setup be re-runnable until fully successful, or is it intended to be a strict one-shot transaction?
9. Should `/message` in the SSE flow also require bearer auth, or is session-ID possession intentionally sufficient?
10. Are spaces the long-term top-level isolation primitive, or do you expect another layer above them for tenants/workspaces/organizations?
11. For digital twins and persistent personas, do you expect identity/memory immutability controls beyond normal space ACLs?
12. Do you want "memory of mistakes/corrections" to become an explicit first-class retrieval path instead of just an `entry_type`?

## Concrete Suggestions For Claude

### Short-term implementation priorities

1. Fix permission subset enforcement for key issuance in both MCP and REST paths.
2. Make setup atomic with DB transactions where supported.
3. Add explicit authorization checks for key-management routes and space-management operations.
4. Decide and document whether token permissions are authoritative or advisory.
5. Add startup/schema verification for SQLite or document pre-seeding as mandatory.

### Testing priorities

Tests should target behavior, not just compilation.

Highest-value test cases:

- non-owner session cannot issue `admin` key
- key permission subset enforcement works across REST and MCP
- owner can revoke any issued key
- `db_scope` works across session-scoped tool calls
- setup failure does not leave partially initialized state
- SQLite backend returns correctly shaped records for auth, keys, spaces, and memory
- token permission gates and ACL gates both apply where expected
- SSE session flow behaves correctly and rejects missing/invalid session IDs

### Debugging priorities

Use scenario-driven debugging rather than isolated unit fixes.

Suggested scenarios:

1. fresh SQLite bootstrap from empty file
2. owner setup with username/password and admin key issuance
3. non-owner login, then attempt privileged key issuance
4. agent token with read-only scope trying write/manage/admin operations
5. shared-space collaboration between one human and two agents

## Suggested Direction For The Next Document

The next Claude-facing working document should probably not be a generic bug list.
It should be a design-and-execution brief with:

- intended trust model
- principal/token/ACL semantics
- bootstrap invariants
- test matrix
- debugging scenarios
- phased implementation plan

That will be more useful than piecemeal fixes because the remaining risks are mostly policy drift, not syntax drift.

## Reviewer Note

The project intent is strong and differentiated.
The main thing to protect now is semantic integrity:

- who an agent is
- what it is allowed to do
- what it is allowed to remember
- what it is allowed to share
- how that changes over time

If those semantics stay coherent, the rest of the platform can grow into a durable substrate for multi-agent work, persistent identities, and long-lived memory across many different applications.
