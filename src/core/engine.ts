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
      return { state, injection: `${STEERING_POLICY}\n\n${formatContext(context)}`, clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const contract = extractContract(intent), baseline = await captureBaseline(this.cwd), profile = await detectRepository(this.cwd);
    const conventionProfile = await discoverConventions(this.cwd, contract.explicitPaths, undefined, baseline.index), conventions = selectConventionFacts(conventionProfile, contract);
    const context = await createContextPacket(this.cwd, contract, conventions, baseline.index);
    const ambiguity = detectAmbiguity(contract);
    const state: TaskState = { version: 1, id, repository: this.cwd, startedAt: new Date().toISOString(), contract, baseline, workingSet: context.entries.map((entry) => entry.path), repositoryFacts: await deriveFacts(this.cwd, profile), conventions, conventionMetrics: { hints: conventions.length, primitives: conventions.filter((fact) => fact.category === "primitive").length, interventions: 0, dependencyConflicts: 0, duplicates: 0, architectureBypasses: 0 }, activities: [], findings: [], attempts: 1 };
    await this.store.saveTask(state);
    return { state, injection: `${STEERING_POLICY}\n\n${formatContext(context)}`, clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null };
  }

  async activity(id: string, activity: TaskActivity): Promise<ActivityResult> {
    const state = await this.store.updateTask(id, (value) => {
      value.activities.push(activity); const loop = loopFinding(value);
      if (loop && !value.findings.some((finding) => finding.code === loop.code)) value.findings.push(loop);
    });
    const continuation = shouldCompact(state).compact ? compact(state) : null;
    return { state, continuation };
  }

  async finish(id: string): Promise<TaskMeasurement> {
    const state = await this.store.loadTask(id), changes = await changedFiles(this.cwd, state.baseline);
    const current = [...await evaluateGuards(this.cwd, state, changes), ...await inspectTestIntegrity(this.cwd, state.baseline.tests), ...await inspectConventionDrift(this.cwd, state, changes)];
    state.findings = deduplicateFindings(current);
    if (state.conventionMetrics) {
      state.conventionMetrics.dependencyConflicts = state.findings.filter((item) => item.code === "convention-dependency-conflict").length;
      state.conventionMetrics.duplicates = state.findings.filter((item) => item.code === "convention-duplicate-primitive").length;
      state.conventionMetrics.architectureBypasses = state.findings.filter((item) => item.code === "convention-architecture-bypass").length;
      state.conventionMetrics.interventions = state.findings.filter((item) => item.code.startsWith("convention-")).length;
    }
    const results = await runVerification(this.cwd, selectVerification(await detectRepository(this.cwd), changes));
    const value = measure(state, changes, results);
    await this.store.saveTask(state); await this.store.saveMeasurement(value);
    return value;
  }

  async retry(id: string): Promise<void> {
    await this.store.updateTask(id, (state) => { state.attempts += 1; });
  }
}

function deduplicateFindings<T extends { code: string; evidence: string[] }>(findings: T[]): T[] {
  const seen = new Set<string>();
  return findings.filter((finding) => { const key = `${finding.code}:${finding.evidence.join(":")}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
