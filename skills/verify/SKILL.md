---
name: verify
description: Resolve meaningful change uncertainty with relevant evidence.
triggers: before-stop
budget: cheapest sufficient evidence
---

# VERIFY

1. Start from acceptance behavior and behavior that must remain unchanged.
2. Use cheap repository-native evidence first: types, impacted tests, test integrity, and relevant static checks.
3. Verify behavior rather than execution or coverage alone.
4. Inspect changed tests for deletion, skipping, weakened assertions, wider tolerances, unjustified output changes, and mocks that bypass behavior.
5. Add boundary cases, negative authorization cases, property cases, targeted mutation, integration checks, or E2E only for specific remaining uncertainty.
6. Do not add a test framework or run expensive checks without a concrete reason.
7. Treat every check as evidence rather than truth.

Stop when remaining uncertainty is acceptably low and another check is unlikely to change the acceptance decision. Report concrete evidence, not a confidence score.
