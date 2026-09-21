import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type AuditStatus = "implemented" | "partial" | "missing";

export interface ArchitectureAuditItem {
  id: string;
  capability: string;
  acceptance: string;
  mandatory: boolean;
  status: AuditStatus;
  implementation: string[];
  tests: string[];
  gap?: string;
}

export interface ArchitectureAuditSummary {
  implemented: number;
  partial: number;
  missing: number;
  total: number;
  mandatory: number;
  blocking: string[];
  releaseReady: boolean;
}

export const ARCHITECTURE_AUDIT: readonly ArchitectureAuditItem[] = [
  done("state", "validated runtime state", "State loads V1→V2→V3, saves atomically, and excludes raw tool payloads.", ["src/state/store.ts#class StateStore", "src/state/v2-migration.ts#migrateTaskV2"], ["test/state-migration.test.ts#first-version stored outputs become artifact handles", "test/core.test.ts#task state never persists raw tool payloads"]),
  done("event-sourcing", "durable world events", "Replayable JSONL patches are sequenced before an atomic compact-world checkpoint advances.", ["src/work/event-store.ts#class GraphEventStore", "src/state/store.ts#updateTaskWithWorldEvent"], ["test/world-runtime.test.ts#invalidating a running node returns an explicit cancellation transition", "test/event-recovery.test.ts#event history stores replay patches"]),
  done("world", "current valid world", "The contract-scoped world carries explicit fingerprints, facts, graph revisions, ownership, capabilities, and evidence references.", ["src/work/types.ts#CurrentValidWorld", "src/work/world.ts#refreshWorld"], ["test/world-runtime.test.ts#config and upstream changes stale only their explicit dependants"]),
  done("graphs", "work validity communication graphs", "Work readiness, local validity-cone staleness, and permitted evidence flow are native graph semantics.", ["src/work/types.ts#WorkGraph", "src/work/graph.ts#invalidateCone"], ["test/work-graph.test.ts#discovered structure can gate existing work", "test/work-graph.test.ts#ready frontier excludes stale facts and overlapping ownership"]),
  done("contract", "task contract compilation", "The exact request is retained and material ambiguity produces at most one focused question.", ["src/core/intent.ts#extractContract", "src/core/engine.ts#async clarify"], ["test/core.test.ts#extracts task paths, criteria, and constraints", "test/engine.test.ts#clarification answers remain separate"]),
  done("control", "deterministic control", "Runtime events use one admission, selection, routing, escalation, and boundary decision path.", ["src/control/runtime.ts#controlRuntime", "src/control/selector.ts#planActivation"], ["test/control.test.ts#runtime control records asymmetric pressure", "test/control.test.ts#runtime decisions retain state changes"]),
  done("artifacts", "artifact storage and context control", "Raw payloads stay outside task state and are retrieved through bounded artifact views.", ["src/output/store.ts#class ArtifactStore", "src/output/processors.ts#processArtifact"], ["test/output.test.ts#artifact retrieval is byte-identical", "test/output.test.ts#raw proof is stored outside task state"]),
  done("repository", "repository intelligence and scope", "Writes update structural facts and material unexpected scope is detected.", ["src/intelligence/working-graph.ts#inspectImpact", "src/intelligence/scope.ts#assessScope"], ["test/intelligence.test.ts#structural intelligence incrementally replaces changed files", "test/intelligence.test.ts#scope accepts broad requested work"]),
  done("rules", "timed repository rules", "Supported rules run at explicit timings and unsupported rules remain instructions.", ["src/repo/rules.ts#compileRules"], ["test/conventions.test.ts#repository rules expose source, timing, and honest enforcement"]),
  done("progress", "progress and lifecycle", "Progress, stalls, boundaries, and context pressure are derived without a global confidence score.", ["src/execution-state/progress.ts#assessProgress", "src/control/runtime.ts#boundaryDecision"], ["test/progress.test.ts#progress stalls only when repeated work adds no proof", "test/control.test.ts#blocks unknown-pressure compaction"]),
  done("verification", "risk-based verification and stopping", "Completion requires preservation, resolved material uncertainty, relevant checks, current repository revision, readable hashed evidence, and a narrative-free cold view.", ["src/verify/completion.ts#decideCompletion", "src/core/engine.ts#async finish", "src/evidence/packets.ts#createVerificationView"], ["test/completion.test.ts#completion rejects repository drift and invalid evidence", "test/candidate-evaluation.test.ts#semantic residue stays outside deterministic promotion"]),
  done("candidates", "candidate-only execution and promotion", "Executor output remains a candidate until ordered deterministic checks and isolated patch applicability promote it into validated facts.", ["src/work/types.ts#CandidateResult", "src/verify/candidate.ts#evaluateCandidate", "src/verify/promotion.ts#verifyIsolatedPatch"], ["test/candidate-evaluation.test.ts#deterministic evaluation rejects", "test/promotion.test.ts#isolated promotion accepts an applicable patch"]),
  done("scheduler", "native frontier scheduling", "Native scheduling bounds local width, delegates at most one worker, serializes unisolated mutations, and runs the ready frontier through the native engine.", ["src/work/scheduler.ts#scheduleReady", "src/execution/native-engine.ts#class NativeExecutionEngine", "src/core/engine.ts#async finish"], ["test/engine.test.ts#independent impact inspections enter one native ready frontier", "test/native-engine.test.ts#native engine batches"]),
  partial("sparse-context", "sparse worker and cold verification views", "Workers and verifiers receive only communication-graph-authorized facts and evidence.", ["src/evidence/packets.ts#compileWorkerPacket", "src/evidence/packets.ts#createVerificationView"], ["test/candidate-evaluation.test.ts#worker and verifier packets"], "Worker invocation and semantic-conflict synthesis are not wired."),
  done("capabilities", "capability integration", "The engine resolves repository, host, installed, and native implementations in that order.", ["src/core/engine.ts#new CapabilityRegistry", "src/capabilities/resolver.ts#class CapabilityResolver"], ["test/capabilities.test.ts#engine registry applies repository, host, installed, and native precedence"]),
  partial("adapters", "host capability boundaries", "Adapters declare result replacement, cancellation, worktree, delegation, and compaction truthfully.", ["src/adapters/types.ts#HarnessCapabilities", "src/hooks/dispatch.ts#activityOutput"], ["test/hooks.test.ts#host adapters condition results only through declared replacement paths", "test/hooks.test.ts#compact lifecycle returns a bounded re-grounding record"], "Installed-host lifecycle and isolation capabilities are not integration-tested."),
  done("opencode", "local OpenCode adapter", "OpenCode translates documented local session/tool hooks and explicitly has no awaited stop or compaction hook.", ["src/adapters/opencode/index.ts#opencodeAdapter", "src/adapters/opencode/plugin.ts#opencodePluginSource"], ["test/adapters.test.ts#OpenCode plugin translates"]),
  partial("evaluation", "executable evaluation", "Decision, repository, replay, ablation, interaction, orchestration, and substrate suites execute structured cases.", ["src/measure/eval-runner.ts#runEvalSuite", "src/measure/eval-runner.ts#runSubstrateSuite"], ["test/evals.test.ts#every evaluation suite executes structured cases"], "Research-derived and end-to-end orchestration scenarios remain incomplete."),
  partial("substrate", "native substrate conformance", "The shipping engine has no LangGraph dependency and exposes only the narrow execution boundary.", ["src/execution/native-engine.ts#NativeExecutionEngine", "src/measure/substrate.ts#SUBSTRATE_COMPARISON"], ["test/native-engine.test.ts#native engine checkpoints", "test/evals.test.ts#substrate comparison covers"], "The disposable comparison is not executed through shared conformance fixtures."),
  partial("metrics", "separate runtime-loop metrics", "Outcome, control/context, evidence, and orchestration counters remain independently inspectable.", ["src/core/measure.ts#orchestration", "src/core/measure.ts#outcome"], ["test/core.test.ts#measurement exposes selection"], "Required orchestration costs and fan-out benefit are not yet measured."),
  done("improvement", "offline policy improvement", "One atomic proposal is evaluated and versioned before promotion or rejection.", ["src/knowledge/evolution.ts#runEvolution"], ["test/evolution.test.ts#offline improvement evaluates and versions one proposal without source edits"]),
];

