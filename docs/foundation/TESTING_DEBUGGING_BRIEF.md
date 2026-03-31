# Testing And Debugging Brief

## Purpose

This document defines the immediate hardening priorities for ExoBrain as a seed implementation.

The goal is not broad feature coverage.
The goal is to verify that the current primitives are trustworthy enough to build on.

## Hardening Goal

Before broader community exposure, the implementation should be reliable in these areas:

- bootstrap
- identity and authentication
- credential delegation
- space isolation
- permission enforcement
- provenance
- memory continuity

## Current Risk Areas

### 1. Delegation / key issuance

Key issuance currently needs stricter tests around:

- permission subset enforcement
- space subset enforcement
- owner override behavior
- issuance and revocation audit correctness

### 2. Bootstrap reliability

Setup must not leave a partially initialized instance.

Key risk cases:

- duplicate username
- duplicate email
- DB write failure after owner creation
- API key issuance failure

### 3. Permission consistency

Token permissions, ACLs, and role-like behavior need scenario tests.
The system should not accidentally over-authorize through inconsistent enforcement paths.

### 4. SQLite embedded mode

SQLite needs clear behavior under:

- fresh empty DB
- seeded DB
- auth/key/space reads
- memory serialization and deserialization

### 5. Transport behavior

Both StreamableHTTP and SSE flows should be tested for:

- auth
- session creation
- session reuse
- invalid session rejection

## Highest-Value Scenario Tests

### Bootstrap

1. Fresh instance, valid setup, returns usable owner credential.
2. Setup with weak password fails before initialization state changes.
3. Setup with duplicate username/email does not leave partial initialized state.

### Auth

1. Password login succeeds with valid credentials.
2. Password login fails cleanly with invalid credentials.
3. Session logout revokes token.
4. Disabled principal cannot authenticate.

### Key Delegation

1. Owner issues admin-capable key successfully.
2. Non-owner cannot issue a key broader than their own permissions.
3. Key cannot be scoped to spaces the issuer does not hold.
4. Issuer can revoke their own key.
5. Owner can revoke any key.

### Space Isolation

1. Private space is invisible to unauthorized principals.
2. Shared/public templates behave as documented.
3. Archived spaces reject new writes and remain readable only per intended policy.

### Memory

1. `db_scope` changes default target for `db_read` and `db_write`.
2. Read-only token cannot write.
3. Write-capable token cannot read/write outside scoped spaces.
4. Correct serialization for tags, metadata, kg links, and timestamps under SQLite and Postgres.

### Audit / Provenance

1. Durable writes produce audit entries with principal and target.
2. Non-owner audit reads remain bounded.
3. Space-managing principals can read space audit if that is the intended policy.

### Transport

1. StreamableHTTP session lifecycle works across POST/GET/DELETE.
2. SSE connect requires auth.
3. SSE post-message rejects invalid or missing session IDs.

## Recommended Near-Term Test Strategy

Because the project does not yet appear to have a formal automated test suite, use a layered approach:

### Layer 1: Build and schema sanity

- `npm run build`
- seed schema verification
- backend startup sanity checks

### Layer 2: Scenario scripts

Create repeatable scripts for:

- bootstrap flow
- auth flow
- key issuance flow
- scoped memory flow
- cross-principal access flow

These do not need to be sophisticated at first.
They just need to be deterministic and repeatable.

### Layer 3: Automated behavioral tests

Once the trust model is settled, add a proper test harness around:

- auth
- permissions
- DB adapters
- API routes
- tool behavior

## Suggested Debug Order

1. bootstrap atomicity
2. key issuance permission subset enforcement
3. REST/MCP permission consistency
4. SQLite fresh-start behavior
5. SSE trust model and session handling

## Practical Question For Claude

When debugging, optimize for preserving the primitives, not just making failing cases green.

If a quick fix makes the model less clear in any of these areas:

- identity
- delegation
- provenance
- scoped memory
- durable growth

then it is probably the wrong fix.

## Bottom Line

The seed is ready to evolve only if its boundaries are trustworthy.

The most important tests are the ones that prove:

- an actor remains itself
- authority is bounded
- memory is scoped
- history is attributable
- growth does not destroy grounding
