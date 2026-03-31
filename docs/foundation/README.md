# Foundation Docs

This folder holds reusable design documents for the identity, memory, and authority substrate underneath ExoBrain.

These documents are intended to outlive any single implementation detail and be adaptable to other projects that need:

- persistent agent identity
- scoped and durable memory
- layered role behavior
- multi-human and multi-agent collaboration
- provenance and delegation
- deterministic grounding via a shared geometry

## Documents

- `BRICKS_AND_MORTAR.md`
  Core engineering doctrine for building systems from stable reusable blocks, explicit connection patterns, and controlled customization.

- `IDENTITY_PRIMITIVES.md`
  Canonical vocabulary and core conceptual model for identity, role, model, memory, spaces, credentials, and governance.

- `TESTING_DEBUGGING_BRIEF.md`
  The current practical brief for hardening ExoBrain into a stable seed before wider community release.

## Usage

These docs should be treated as architecture references, not marketing copy.
When implementation diverges, either:

1. update the code to match the docs, or
2. update the docs if the architecture decision has intentionally changed

Do not let terminology drift silently.
