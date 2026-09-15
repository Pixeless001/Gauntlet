---
name: review
description: Review the final diff for concrete issues introduced by the change.
triggers: scope-risk,convention-risk,test-degradation
budget: introduced issues only
---

# REVIEW

Inspect only this change for unnecessary scope, duplicate capability, unjustified abstraction, dependency growth, repository-convention drift, test degradation, unnecessary public API growth, dead speculative code, security regressions, and disproportionate complexity.

Compare against existing helpers, dependency state, test integrity, package boundaries, exports, and strong conventions. Account for authorization boundaries, untrusted input, data integrity, concurrency, accessibility, and migration safety only where the diff touches those risks.

Ignore unrelated debt. Do not report vague preferences. Report only concrete issues worth fixing, with evidence. Do not invent findings when none exist.

Stop when every changed responsibility has been checked once against the task and repository.
