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
  done("state", "validated runtime state", "State loads, migrates, saves atomically, and excludes raw tool payloads.", ["src/state/store.ts#class StateStore", "src/state/v1-migration.ts#migrateTaskV1"], ["test/state-migration.test.ts#first-version stored outputs become artifact handles", "test/core.test.ts#task state never persists raw tool payloads"]),
  done("contract", "task contract compilation", "The exact request is retained and material ambiguity produces at most one focused question.", ["src/core/intent.ts#extractContract", "src/core/engine.ts#async clarify"], ["test/core.test.ts#extracts task paths, criteria, and constraints", "test/engine.test.ts#clarification answers remain separate"]),
  done("control", "deterministic control", "Runtime events use one admission, selection, routing, escalation, and boundary decision path.", ["src/control/runtime.ts#controlRuntime", "src/control/selector.ts#planActivation"], ["test/control.test.ts#runtime control records asymmetric pressure", "test/control.test.ts#runtime decisions retain state changes"]),
  done("artifacts", "artifact storage and context control", "Raw payloads stay outside task state and are retrieved through bounded artifact views.", ["src/output/store.ts#class ArtifactStore", "src/output/processors.ts#processArtifact"], ["test/output.test.ts#artifact retrieval is byte-identical", "test/output.test.ts#raw proof is stored outside task state"]),
  done("repository", "repository intelligence and scope", "Writes update structural facts and material unexpected scope is detected.", ["src/intelligence/working-graph.ts#inspectImpact", "src/intelligence/scope.ts#assessScope"], ["test/intelligence.test.ts#structural intelligence incrementally replaces changed files", "test/intelligence.test.ts#scope accepts broad requested work"]),
  done("rules", "timed repository rules", "Supported rules run at explicit timings and unsupported rules remain instructions.", ["src/repo/rules.ts#compileRules"], ["test/conventions.test.ts#repository rules expose source, timing, and honest enforcement"]),
  done("progress", "progress and lifecycle", "Progress, stalls, boundaries, and context pressure are derived without a global confidence score.", ["src/execution-state/progress.ts#assessProgress", "src/control/runtime.ts#boundaryDecision"], ["test/progress.test.ts#progress stalls only when repeated work adds no proof", "test/control.test.ts#blocks unknown-pressure compaction"]),
  done("verification", "risk-based verification and stopping", "Completion requires preservation, resolved material uncertainty, and relevant checks.", ["src/verify/completion.ts#decideCompletion", "src/core/engine.ts#async finish"], ["test/core.test.ts#measurement never reports success", "test/engine.test.ts#static checks do not claim behavioral proof"]),
  done("capabilities", "capability integration", "The engine resolves repository, host, installed, and native implementations in that order.", ["src/core/engine.ts#new CapabilityRegistry", "src/capabilities/resolver.ts#class CapabilityResolver"], ["test/capabilities.test.ts#engine registry applies repository, host, installed, and native precedence"]),
  done("adapters", "host capability boundaries", "Adapters declare result replacement and compaction support without overstating prevention.", ["src/adapters/types.ts#output", "src/hooks/dispatch.ts#activityOutput"], ["test/hooks.test.ts#host adapters condition results only through declared replacement paths", "test/hooks.test.ts#compact lifecycle returns a bounded re-grounding record"]),
  done("evaluation", "executable evaluation", "Decision, repository, replay, ablation, and interaction suites execute structured cases.", ["src/measure/eval-runner.ts#runEvalSuite"], ["test/evals.test.ts#every evaluation suite executes structured cases"]),
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
