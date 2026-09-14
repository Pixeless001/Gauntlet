import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskState } from "../core/task-state.js";
import type { TaskMeasurement } from "../core/measure.js";

export class StateStore {
  readonly directory: string;
  constructor(cwd: string) { this.directory = join(cwd, ".gauntlet"); }
  private taskPath(id: string) { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid task id"); return join(this.directory, "tasks", `${id}.json`); }
  private async atomicWrite(path: string, value: unknown) { const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(temporary, path); }
  async saveTask(state: TaskState) { await mkdir(join(this.directory, "tasks"), { recursive: true, mode: 0o700 }); await this.atomicWrite(this.taskPath(state.id), state); }
  async loadTask(id: string): Promise<TaskState> { return JSON.parse(await readFile(this.taskPath(id), "utf8")) as TaskState; }
  async saveMeasurement(value: TaskMeasurement) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await this.atomicWrite(join(this.directory, "last-result.json"), value); }
}
