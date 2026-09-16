import type { FileDelta, TaskState } from "./task-state.js";
import type { VerificationResult } from "../verify/types.js";

export interface TaskMeasurement {
  version: 1; taskId: string; startedAt: string; finishedAt: string; durationMs: number; attempts: number;
  files: number; added: number; removed: number; testsPassed: number; checksRun: number;
  clean: boolean; verified: boolean; firstPass: boolean; findings: string[];
  evidence?: { id: string; status: VerificationResult["status"]; summary?: string; reference?: string }[];
  conventions?: TaskState["conventionMetrics"];
  context?: { repeatReadsDetected: number; repeatSearchesDetected: number; compactions: number; skillInvocations: number };
  selection?: { interventions: number; traces: number; averageDepth: number; graphExpansions: number; externalDocCalls: number; browserActivations: number; delegations: number };
  memory?: { rawEvents: number; checkpoints: number; activePath: number; rejectedBranches: number };
  output?: { rawBytes: number; visibleBytes: number; tokensRemoved: number; actionableFailures: number; evidenceReferences: number; truncated: number };
}

export function measure(state: TaskState, changes: FileDelta[], results: VerificationResult[], now = new Date()): TaskMeasurement {
  const verified = results.length > 0 && results.every((result) => result.status === "pass");
  const clean = state.findings.every((finding) => !(finding.blocking ?? finding.severity !== "info"));
  const evidence = results.map((result) => ({ id: result.id, status: result.status, ...(result.summary ? { summary: result.summary } : {}), ...(result.evidence ? { reference: result.evidence } : {}) }));
  const traces = state.session?.selectionTraces ?? [], execution = state.session?.execution;
  const activationLevels = traces.flatMap((trace) => trace.activations?.map((item) => item.level) ?? []);
  const output = { rawBytes: results.reduce((sum, result) => sum + Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), 0), visibleBytes: results.reduce((sum, result) => sum + (result.conditionedBytes ?? Buffer.byteLength(result.summary ?? "")), 0), tokensRemoved: results.reduce((sum, result) => sum + (result.tokensRemoved ?? 0), 0), actionableFailures: results.reduce((sum, result) => sum + (result.actionableFailures ?? 0), 0), evidenceReferences: results.filter((result) => Boolean(result.evidence)).length, truncated: results.filter((result) => result.outputTruncated).length };
  return { version: 1, taskId: state.id, startedAt: state.startedAt, finishedAt: now.toISOString(), durationMs: Math.max(0, now.getTime() - new Date(state.startedAt).getTime()), attempts: state.attempts, files: changes.length, added: changes.reduce((n, f) => n + f.added, 0), removed: changes.reduce((n, f) => n + f.removed, 0), testsPassed: results.filter((r) => r.id.includes("test") && r.status === "pass").length, checksRun: results.length, clean, verified, firstPass: clean && verified && state.attempts <= 1, findings: state.findings.map((finding) => `${finding.code}: ${finding.message}${finding.evidence.length ? ` (${finding.evidence.join(", ")})` : ""}`), evidence, conventions: state.conventionMetrics, output, ...(state.session ? { context: { repeatReadsDetected: state.session.repeatReadsDetected, repeatSearchesDetected: state.session.repeatSearchesDetected ?? 0, compactions: state.session.compactions, skillInvocations: state.session.activeSkills.length }, selection: { interventions: state.session.interventionsUsed ?? 0, traces: traces.length, averageDepth: activationLevels.length ? activationLevels.reduce<number>((sum, level) => sum + level, 0) / activationLevels.length : 0, graphExpansions: state.session.graphExpansions ?? 0, externalDocCalls: state.session.externalDocCalls ?? 0, browserActivations: state.session.browserActivations ?? 0, delegations: state.session.delegations ?? 0 }, memory: { rawEvents: execution?.events.length ?? 0, checkpoints: execution?.checkpoints.length ?? 0, activePath: execution ? pathLength(execution.checkpoints, execution.activeCheckpointId) : 0, rejectedBranches: execution?.checkpoints.filter((item) => item.status === "rejected").length ?? 0 } } : {}) };
}

function pathLength(checkpoints: NonNullable<NonNullable<TaskState["session"]>["execution"]>["checkpoints"], activeId: string): number { const byId = new Map(checkpoints.map((item) => [item.id, item])); let count = 0, current = byId.get(activeId), seen = new Set<string>(); while (current && !seen.has(current.id)) { seen.add(current.id); count += 1; current = current.parentId ? byId.get(current.parentId) : undefined; } return count; }
