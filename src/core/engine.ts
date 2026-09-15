import { randomUUID } from "node:crypto";
import { captureBaseline, changedFiles } from "../repo/git.js";
import { detectRepository } from "../repo/detect.js";
import { inspectTestIntegrity } from "../verify/test-integrity.js";
import { selectVerification } from "../verify/selector.js";
import { runVerification } from "../verify/runner.js";
import { createContextPacket, formatContext } from "./context.js";
import { evaluateGuards, loopFinding } from "./guard.js";
import { detectAmbiguity, extractContract } from "./intent.js";
import { measure, type TaskMeasurement } from "./measure.js";
import { STEERING_POLICY } from "./steer.js";
import type { TaskActivity } from "./events.js";
import type { TaskState } from "./task-state.js";
import { StateStore } from "../state/store.js";
import { deriveFacts } from "../repo/memory.js";
import { compact, shouldCompact, type ContinuationRecord } from "./compact.js";
import { discoverConventions, selectConventionFacts } from "../repo/conventions.js";
import { inspectConventionDrift } from "../verify/convention-drift.js";
import { DEFAULT_INTERVENTION_BUDGET } from "./policy.js";
import { assessRisk } from "./risk.js";
import { loadSkill, routeSkills, type SkillName } from "./skills.js";
import { fingerprintFiles } from "../repo/index.js";
import { normalizeSearch, repeatedSearch } from "../context/governor.js";
import { LocalExecutionEnvironment } from "../execution/local.js";
import { verifyCounterfactual, type CounterfactualEnvironment } from "../verify/counterfactual.js";
import { initialUncertainty } from "../control/uncertainty.js";
import { selectInterventions } from "../control/selector.js";
import { observeExecution, recordVerification } from "../execution-state/runtime.js";
import { buildStructuralIndex } from "../intelligence/index.js";
import { reconstruct } from "../execution-state/reconstruct.js";
import type { EvidenceKind } from "../verify/evidence-selector.js";

export interface StartResult { state: TaskState; injection: string; clarification: string | null }
export interface ActivityResult { state: TaskState; continuation: ContinuationRecord | null }
export interface EngineOptions { preChangeEnvironment?: (head: string, candidateTests: string[]) => Promise<CounterfactualEnvironment | null> }
export class GauntletEngine {
  private readonly store: StateStore;
  constructor(readonly cwd: string, private readonly options: EngineOptions = {}) { this.store = new StateStore(cwd); }
  async state(id: string): Promise<TaskState> { return this.store.loadTask(id); }

