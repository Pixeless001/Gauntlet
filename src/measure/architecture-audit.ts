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
  partial("state", "validated runtime state", "State loads, migrates, saves atomically, and excludes raw tool payloads.", "src/state/store.ts", "test/state-store.test.ts", "Runtime state still uses the first schema version."),
  partial("contract", "task contract compilation", "The exact request is retained and material ambiguity produces at most one focused question.", "src/core/contract.ts", "test/compiler.test.ts", "Preservation requirements, expected scope, and required proof are not first-class fields."),
  partial("control", "deterministic control", "All runtime events use one admission, selection, routing, escalation, and boundary decision path.", "src/control/selector.ts", "test/activation.test.ts", "Event handling still assembles separate plans."),
  partial("artifacts", "artifact storage and context control", "Raw payloads are stored outside task state and retrieved through bounded artifact views.", "src/output/store.ts", "test/output-conditioner.test.ts", "Storage is limited to command results and has no public artifact command."),
  partial("repository", "repository intelligence and scope", "Writes update structural facts and material unexpected scope is detected.", "src/intelligence/index.ts", "test/intelligence.test.ts", "The structural index refreshes only at completion."),
  partial("rules", "timed repository rules", "Supported rules run at edit, turn, or completion timing and unsupported rules remain instructions.", "src/repo/conventions.ts", "test/repo-intelligence.test.ts", "Rule timing and enforcement support are not represented."),
  partial("progress", "progress and lifecycle", "Progress, stalls, boundaries, and context pressure are derived without a global confidence score.", "src/execution-state/progress.ts", "test/execution-state.test.ts", "Lifecycle boundaries and pressure hysteresis are not persisted."),
  partial("verification", "risk-based verification and stopping", "Completion requires acceptance, preservation, resolved uncertainty, and relevant regression checks.", "src/verify/proof-selector.ts", "test/proof-selection.test.ts", "Preservation checks and truthful incomplete stopping are not complete."),
  partial("capabilities", "capability integration", "The engine resolves repository, host, installed, and native implementations in that order.", "src/capabilities/registry.ts", "test/providers.test.ts", "The registry is not instantiated by the engine."),
  partial("adapters", "host capability boundaries", "Adapters declare output replacement and compaction support without overstating prevention.", "src/adapters/types.ts", "test/adapters.test.ts", "Adapters do not declare result-replacement granularity."),
  partial("evaluation", "executable evaluation", "Decision, repository, replay, ablation, and interaction suites execute against temporary repositories.", "src/measure/eval-runner.ts", "test/eval-runner.test.ts", "Current cases exercise routing metadata only."),
  partial("improvement", "offline policy improvement", "One atomic proposal is evaluated and versioned before promotion or rejection.", "src/knowledge/evolution.ts", "test/knowledge-evolution.test.ts", "No persisted proposal runner exists."),
];

export function summarizeArchitectureAudit(items: readonly ArchitectureAuditItem[] = ARCHITECTURE_AUDIT): ArchitectureAuditSummary {
  const ids = items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Architecture audit contains duplicate capability ids");
  const implemented = items.filter((item) => item.status === "implemented").length;
  const partial = items.filter((item) => item.status === "partial").length;
  const missing = items.filter((item) => item.status === "missing").length;
  const mandatoryItems = items.filter((item) => item.mandatory);
  const blocking = mandatoryItems.filter((item) => item.status !== "implemented").map((item) => item.id);
  return { implemented, partial, missing, total: items.length, mandatory: mandatoryItems.length, blocking, releaseReady: blocking.length === 0 };
}

export interface AuditProofIssue {
  id: string;
  kind: "implementation" | "test";
  proof: string;
  reason: "unsafe" | "missing" | "unverified";
}

export async function validateAuditProof(cwd: string, items: readonly ArchitectureAuditItem[] = ARCHITECTURE_AUDIT): Promise<AuditProofIssue[]> {
  const root = resolve(cwd);
  const canonicalRoot = await realpath(root);
  const issues: AuditProofIssue[] = [];
  for (const item of items) {
    if (!item.implementation.length || !item.tests.length) {
      const kind = item.implementation.length ? "test" : "implementation";
      issues.push({ id: item.id, kind, proof: "", reason: "missing" });
      continue;
    }
    for (const [kind, entries] of [["implementation", item.implementation], ["test", item.tests]] as const) {
      for (const proof of entries) {
        const [locator, anchor] = proof.split("#", 2);
        const path = resolve(root, locator!);
        const fromRoot = relative(root, path);
        if (isAbsolute(locator!) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
          issues.push({ id: item.id, kind, proof, reason: "unsafe" });
          continue;
        }
        try {
          const canonicalPath = await realpath(path);
          const canonicalRelative = relative(canonicalRoot, canonicalPath);
          if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`)) {
            issues.push({ id: item.id, kind, proof, reason: "unsafe" });
            continue;
          }
          if (!(await stat(path)).isFile()) {
            issues.push({ id: item.id, kind, proof, reason: "missing" });
            continue;
          }
          if (anchor && !(await readFile(path, "utf8")).includes(anchor)) issues.push({ id: item.id, kind, proof, reason: "unverified" });
        } catch {
          issues.push({ id: item.id, kind, proof, reason: "missing" });
        }
      }
    }
  }
  return issues;
}

function partial(id: string, capability: string, acceptance: string, implementation: string, tests: string, gap: string): ArchitectureAuditItem {
  return { id, capability, acceptance, mandatory: true, status: "partial", implementation: [implementation], tests: [tests], gap };
}
