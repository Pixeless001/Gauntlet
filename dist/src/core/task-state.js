import { z } from "zod";
import { activitySchema, taskContractSchema } from "./events.js";
import { DEFAULT_INTERVENTION_BUDGET } from "./policy.js";
import { initialUncertainty, uncertaintyKinds } from "../control/uncertainty.js";
import { assessRisk } from "./risk.js";
import { createWorld } from "../work/world.js";
import { fingerprint } from "../work/graph.js";
const stringList = (max, length = 500) => z.array(z.string().max(length)).max(max);
const uncertaintySchema = z.object(Object.fromEntries(uncertaintyKinds.map((kind) => [kind, z.enum(["open", "partial", "resolved", "irrelevant"])])));
const checkpointSchema = z.object({ id: z.string(), parentId: z.string().optional(), kind: z.enum(["task", "understanding", "investigation", "decision", "implementation", "verification"]), status: z.enum(["active", "validated", "rejected"]), summary: z.string(), constraints: stringList(50), decisions: stringList(50), relevantFiles: stringList(200), relevantSymbols: stringList(200), proofRefs: stringList(200), rejectionReason: z.string().optional(), createdFromEvent: z.number().int().nonnegative(), resolves: z.array(z.enum(uncertaintyKinds)).max(20) });
const executionEventSchema = z.object({ index: z.number().int().nonnegative(), type: z.enum(["file_read", "file_write", "search", "command", "failure", "test_result", "diff_change", "decision_signal"]), target: z.string().optional(), outcome: z.string().optional(), proofRef: z.string().optional() });
const selectionTraceSchema = z.object({ event: z.number().int().nonnegative(), trigger: z.string(), candidates: stringList(100), selected: stringList(100), activations: z.array(z.object({ id: z.string(), kind: z.enum(["skill", "context", "proof", "capability", "reference", "graph-expansion"]), resolves: z.array(z.enum(uncertaintyKinds)), uncertainty: z.enum(uncertaintyKinds), level: z.number().int().min(0).max(5), cost: z.enum(["tiny", "low", "medium", "high"]), authority: z.enum(["cached", "repository", "local", "runtime", "external"]), source: z.string(), reason: z.string() })).max(100), rejected: z.array(z.object({ id: z.string(), reason: z.enum(["resolved", "irrelevant", "duplicate", "unavailable", "dominated", "budget_exceeded"]) })).max(100), changedState: z.boolean().optional(), proofFound: z.boolean().optional() });
const controlDecisionSchema = z.object({
    event: z.number().int().nonnegative(), trigger: z.string(), candidates: stringList(100),
    rejected: z.array(z.object({ id: z.string(), reason: z.enum(["resolved", "irrelevant", "duplicate", "unavailable", "dominated", "budget_exceeded"]) })).max(100), selected: z.string().optional(),
    pressure: z.object({ uncertainty: uncertaintySchema, falseActivationCost: z.number().nonnegative(), missedActivationCost: z.number().nonnegative(), budgetRemaining: z.number().int().nonnegative(), context: z.enum(["unknown", "low", "rising", "high"]) }),
    stateChange: stringList(100), proofGain: stringList(100),
});
const budgetSchema = z.object({ interventions: z.number().int().nonnegative(), compactions: z.number().int().nonnegative(), expensiveChecks: z.number().int().nonnegative(), skillInvocations: z.number().int().nonnegative(), extraLlmCalls: z.literal(0) });
const controlSchema = z.object({
    uncertainty: uncertaintySchema,
    impact: z.object({ size: z.enum(["tiny", "local", "distributed", "systemic"]), owners: stringList(200), dependencies: stringList(200), callers: stringList(200), tests: stringList(200), packageCrossings: stringList(100), publicSurface: stringList(100), confidence: z.enum(["unknown", "low", "medium", "high"]) }),
    progress: z.object({ status: z.enum(["PROGRESS", "STALLED", "REGRESSED"]), reason: z.string(), unresolved: z.array(z.enum(uncertaintyKinds)), proofDelta: z.number().int(), failureSignature: z.string().optional(), repeatedTargets: stringList(100), diffLines: z.number().int().nonnegative(), rejectedOverlap: z.boolean() }),
    budget: budgetSchema,
    availableProof: z.array(z.enum(["contract", "search", "graph", "reproduction", "repository_rule", "installed_api", "test", "diff", "browser", "measurement"])),
    context: z.object({ pressure: z.enum(["unknown", "low", "rising", "high"]), recentCompletedTurns: z.array(z.number().int().nonnegative()).max(3), artifactRefs: stringList(200) }),
    scope: z.object({ expected: stringList(200), actual: stringList(200), unexpected: stringList(200), hardSignals: stringList(100), softSignals: stringList(100) }),
    capabilities: z.array(z.object({ kind: z.string(), source: z.enum(["repository", "host", "installed", "gauntlet"]), available: z.boolean() })).max(100),
    lifecycle: z.object({ boundary: z.enum(["weak", "medium", "strong"]), pressure: z.enum(["unknown", "low", "rising", "high"]), lastStableEvent: z.number().int().nonnegative(), corrections: z.number().int().nonnegative() }),
    hysteresis: z.object({ lastAction: z.string().optional(), stableEvents: z.number().int().nonnegative(), repeatedSignals: z.number().int().nonnegative() }),
    traces: z.array(selectionTraceSchema).max(64),
    decisions: z.array(controlDecisionSchema).max(64), validatedDecisions: stringList(200),
    currentApproach: z.string(), resolvedIssues: stringList(200), unresolvedIssues: stringList(200), failedApproaches: stringList(200), activeSkills: z.array(z.enum(["understand", "investigate", "implement", "verify", "review", "optimize"])).max(1),
    lastCompactedActivity: z.number().int().nonnegative(), compactions: z.number().int().nonnegative(), observations: z.array(z.object({ path: z.string(), hash: z.string(), lastObserved: z.number().int().nonnegative(), relevantSymbols: stringList(200) })).max(64), repeatReadsDetected: z.number().int().nonnegative(), searches: z.array(z.unknown()).max(32), repeatSearchesDetected: z.number().int().nonnegative(), interventionsUsed: z.number().int().nonnegative(), graphExpansions: z.number().int().nonnegative(), externalDocCalls: z.number().int().nonnegative(), browserActivations: z.number().int().nonnegative(), delegations: z.number().int().nonnegative(), exhaustedEscalation: z.record(z.string(), z.number().int().nonnegative()),
    execution: z.object({ activeCheckpointId: z.string(), checkpoints: z.array(checkpointSchema).max(500), events: z.array(executionEventSchema).max(1_000), nextEvent: z.number().int().nonnegative() }),
});
const candidateSchema = z.object({ nodeId: z.string(), attempt: z.number().int().positive(), executor: z.enum(["primary", "local", "worker", "verifier"]), inputFingerprint: z.string(), claims: stringList(200), artifactRefs: stringList(200), evidenceRefs: stringList(200), affectedPaths: stringList(200), unresolved: z.array(z.enum(uncertaintyKinds)).max(20), patchRef: z.string().optional(), baseRevision: z.string().optional(), approachFingerprint: z.string().optional() });
const workNodeSchema = z.object({ id: z.string(), title: z.string(), kind: z.enum(["implementation", "inspection", "evidence", "verification", "local"]), executor: z.enum(["primary", "local", "worker", "verifier"]), required: z.boolean(), state: z.enum(["BLOCKED", "READY", "RUNNING", "CANDIDATE", "VALIDATED", "REJECTED", "STALE", "COLLAPSED"]), attempt: z.number().int().positive(), duration: z.enum(["tiny", "short", "meaningful", "long"]), dependencies: stringList(200), validityInputs: stringList(200), writePaths: stringList(200), resolves: z.array(z.enum(uncertaintyKinds)).max(20), evidenceRefs: stringList(200), candidate: candidateSchema.optional(), rejection: z.object({ constraint: z.string(), evidenceRef: z.string().optional(), approachFingerprint: z.string().optional() }).optional(), collapsedRef: z.string().optional(), criticalPath: z.number().nonnegative() });
const worldSchema = z.object({
    version: z.literal(1), revision: z.number().int().positive(), contractVersion: z.number().int().positive(), contract: taskContractSchema, expectedScope: stringList(500).default([]), canonicalRevision: z.string().nullable(),
    fingerprint: z.object({ contract: z.string(), files: z.record(z.string(), z.string()), packages: z.record(z.string(), z.string()), config: z.record(z.string(), z.string()).default({}), upstream: z.record(z.string(), z.string()).default({}), rules: z.string(), runtime: z.string(), value: z.string() }),
    facts: z.record(z.string(), z.object({ id: z.string(), provenance: z.string().default("legacy"), statement: z.string(), evidenceRefs: stringList(200), fingerprint: z.string(), version: z.number().int().positive(), status: z.enum(["validated", "stale"]) })),
    work: z.object({ version: z.number().int().positive(), nodes: z.record(z.string(), workNodeSchema) }),
    validity: z.object({ version: z.number().int().positive(), edges: z.array(z.object({ from: z.string(), to: z.string() })).max(1_000) }),
    communication: z.object({ version: z.number().int().positive(), edges: z.array(z.object({ from: z.string(), to: z.string() })).max(1_000) }),
    uncertainties: z.array(z.enum(uncertaintyKinds)).max(20).default([]), rules: stringList(100).default([]), legalActions: stringList(100).default(["read", "write", "verify"]), capabilities: stringList(100).default([]),
    ownership: z.record(z.string(), stringList(200)), evidenceRefs: stringList(500),
    decision: z.object({ revision: z.number().int().positive(), fingerprint: z.string(), candidates: stringList(500), valid: z.boolean() }), appliedEvent: z.number().int().nonnegative(),
});
export const taskStateSchema = z.object({
    version: z.literal(3), id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), repository: z.string().min(1), startedAt: z.string().datetime(), contract: taskContractSchema,
    clarifications: z.array(z.object({ question: z.string().max(1_000), answer: z.string().max(2_000), at: z.string().datetime() })).max(1),
    baseline: z.object({ head: z.string().nullable(), status: stringList(1_000), dependencies: stringList(1_000), files: z.record(z.string(), z.object({ hash: z.string(), lineHashes: stringList(100_000) })), tests: z.record(z.string(), z.object({ assertions: stringList(10_000), skipped: z.number().int().nonnegative() })), publicExports: z.record(z.string(), stringList(500)).optional(), index: z.unknown().optional() }),
    workingSet: stringList(500), repositoryFacts: z.array(z.unknown()).max(500), conventions: z.array(z.unknown()).max(100).optional(), rules: z.array(z.unknown()).max(100).optional(), conventionMetrics: z.object({ hints: z.number(), primitives: z.number(), interventions: z.number(), dependencyConflicts: z.number(), duplicates: z.number(), architectureBypasses: z.number() }).optional(),
    activities: z.array(activitySchema.omit({ toolPayload: true })).max(1_000), findings: z.array(z.object({ code: z.string(), severity: z.enum(["info", "warning", "error"]), blocking: z.boolean().optional(), message: z.string(), proof: stringList(200) })).max(500), attempts: z.number().int().positive(), finishedAt: z.string().datetime().optional(), noticed: z.array(z.string().max(500)).max(50).optional(), control: controlSchema, world: worldSchema,
});
export function createControlState(contract, rootId = "task-root", activeSkills = []) {
    const uncertainty = initialUncertainty(contract, assessRisk(contract).level);
    return {
        uncertainty,
        impact: { size: contract.size, owners: [...contract.expectedFrontier], dependencies: [], callers: [], tests: [], packageCrossings: [], publicSurface: [], confidence: contract.expectedFrontier.length ? "low" : "unknown" },
        progress: { status: "PROGRESS", reason: "Task initialized", unresolved: uncertaintyKinds.filter((kind) => uncertainty[kind] === "open" || uncertainty[kind] === "partial"), proofDelta: 0, repeatedTargets: [], diffLines: 0, rejectedOverlap: false },
        budget: { ...DEFAULT_INTERVENTION_BUDGET }, availableProof: [], context: { pressure: "unknown", recentCompletedTurns: [], artifactRefs: [] },
        scope: { expected: [...contract.expectedFrontier], actual: [], unexpected: [], hardSignals: [], softSignals: [] }, capabilities: [], lifecycle: { boundary: "weak", pressure: "unknown", lastStableEvent: 0, corrections: 0 }, hysteresis: { stableEvents: 0, repeatedSignals: 0 }, traces: [], decisions: [], validatedDecisions: [],
        currentApproach: "", resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills: activeSkills.slice(0, 1), lastCompactedActivity: 0, compactions: 0, observations: [], repeatReadsDetected: 0, searches: [], repeatSearchesDetected: 0, interventionsUsed: activeSkills.length, graphExpansions: 0, externalDocCalls: 0, browserActivations: 0, delegations: 0, exhaustedEscalation: {},
        execution: { activeCheckpointId: rootId, checkpoints: [{ id: rootId, kind: "task", status: "active", summary: contract.intent, constraints: [...contract.constraints], decisions: [], relevantFiles: [...contract.explicitPaths], relevantSymbols: [], proofRefs: [], createdFromEvent: 0, resolves: [] }], events: [], nextEvent: 0 },
    };
}
export function parseTaskState(value) {
    return taskStateSchema.parse(value);
}
export function createTaskWorld(contract, canonicalRevision = null) {
    return createWorld(contract, canonicalRevision, { contract: fingerprint(contract), files: {}, packages: {}, rules: "", runtime: "native" });
}