  async start(intent: string, id: string = randomUUID()): Promise<StartResult> {
    try {
      const state = await this.store.loadTask(id);
      const context = await createContextPacket(this.cwd, state.contract, state.conventions, state.baseline.index, reconstruct(state));
      const ambiguity = detectAmbiguity(state.contract);
      return { state, injection: await injection(context, state.session?.activeSkills ?? []), clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const contract = extractContract(intent), baseline = await captureBaseline(this.cwd), profile = await detectRepository(this.cwd);
    const conventionProfile = await discoverConventions(this.cwd, contract.explicitPaths, undefined, baseline.index), conventions = selectConventionFacts(conventionProfile, contract);
    const context = await createContextPacket(this.cwd, contract, conventions, baseline.index);
    const ambiguity = detectAmbiguity(contract);
    const risk = assessRisk(contract);
    const activeSkills = routeSkills(contract, "start", risk.level), uncertainty = initialUncertainty(contract, risk.level), rootId = randomUUID();
    const state: TaskState = { version: 1, id, repository: this.cwd, startedAt: new Date().toISOString(), contract, baseline, workingSet: context.entries.map((entry) => entry.path), repositoryFacts: await deriveFacts(this.cwd, profile), conventions, conventionMetrics: { hints: conventions.length, primitives: conventions.filter((fact) => fact.category === "primitive").length, interventions: 0, dependencyConflicts: 0, duplicates: 0, architectureBypasses: 0 }, activities: [], findings: [], attempts: 1, session: { currentApproach: "", decisions: [], resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills, lastCompactedActivity: 0, compactions: 0, budget: { ...DEFAULT_INTERVENTION_BUDGET }, observations: [], repeatReadsDetected: 0, searches: [], repeatSearchesDetected: 0, uncertainty, selectionTraces: [], interventionsUsed: activeSkills.length, graphExpansions: 0, externalDocCalls: 0, browserActivations: 0, delegations: 0, exhaustedEscalation: {}, execution: { activeCheckpointId: rootId, checkpoints: [{ id: rootId, kind: "task", status: "active", summary: contract.intent, constraints: [...contract.constraints], decisions: [], relevantFiles: [...contract.explicitPaths], relevantSymbols: [], evidenceRefs: [], createdFromEvent: 0, resolves: [] }], events: [], nextEvent: 0 } } };
    await this.store.saveTask(state);
    return { state, injection: await injection(context, state.session?.activeSkills ?? []), clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null };
  }

  async activity(id: string, activity: TaskActivity): Promise<ActivityResult> {
    const fingerprint = activity.kind === "file_read" && activity.target && !activity.target.startsWith("../") && !activity.target.startsWith("/") ? (await fingerprintFiles(this.cwd, [activity.target]))[activity.target] : undefined;
    let workflowChanged = false;
    const state = await this.store.updateTask(id, (value) => {
      value.activities.push(activity); if (value.activities.length > 1_000) { value.activities.splice(0, value.activities.length - 1_000); if (value.session) value.session.lastCompactedActivity = Math.max(0, value.session.lastCompactedActivity - 1); } const loop = loopFinding(value);
      if (loop && !value.findings.some((finding) => finding.code === loop.code)) value.findings.push(loop);
      if (value.session && activity.kind === "file_read" && activity.target && fingerprint) {
        const existing = value.session.observations.find((item) => item.path === activity.target);
        if (existing?.hash === fingerprint.hash) value.session.repeatReadsDetected += 1;
        value.session.observations = [{ path: activity.target, hash: fingerprint.hash, lastObserved: value.activities.length, relevantSymbols: [] }, ...value.session.observations.filter((item) => item.path !== activity.target)].slice(0, 64);
      }
      if (value.session && activity.kind === "file_write" && activity.target) value.session.observations = value.session.observations.filter((item) => item.path !== activity.target);
      const search = activity.kind === "command" && activity.target ? normalizeSearch(activity.target) : null;
      if (value.session && search) { const observation = { ...search, version: value.baseline.index?.head ?? "filesystem", matches: [] }, searches = value.session.searches ?? []; if (repeatedSearch(searches, observation)) value.session.repeatSearchesDetected = (value.session.repeatSearchesDetected ?? 0) + 1; else value.session.searches = [observation, ...searches].slice(0, 32); }
      if (value.session) {
        const transition = observeExecution(value, activity);
        const repeatedFailure = transition.repeatedFailure;
        if (repeatedFailure && value.session.uncertainty) {
          value.session.uncertainty.cause = "open";
          const candidate = { id: "skill:investigate", skill: "investigate" as const, uncertainty: "cause" as const, level: 3 as const, cost: "low" as const, available: true };
          const trace = selectInterventions({ uncertainty: value.session.uncertainty, candidates: [candidate], supplied: value.session.activeSkills.map((skill) => `skill:${skill}`), budget: value.session.budget, used: value.session.interventionsUsed ?? 0, event: value.activities.length, trigger: "repeated_failure" });
          if (trace.selected.includes(candidate.id)) {
            trace.changedState = true;
            value.session.activeSkills = ["investigate"];
            value.session.interventionsUsed = (value.session.interventionsUsed ?? 0) + 1;
            workflowChanged = true;
          }
          value.session.selectionTraces = [...(value.session.selectionTraces ?? []), trace].slice(-64);
        }
        if (transition.causeValidated && value.session.uncertainty) { value.session.uncertainty.cause = "resolved"; value.session.activeSkills = ["implement"]; workflowChanged = true; }
      }
    });
    const decision = shouldCompact(state); let continuation = decision.compact || workflowChanged ? compact(state) : null;
    if (continuation && workflowChanged) {
      const skill = state.session?.activeSkills[0];
      continuation = { ...continuation, ...(skill ? { workflow: skill, guidance: await loadSkill(skill) } : {}) };
    }
    if (continuation && decision.compact) await this.store.updateTask(id, (value) => { if (value.session) { value.session.lastCompactedActivity = value.activities.length; value.session.compactions += 1; } });
    return { state, continuation };
  }

  async finish(id: string): Promise<TaskMeasurement> {
    const state = await this.store.loadTask(id), changes = await changedFiles(this.cwd, state.baseline);
    const current = [...await evaluateGuards(this.cwd, state, changes), ...await inspectTestIntegrity(this.cwd, state.baseline.tests, changes), ...await inspectConventionDrift(this.cwd, state, changes)];
    state.findings = deduplicateFindings(current);
    if (state.conventionMetrics) {
      state.conventionMetrics.dependencyConflicts = state.findings.filter((item) => item.code === "convention-dependency-conflict").length;
      state.conventionMetrics.duplicates = state.findings.filter((item) => item.code === "convention-duplicate-primitive").length;
      state.conventionMetrics.architectureBypasses = state.findings.filter((item) => item.code === "convention-architecture-bypass").length;
      state.conventionMetrics.interventions = state.findings.filter((item) => item.code.startsWith("convention-")).length;
    }
    const structuralTargets = [...new Set([...changes.map((item) => item.path), ...(state.baseline.index?.files.filter((path) => /\.[cm]?[jt]sx?$/.test(path)).slice(0, 160) ?? [])])];
    const structural = state.baseline.index && changes.length ? await buildStructuralIndex(this.cwd, state.baseline.index, structuralTargets, 160) : undefined;
    if (structural && state.session) state.session.graphExpansions = (state.session.graphExpansions ?? 0) + 1;
    const plan = selectVerification(await detectRepository(this.cwd), changes, state.baseline.index?.files, structural), results = await runVerification(this.cwd, plan, undefined, state.id);
    const risk = assessRisk(state.contract, changes), newTest = changes.some((change) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(change.path) && !(change.path in state.baseline.tests)), testCheck = plan.checks.find((check) => check.id.includes("test"));
    if (risk.level === "elevated" && newTest && testCheck && state.baseline.head && this.options.preChangeEnvironment) {
      const candidateTests = changes.filter((change) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(change.path)).map((change) => change.path), before = await this.options.preChangeEnvironment(state.baseline.head, candidateTests), counterfactual = await verifyCounterfactual(testCheck, before, new LocalExecutionEnvironment(this.cwd), true);
      if (counterfactual.status === "weak") state.findings.push({ code: "weak-counterfactual", severity: "warning", blocking: true, message: "The new behavioral check also passes against pre-change behavior.", evidence: counterfactual.evidence });
    }
    if (state.session?.uncertainty && !state.findings.some((item) => item.code.startsWith("convention-"))) state.session.uncertainty.repoFit = state.session.uncertainty.repoFit === "irrelevant" ? "irrelevant" : "resolved";
    const passed = results.length > 0 && results.every((result) => result.status === "pass") && state.findings.every((finding) => !finding.blocking);
    const supplied: EvidenceKind[] = ["diff", ...(structural ? ["graph" as const] : []), ...(results.some((result) => result.status === "pass" && result.id.includes("test")) ? ["test" as const] : []), ...(state.findings.some((item) => item.code.startsWith("convention-")) ? [] : ["repository_rule" as const])];
    recordVerification(state, passed, results.map((result) => result.evidence).filter((item): item is string => Boolean(item)), supplied);
    const value = measure(state, changes, results);
    await this.store.saveTask(state); await this.store.saveMeasurement(value);
    return value;
  }

  async retry(id: string): Promise<void> {
    await this.store.updateTask(id, (state) => { state.attempts += 1; });
  }
}

async function injection(context: Awaited<ReturnType<typeof createContextPacket>>, skills: SkillName[]): Promise<string> {
  const loaded = await Promise.all(skills.slice(0, DEFAULT_INTERVENTION_BUDGET.skillInvocations).map(async (name) => { try { return await loadSkill(name); } catch { return ""; } }));
  return [STEERING_POLICY, formatContext(context), ...loaded.filter(Boolean)].join("\n\n");
}

function deduplicateFindings<T extends { code: string; evidence: string[] }>(findings: T[]): T[] {
  const seen = new Set<string>();
  return findings.filter((finding) => { const key = `${finding.code}:${finding.evidence.join(":")}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