export function summarizeArchitectureAudit(items: readonly ArchitectureAuditItem[] = ARCHITECTURE_AUDIT): ArchitectureAuditSummary {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Architecture audit contains duplicate capability ids");
  const implemented = items.filter((item) => item.status === "implemented").length, partial = items.filter((item) => item.status === "partial").length, missing = items.filter((item) => item.status === "missing").length, mandatoryItems = items.filter((item) => item.mandatory), blocking = mandatoryItems.filter((item) => item.status !== "implemented").map((item) => item.id);
  return { implemented, partial, missing, total: items.length, mandatory: mandatoryItems.length, blocking, releaseReady: blocking.length === 0 };
}

export interface AuditProofIssue { id: string; kind: "implementation" | "test"; proof: string; reason: "unsafe" | "missing" | "unverified" }

export async function validateAuditProof(cwd: string, items: readonly ArchitectureAuditItem[] = ARCHITECTURE_AUDIT): Promise<AuditProofIssue[]> {
  const root = resolve(cwd), canonicalRoot = await realpath(root), issues: AuditProofIssue[] = [];
  for (const item of items) {
    if (!item.implementation.length || !item.tests.length) { issues.push({ id: item.id, kind: item.implementation.length ? "test" : "implementation", proof: "", reason: "missing" }); continue; }
    for (const [kind, entries] of [["implementation", item.implementation], ["test", item.tests]] as const) for (const proof of entries) {
      const [locator, anchor] = proof.split("#", 2), path = resolve(root, locator!), fromRoot = relative(root, path);
      if (isAbsolute(locator!) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) { issues.push({ id: item.id, kind, proof, reason: "unsafe" }); continue; }
      try {
        const canonicalPath = await realpath(path), canonicalRelative = relative(canonicalRoot, canonicalPath);
        if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`)) { issues.push({ id: item.id, kind, proof, reason: "unsafe" }); continue; }
        if (!(await stat(path)).isFile()) { issues.push({ id: item.id, kind, proof, reason: "missing" }); continue; }
        if (anchor && !(await readFile(path, "utf8")).includes(anchor)) issues.push({ id: item.id, kind, proof, reason: "unverified" });
      } catch { issues.push({ id: item.id, kind, proof, reason: "missing" }); }
    }
  }
  return issues;
}

function done(id: string, capability: string, acceptance: string, implementation: string[], tests: string[]): ArchitectureAuditItem { return { id, capability, acceptance, mandatory: true, status: "implemented", implementation, tests }; }
function partial(id: string, capability: string, acceptance: string, implementation: string[], tests: string[], gap?: string): ArchitectureAuditItem { return { id, capability, acceptance, mandatory: true, status: "partial", implementation, tests, ...(gap ? { gap } : {}) }; }
