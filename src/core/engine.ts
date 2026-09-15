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

export interface StartResult { state: TaskState; injection: string; clarification: string | null }
export interface ActivityResult { state: TaskState; continuation: ContinuationRecord | null }
export class GauntletEngine {
  private readonly store: StateStore;
  constructor(readonly cwd: string) { this.store = new StateStore(cwd); }

  async start(intent: string, id: string = randomUUID()): Promise<StartResult> {
    try {
      const state = await this.store.loadTask(id);
      const context = await createContextPacket(this.cwd, state.contract, state.conventions, state.baseline.index);
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
    const state: TaskState = { version: 1, id, repository: this.cwd, startedAt: new Date().toISOString(), contract, baseline, workingSet: context.entries.map((entry) => entry.path), repositoryFacts: await deriveFacts(this.cwd, profile), conventions, conventionMetrics: { hints: conventions.length, primitives: conventions.filter((fact) => fact.category === "primitive").length, interventions: 0, dependencyConflicts: 0, duplicates: 0, architectureBypasses: 0 }, activities: [], findings: [], attempts: 1, session: { currentApproach: "", decisions: [], resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills: routeSkills(contract, "start", risk.level), lastCompactedActivity: 0, compactions: 0, budget: { ...DEFAULT_INTERVENTION_BUDGET }, observations: [], repeatReadsDetected: 0, searches: [], repeatSearchesDetected: 0 } };
    await this.store.saveTask(state);
    return { state, injection: await injection(context, state.session?.activeSkills ?? []), clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null };
  }

  async activity(id: string, activity: TaskActivity): Promise<ActivityResult> {
    const fingerprint = activity.kind === "file_read" && activity.target && !activity.target.startsWith("../") && !activity.target.startsWith("/") ? (await fingerprintFiles(this.cwd, [activity.target]))[activity.target] : undefined;
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
    });
    const decision = shouldCompact(state), continuation = decision.compact ? compact(state) : null;
    if (continuation) await this.store.updateTask(id, (value) => { if (value.session) { value.session.lastCompactedActivity = value.activities.length; value.session.compactions += 1; } });
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
    const results = await runVerification(this.cwd, selectVerification(await detectRepository(this.cwd), changes, state.baseline.index?.files), undefined, state.id);
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
