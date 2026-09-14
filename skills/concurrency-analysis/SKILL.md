---
name: concurrency-analysis
description: Analyze races, ordering, cancellation, and shared-state safety.
budget: one explicit interleaving model and targeted stress check
---
# Concurrency analysis
List shared state, owners, atomicity boundaries, ordering guarantees, cancellation paths, and failure cleanup. Write the harmful interleaving before changing code. Prefer existing synchronization primitives and verify boundary timing deterministically where possible; do not treat one successful stress run as proof.
