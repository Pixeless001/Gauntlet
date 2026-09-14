---
name: property-testing
description: Verify parsers, serializers, transformations, validators, and numerical logic.
budget: one focused property suite
---
# Property testing
Identify invariants before generators. Prioritize boundaries, malformed values, round trips, idempotence, and preservation properties. Use the repository's existing property framework when present; otherwise prefer a small deterministic table unless adding a dependency is explicitly justified. Record the seed for every failure.
