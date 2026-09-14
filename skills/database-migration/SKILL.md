---
name: database-migration
description: Plan and verify backward-compatible schema and data migrations.
budget: one expand-migrate-contract sequence
---
# Database migration
Identify readers, writers, constraints, data volume, lock behavior, rollback limits, and deployment order. Prefer expand-migrate-contract. Make backfills restartable and observable, verify old and new application versions during rollout, and never describe a destructive rollback as safe without evidence.
