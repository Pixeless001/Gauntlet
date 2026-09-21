import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseTaskState, type TaskState } from "../core/task-state.js";
import type { TaskMeasurement } from "../core/measure.js";
import { MAX_STATE_BYTES } from "../core/policy.js";
import { migrateTaskV1 } from "./v1-migration.js";
import { migrateLegacyKeys } from "./v1-migration.js";
import { migrateTaskV2 } from "./v2-migration.js";
import { ArtifactStore } from "../output/store.js";

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
  async saveTask(state: TaskState) { const parsed = parseTaskState(state); if (resolve(parsed.repository) !== this.repository) throw new Error("Invalid Gauntlet task state"); await mkdir(join(this.directory, "tasks"), { recursive: true, mode: 0o700 }); await this.atomicWrite(this.taskPath(parsed.id), parsed); }
  async loadTask(id: string): Promise<TaskState> {
    const path = this.taskPath(id), content = await readFile(path, "utf8");
    if (Buffer.byteLength(content) > MAX_STATE_BYTES) throw new Error("Gauntlet state exceeds 256KB");
    let raw: unknown;
    try { raw = JSON.parse(content); } catch { throw new Error("Invalid Gauntlet task state"); }
    let migrated = migrateTaskV1(raw);
    if ((raw as { version?: unknown })?.version === 1) migrated = await importStoredReferences(this.repository, id, migrated);
    migrated = migrateTaskV2(migrated);
    let state: TaskState;
    try { state = parseTaskState(migrated); } catch { throw new Error("Invalid Gauntlet task state"); }
    if (state.id !== id || resolve(state.repository) !== this.repository) throw new Error("Invalid Gauntlet task state");
    if ((raw as { version?: unknown })?.version !== 3) await this.atomicWrite(path, state);
    return state;
  }
  async updateTask(id: string, update: (state: TaskState) => void): Promise<TaskState> {
    const lock = `${this.taskPath(id)}.lock`;
    for (let attempt = 0; ; attempt++) {
      try { await mkdir(lock); await writeFile(join(lock, "owner"), `${process.pid}\n${Date.now()}\n`); break; } catch (error) {
        if (!["EEXIST", "EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "") || attempt >= 250) throw error;
        try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000 && !await liveOwner(lock)) await rm(lock, { recursive: true, force: true }); } catch { /* another writer released it */ }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try { const state = await this.loadTask(id); update(state); await this.saveTask(state); return state; }
    finally { await rm(lock, { recursive: true, force: true }); }
  }
  async saveMeasurement(value: TaskMeasurement) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await this.atomicWrite(join(this.directory, "last-result.json"), value); }
  async loadMeasurement(): Promise<TaskMeasurement | null> {
    const path = join(this.directory, "last-result.json");
    try { const raw = JSON.parse(await readFile(path, "utf8")), migrated = migrateLegacyKeys(raw) as TaskMeasurement; if (!migrated || typeof migrated !== "object" || typeof migrated.taskId !== "string") return null; if (JSON.stringify(raw) !== JSON.stringify(migrated)) await this.atomicWrite(path, migrated); return migrated; } catch { return null; }
  }
}

async function importStoredReferences(repository: string, taskId: string, value: unknown): Promise<unknown> {
  const imported = new Map<string, string>(), store = new ArtifactStore(repository);
  const visit = async (item: unknown): Promise<unknown> => {
    if (Array.isArray(item)) return Promise.all(item.map(visit));
    if (item && typeof item === "object") return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await visit(child)])));
    if (typeof item !== "string" || !/^\.gauntlet[\\/]runs[\\/][\w-]+[\\/]outputs[\\/][\w-]+\.log$/.test(item)) return item;
    if (imported.has(item)) return imported.get(item)!;
    const path = resolve(repository, item), root = resolve(repository, ".gauntlet", "runs"); if (!path.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) return item;
    try { const output = await readFile(path, "utf8"), metadata = await store.put(taskId, { operation: "legacy-command", target: item, input: "", output, status: "unknown", semanticDescription: "Migrated command result", paths: [], symbols: [], processor: "log" }); imported.set(item, metadata.artifactRef); return metadata.artifactRef; } catch { return item; }
  };
  return visit(value);
}

async function liveOwner(lock: string): Promise<boolean> {
  try {
    const pid = Number((await readFile(join(lock, "owner"), "utf8")).split("\n")[0]);
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0); return true;
  } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}
