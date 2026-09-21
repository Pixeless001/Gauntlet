import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { CandidateResult, CurrentValidWorld, ExecutionEngine, WorkNode } from "../work/types.js";
import { scheduleReady, type SchedulerCapabilities } from "../work/scheduler.js";

export type NativeNodeExecutor = (node: WorkNode, signal: AbortSignal) => Promise<CandidateResult>;

export class NativeExecutionEngine implements ExecutionEngine {
  private readonly controllers = new Map<string, AbortController>();
  constructor(private readonly cwd: string, private readonly execute: NativeNodeExecutor, private readonly concurrency = 4, private readonly capabilities: Partial<SchedulerCapabilities> = {}) {}

  async runReady(nodes: WorkNode[], signal?: AbortSignal): Promise<CandidateResult[]> {
    const selected = scheduleReady(nodes, { isolatedMutation: this.capabilities.isolatedMutation ?? false, maxLocal: Math.min(4, Math.max(1, this.concurrency)), maxWorkers: 1 });
    const results = await Promise.allSettled(selected.map(async (node) => {
      const controller = new AbortController(); this.controllers.set(node.id, controller);
      const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
      try { return await this.execute(node, controller.signal); }
      finally { signal?.removeEventListener("abort", abort); this.controllers.delete(node.id); }
    }));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
    return results.map((result) => (result as PromiseFulfilledResult<CandidateResult>).value);
  }

  async cancel(ids: string[]): Promise<void> { for (const id of ids) this.controllers.get(id)?.abort(); }

  async checkpoint(taskId: string, world: CurrentValidWorld): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) throw new Error("Invalid task id");
    const directory = resolve(this.cwd, ".gauntlet", "sessions", taskId), path = join(directory, "native-checkpoint.json");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(world), { mode: 0o600 }); await rename(temporary, path);
  }

  async resume(taskId: string): Promise<CurrentValidWorld | null> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) throw new Error("Invalid task id");
    try { return JSON.parse(await readFile(join(this.cwd, ".gauntlet", "sessions", taskId, "native-checkpoint.json"), "utf8")) as CurrentValidWorld; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
}
