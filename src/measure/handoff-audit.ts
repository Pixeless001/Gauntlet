export type AuditStatus = "implemented" | "partial" | "missing";
export interface HandoffAuditItem { sections: string; capability: string; status: AuditStatus; evidence: string[]; gap?: string }
export interface HandoffAuditSummary {
  implemented: number;
  partial: number;
  missing: number;
  total: number;
  implementedSections: number;
  partialSections: number;
  missingSections: number;
  totalSections: number;
  coverageLowerBound: number;
  coverageUpperBound: number;
  completion: number;
  verdict: "ready" | "not-ready";
  nextBlockingSections: string[];
  releaseReady: boolean;
}

export const HANDOFF_AUDIT: readonly HandoffAuditItem[] = [
  done("0-4, 122, 132-134", "product boundary and constitutive policy", "src/core/steer.ts", "src/core/policy.ts"),
  partial("5-10", "one deterministic activation authority", "src/control/selector.ts", "Runtime still constructs separate task-start, activity, graph, and verification plans."),
  partial("11-13", "progressive evidence views and high-level operations", "src/context/evidence-views.ts", "Evidence views are fused for context but are not the common retrieval interface for every provider."),
  done("14-18", "bounded workflow skills and task contract", "src/core/skills.ts", "skills/"),
  done("19-25", "execution tree, state reporting, and failed-branch quarantine", "src/execution-state/runtime.ts", "src/execution-state/reconstruct.ts"),
  partial("26-28", "progress deltas and execution-aware compaction", "src/execution-state/progress.ts", "StableTaskState and LiveProgressState are not persisted as separate schemas."),
  partial("29-35", "offline experience compiler and knowledge layers", "src/knowledge/evolution.ts", "Pattern proposal and promotion primitives exist, but no offline compiler run orchestrates evaluation and rollback."),
  partial("36-39, 41", "marginal context and addressable knowledge", "src/context/marginality.ts", "Context fusion is claim-aware, but detailed evidence retrieval by handle is not exposed end to end."),
  done("40, 102", "output conditioning and telemetry", "src/output/conditioner.ts", "src/core/measure.ts"),
  partial("42-50", "persistent progressive code intelligence", "src/intelligence/index.ts", "Index updates occur at before-stop rather than incrementally at file-write boundaries."),
  partial("51-52", "impact-triggered planning and verification", "src/intelligence/working-graph.ts", "Impact does not drive an explicit planning-depth decision."),
  partial("53-56", "capability discovery, repository profile, rules, and baselines", "src/repo/conventions.ts", "Repository facts and rules are narrow and do not cover all specified boundaries and task-relevant baselines."),
  partial("57-61", "authoritative technical knowledge ladder", "src/knowledge/resolver.ts", "Local resolution exists, but external official documentation retrieval and knowledge-handle expansion are not wired."),
  missing("62-68", "searchable specialist reference library", "No specialist reference corpus or runtime reference search exists."),
  partial("69-71", "runtime capability registry and provider precedence", "src/capabilities/registry.ts", "Registry and resolver are tested in isolation but never instantiated by GauntletEngine."),
  missing("72", "selected browser evidence execution", "A browser compactor exists, but GauntletEngine never invokes a BrowserProvider."),
  missing("73", "component registry discovery ladder", "No configured component-registry discovery or selection implementation exists."),
  partial("74-76", "bounded event-driven delegation", "src/execution-state/delegation.ts", "Handoff and result validation exist, but no selected delegation provider is dispatched by the runtime."),
  partial("77-82", "risk-aware evidence and before-stop gate", "src/verify/selector.ts", "Verification is candidate-selected, but browser, runtime, security, and external evidence providers are not executable paths."),
  partial("83-84", "proactivity and human interruption policy", "src/core/intent.ts", "Ambiguity uses regex rules without measured expected-value or reversibility inputs."),
  done("85-87", "selection trace, ROI, and negative routing", "src/control/selector.ts", "src/measure/evals.ts"),
  partial("88-90", "bounded repository brain storage", "src/state/store.ts", "Task, index, output, cache, lessons, and eval bounds exist but no aggregate repository-state quota exists."),
  partial("91-95", "portable harness lifecycle and dynamic activation", "src/adapters/", "Adapters normalize events, but capability negotiation does not feed the runtime registry."),
  partial("96-101, 103-113", "realistic evaluation program", "src/measure/fixtures.ts", "Fixtures mostly evaluate routing metadata rather than running repository-backed baseline-versus-Gauntlet tasks."),
  missing("114", "historical evaluation generation", "No historical commit task generator exists."),
  partial("115", "experience compiler evaluation loop", "src/knowledge/evolution.ts", "Promotion predicates exist without a compiler runner and persisted rollback version."),
  missing("116", "subsystem ablation evaluations", "No evaluation disables each major subsystem and compares outcomes and overhead."),
  missing("117", "feature interaction evaluations", "No executable pairwise interaction suite exists."),
  partial("118", "feature permanence decisions", "src/knowledge/evolution.ts", "Promotion is gated, but existing subsystem removal decisions are not evaluated."),
  done("119-121, 126", "research firewall and prohibited architecture", "src/", "package.json"),
  partial("123-125, 127-131, 135", "strict delivery sequence, budgets, runtime, and metrics", "src/core/policy.ts", "Core phases exist, but conditional experience and optional-provider phases were scaffolded before prerequisite end-to-end gates passed."),
];

