import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskState } from "../core/task-state.js";
import type { TaskMeasurement } from "../core/measure.js";
import { MAX_STATE_BYTES } from "../core/policy.js";

export class StateStore {
  readonly directory: string;
  constructor(cwd: string) { this.directory = join(cwd, ".gauntlet"); }
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
    if (state.version !== 1 || state.id !== id || typeof state.repository !== "string" || !Array.isArray(state.activities)) throw new Error("Invalid Gauntlet task state");
    return state;
  }
  async updateTask(id: string, update: (state: TaskState) => void): Promise<TaskState> {
    const lock = `${this.taskPath(id)}.lock`;
    for (let attempt = 0; ; attempt++) {
      try { await mkdir(lock); await writeFile(join(lock, "owner"), `${process.pid}\n${Date.now()}\n`); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 250) throw error;
        try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true }); } catch { /* another writer released it */ }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try { const state = await this.loadTask(id); update(state); await this.saveTask(state); return state; }
    finally { await rm(lock, { recursive: true, force: true }); }
  }
  async saveMeasurement(value: TaskMeasurement) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await this.atomicWrite(join(this.directory, "last-result.json"), value); }
}
