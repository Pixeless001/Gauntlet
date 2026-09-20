---
name: investigate
description: Find and support the root cause before implementation.
triggers: repeated-failure,unclear-root-cause
budget: shortest relevant proof path
---

# INVESTIGATE

1. Reproduce or directly observe the failure through a test, runtime result, trace, log, profile, or concrete execution path.
2. When exact reproduction is unavailable, preserve uncertainty and identify the strongest proof.
3. Trace the shortest path from symptom to the earliest causal failure. Read participating code before expanding outward.
4. Separate facts from assumptions. Resolve material assumptions through code, tests, types, configuration, dependency state, runtime output, history, logs, or measurements.
5. Do not add retries, fallbacks, null checks, timeouts, or error suppression merely to hide a symptom.
6. Check nearby helpers, invariants, conventions, and tests before inventing machinery.
7. Discard contradicted hypotheses and avoid unrelated exploration.

Stop when you can state what fails, why it fails, and where the smallest correct change belongs.