export function summarizeHandoffAudit(items: readonly HandoffAuditItem[] = HANDOFF_AUDIT): HandoffAuditSummary {
  const implemented = items.filter((item) => item.status === "implemented").length;
  const partial = items.filter((item) => item.status === "partial").length;
  const missing = items.filter((item) => item.status === "missing").length;
  const total = items.length;
  const sections = items.flatMap((item) => expandSections(item.sections).map((section) => ({ section, status: item.status })));
  const duplicates = sections.filter((item, index) => sections.findIndex((candidate) => candidate.section === item.section) !== index);
  if (duplicates.length) throw new Error(`Handoff audit overlaps sections: ${[...new Set(duplicates.map((item) => item.section))].join(", ")}`);
  const implementedSections = sections.filter((item) => item.status === "implemented").length;
  const partialSections = sections.filter((item) => item.status === "partial").length;
  const missingSections = sections.filter((item) => item.status === "missing").length;
  const totalSections = sections.length;
  const releaseReady = missingSections === 0 && partialSections === 0;
  const coverageLowerBound = totalSections ? implementedSections / totalSections : 0;
  const coverageUpperBound = totalSections ? (implementedSections + partialSections) / totalSections : 0;
  return {
    implemented, partial, missing, total, implementedSections, partialSections, missingSections, totalSections,
    coverageLowerBound, coverageUpperBound,
    completion: totalSections ? (implementedSections + partialSections * 0.5) / totalSections : 0,
    verdict: releaseReady ? "ready" : "not-ready",
    nextBlockingSections: items.filter((item) => item.status !== "implemented").slice(0, 5).map((item) => item.sections),
    releaseReady,
  };
}

export function expandSections(value: string): number[] {
  return value.split(",").flatMap((range) => {
    const match = range.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Invalid handoff section range: ${range.trim()}`);
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (end < start) throw new Error(`Invalid descending handoff section range: ${range.trim()}`);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
}

function done(sections: string, capability: string, ...evidence: string[]): HandoffAuditItem { return { sections, capability, status: "implemented", evidence }; }
function partial(sections: string, capability: string, evidence: string, gap: string): HandoffAuditItem { return { sections, capability, status: "partial", evidence: [evidence], gap }; }
function missing(sections: string, capability: string, gap: string): HandoffAuditItem { return { sections, capability, status: "missing", evidence: [], gap }; }
