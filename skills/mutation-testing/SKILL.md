---
name: mutation-testing
description: Test whether changed tests distinguish meaningful changed-code behavior.
budget: 10 mutants or 60 seconds, whichever comes first
---
# Mutation testing
Mutate changed executable lines only. Prefer boundary, boolean, conditional, and return-value mutations tied to acceptance criteria. Run only impacted tests. Revert every mutation. A survivor is evidence of untested behavior, not automatic proof of a bug. Report operator, location, relevant test command, and interpretation; stop at the budget.
