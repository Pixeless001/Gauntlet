---
name: optimize
description: Improve a measured dominant cost without unnecessary redesign.
triggers: explicit-performance-objective
budget: one baseline and one comparison
---

# OPTIMIZE

1. Measure the relevant runtime, latency, memory, query, build, test, or context cost before changing it.
2. Identify the dominant cost and its smallest cause.
3. Prefer local deletion and simplification over architectural redesign.
4. Preserve behavior unless the task explicitly permits a change.
5. Reject complexity that buys a negligible improvement.
6. Measure again using the same conditions and compare with the original baseline.

Stop once the dominant relevant cost is addressed. Do not optimize smaller costs without evidence they matter.
