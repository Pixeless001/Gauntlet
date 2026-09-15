---
name: implement
description: Build the smallest clear change that satisfies the task.
triggers: implementation
budget: task-scoped changes only
---

# IMPLEMENT

Use this decision order:

1. Add nothing when the requirement is already satisfied or speculative.
2. Search for and reuse the repository capability that already owns the responsibility.
3. Prefer modifying owning code over adding wrappers, managers, factories, adapters, layers, or helpers.
4. Prefer language, standard-library, framework, browser, database, and platform capabilities over custom infrastructure.
5. Reuse installed dependencies before adding packages.
6. Only then add the minimum new code required by current behavior.

Follow strong repository conventions for validation, errors, persistence, logging, HTTP, testing, exports, and placement. Preserve correctness, security, accessibility, data integrity, required error handling, and explicit acceptance behavior.

Do not duplicate capabilities, add hypothetical flexibility, broaden public APIs, refactor unrelated code, or weaken tests. Verify unfamiliar APIs instead of guessing. Prefer straightforward readable code over clever compression.

Stop when the smallest justified implementation is complete.
