import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { TaskState } from "../core/task-state.js";
import type { TaskMeasurement } from "../core/measure.js";
import { MAX_STATE_BYTES } from "../core/policy.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../core/policy.js";
import { initialUncertainty } from "../control/uncertainty.js";
import { assessRisk } from "../core/risk.js";

export class StateStore {
  readonly directory: string;
  private readonly repository: string;
  constructor(cwd: string) { this.repository = resolve(cwd); this.directory = join(this.repository, ".gauntlet"); }
  private taskPath(id: string) { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid task id"); return join(this.directory, "tasks", `${id}.json`); }
  private async atomicWrite(path: string, value: unknown) {
    const content = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(content) > MAX_STATE_BYTES) throw new Error("Gauntlet state exceeds 256KB");
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path);
  }
  async saveTask(state: TaskState) { await mkdir(join(this.directory, "tasks"), { recursive: true, mode: 0o700 }); await this.atomicWrite(this.taskPath(state.id), state); }
  async loadTask(id: string): Promise<TaskState> {
    const content = await readFile(this.taskPath(id), "utf8");
    if (Buffer.byteLength(content) > MAX_STATE_BYTES) throw new Error("Gauntlet state exceeds 256KB");
    const state = JSON.parse(content) as TaskState;
    if (state.version !== 1 || state.id !== id || typeof state.repository !== "string" || resolve(state.repository) !== this.repository || !Array.isArray(state.activities)) throw new Error("Invalid Gauntlet task state");
    if (state.session) state.session = {
      currentApproach: state.session.currentApproach ?? "", decisions: state.session.decisions ?? [], resolvedIssues: state.session.resolvedIssues ?? [], unresolvedIssues: state.session.unresolvedIssues ?? [], failedApproaches: state.session.failedApproaches ?? [], activeSkills: state.session.activeSkills ?? [], lastCompactedActivity: state.session.lastCompactedActivity ?? 0, compactions: state.session.compactions ?? 0, budget: state.session.budget ?? { ...DEFAULT_INTERVENTION_BUDGET }, observations: state.session.observations ?? [], repeatReadsDetected: state.session.repeatReadsDetected ?? 0, searches: state.session.searches ?? [], repeatSearchesDetected: state.session.repeatSearchesDetected ?? 0, uncertainty: state.session.uncertainty ?? initialUncertainty(state.contract, assessRisk(state.contract).level), selectionTraces: state.session.selectionTraces ?? [], interventionsUsed: state.session.interventionsUsed ?? state.session.activeSkills?.length ?? 0, ...(state.session.execution ? { execution: { ...state.session.execution, events: state.session.execution.events ?? [], nextEvent: state.session.execution.nextEvent ?? 0 } } : {}),
    };
    return state;
  }
  async updateTask(id: string, update: (state: TaskState) => void): Promise<TaskState> {
    const lock = `${this.taskPath(id)}.lock`;
    for (let attempt = 0; ; attempt++) {
      try { await mkdir(lock); await writeFile(join(lock, "owner"), `${process.pid}\n${Date.now()}\n`); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 250) throw error;
        try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000 && !await liveOwner(lock)) await rm(lock, { recursive: true, force: true }); } catch { /* another writer released it */ }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try { const state = await this.loadTask(id); update(state); await this.saveTask(state); return state; }
    finally { await rm(lock, { recursive: true, force: true }); }
  }
  async saveMeasurement(value: TaskMeasurement) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await this.atomicWrite(join(this.directory, "last-result.json"), value); }
}

async function liveOwner(lock: string): Promise<boolean> {
  try {
    const pid = Number((await readFile(join(lock, "owner"), "utf8")).split("\n")[0]);
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0); return true;
  } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}
