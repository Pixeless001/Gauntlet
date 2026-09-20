import { z } from "zod";
import { activitySchema, taskContractSchema, type Finding, type StoredTaskActivity, type TaskContract } from "./events.js";
import type { RepositoryFact } from "../repo/memory.js";
import type { ConventionFact } from "../repo/conventions.js";
import type { RepoIndex } from "../repo/index.js";
import { DEFAULT_INTERVENTION_BUDGET, type InterventionBudget } from "./policy.js";
import type { SkillName } from "./skills.js";
import type { SearchObservation } from "../context/governor.js";
import { initialUncertainty, uncertaintyKinds, type UncertaintyKind, type UncertaintyState } from "../control/uncertainty.js";
import type { SelectionTrace } from "../control/selector.js";
import type { BoundaryStrength, ContextPressure, ControlDecision, TaskSize } from "../control/types.js";
import type { ExecutionCheckpoint } from "../execution-state/checkpoints.js";
import type { ExecutionEvent } from "../execution-state/events.js";
import type { ProgressStatus } from "../execution-state/progress.js";
import type { ProofKind } from "../verify/proof-selector.js";
import { assessRisk } from "./risk.js";
import type { RepositoryRule } from "../repo/rules.js";

export interface FileDelta { path: string; added: number; removed: number }
export interface TestSignature { assertions: string[]; skipped: number }
export interface FileFingerprint { hash: string; lineHashes: string[] }
export interface FileObservation { path: string; hash: string; lastObserved: number; relevantSymbols: string[] }
export interface Baseline {
  head: string | null;
  status: string[];
  dependencies: string[];
  files: Record<string, FileFingerprint>;
  tests: Record<string, TestSignature>;
  publicExports?: Record<string, string[]>;
  index?: RepoIndex;
}

export interface ControlState {
  uncertainty: UncertaintyState;
  impact: { size: TaskSize; owners: string[]; dependencies: string[]; callers: string[]; tests: string[]; packageCrossings: string[]; publicSurface: string[]; confidence: "unknown" | "low" | "medium" | "high" };
  progress: { status: ProgressStatus; reason: string; unresolved: UncertaintyKind[]; proofDelta: number; failureSignature?: string; repeatedTargets: string[]; diffLines: number; rejectedOverlap: boolean };
  budget: InterventionBudget;
  availableProof: ProofKind[];
  context: { pressure: ContextPressure; recentCompletedTurns: number[]; artifactRefs: string[] };
  scope: { expected: string[]; actual: string[]; unexpected: string[]; hardSignals: string[]; softSignals: string[] };
  capabilities: { kind: string; source: "repository" | "host" | "installed" | "gauntlet"; available: boolean }[];
  lifecycle: { boundary: BoundaryStrength; pressure: ContextPressure; lastStableEvent: number; corrections: number };
  hysteresis: { lastAction?: string; stableEvents: number; repeatedSignals: number };
  traces: SelectionTrace[];
  decisions: ControlDecision[];
  validatedDecisions: string[];
  currentApproach: string;
  resolvedIssues: string[];
  unresolvedIssues: string[];
  failedApproaches: string[];
  activeSkills: SkillName[];
  lastCompactedActivity: number;
  compactions: number;
  observations: FileObservation[];
  repeatReadsDetected: number;
  searches: SearchObservation[];
  repeatSearchesDetected: number;
  interventionsUsed: number;
  graphExpansions: number;
  externalDocCalls: number;
  browserActivations: number;
  delegations: number;
  exhaustedEscalation: Partial<Record<UncertaintyKind, number>>;
  execution: { activeCheckpointId: string; checkpoints: ExecutionCheckpoint[]; events: ExecutionEvent[]; nextEvent: number };
}

export interface TaskState {
  version: 2;
  id: string;
  repository: string;
  startedAt: string;
  contract: TaskContract;
  clarifications: { question: string; answer: string; at: string }[];
  baseline: Baseline;
  workingSet: string[];
  repositoryFacts: RepositoryFact[];
  conventions?: ConventionFact[];
  rules?: RepositoryRule[];
  conventionMetrics?: { hints: number; primitives: number; interventions: number; dependencyConflicts: number; duplicates: number; architectureBypasses: number };
  activities: StoredTaskActivity[];
  findings: Finding[];
  attempts: number;
  control: ControlState;
}

const stringList = (max: number, length = 500) => z.array(z.string().max(length)).max(max);
const uncertaintySchema = z.object(Object.fromEntries(uncertaintyKinds.map((kind) => [kind, z.enum(["open", "partial", "resolved", "irrelevant"])])) as unknown as Record<UncertaintyKind, z.ZodTypeAny>);
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

export const taskStateSchema = z.object({
  version: z.literal(2), id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), repository: z.string().min(1), startedAt: z.string().datetime(), contract: taskContractSchema,
  clarifications: z.array(z.object({ question: z.string().max(1_000), answer: z.string().max(2_000), at: z.string().datetime() })).max(1),
  baseline: z.object({ head: z.string().nullable(), status: stringList(1_000), dependencies: stringList(1_000), files: z.record(z.string(), z.object({ hash: z.string(), lineHashes: stringList(100_000) })), tests: z.record(z.string(), z.object({ assertions: stringList(10_000), skipped: z.number().int().nonnegative() })), publicExports: z.record(z.string(), stringList(500)).optional(), index: z.unknown().optional() }),
  workingSet: stringList(500), repositoryFacts: z.array(z.unknown()).max(500), conventions: z.array(z.unknown()).max(100).optional(), rules: z.array(z.unknown()).max(100).optional(), conventionMetrics: z.object({ hints: z.number(), primitives: z.number(), interventions: z.number(), dependencyConflicts: z.number(), duplicates: z.number(), architectureBypasses: z.number() }).optional(),
  activities: z.array(activitySchema.omit({ toolPayload: true })).max(1_000), findings: z.array(z.object({ code: z.string(), severity: z.enum(["info", "warning", "error"]), blocking: z.boolean().optional(), message: z.string(), proof: stringList(200) })).max(500), attempts: z.number().int().positive(), control: controlSchema,
});

export function createControlState(contract: TaskContract, rootId = "task-root", activeSkills: SkillName[] = []): ControlState {
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

export function parseTaskState(value: unknown): TaskState {
  return taskStateSchema.parse(value) as TaskState;
}
