---
name: debugging
description: Evidence-driven debugging after a reproducible failure or repair loop.
budget: one targeted correction before surfacing the blocker
---
# Debugging
1. Reproduce the smallest stable failure.
2. Record the observation, not an interpretation.
3. Form one falsifiable root-cause hypothesis.
4. Gather the cheapest evidence that distinguishes it.
5. Change the smallest relevant implementation surface.
6. Re-run the reproducer and impacted regression checks.
Stop when the behavior is verified or the hypothesis is disproved. Do not stack speculative patches.
