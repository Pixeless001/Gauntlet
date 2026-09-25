import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { scheduleReady } from "../work/scheduler.js";
export class NativeExecutionEngine {
    cwd;
    execute;
    concurrency;
    capabilities;
    controllers = new Map();
    constructor(cwd, execute, concurrency = 4, capabilities = {}) {
        this.cwd = cwd;
        this.execute = execute;
        this.concurrency = concurrency;
        this.capabilities = capabilities;
    }
    async runReady(nodes, signal) {
        const selected = scheduleReady(nodes, { isolatedMutation: this.capabilities.isolatedMutation ?? false, maxLocal: Math.min(4, Math.max(1, this.concurrency)), maxWorkers: 1 });
        const results = await Promise.allSettled(selected.map(async (node) => {
            const controller = new AbortController();
            this.controllers.set(node.id, controller);
            const abort = () => controller.abort();
            signal?.addEventListener("abort", abort, { once: true });
            try {
                return await this.execute(node, controller.signal);
            }
            finally {
                signal?.removeEventListener("abort", abort);
                this.controllers.delete(node.id);
            }
        }));
        const failure = results.find((result) => result.status === "rejected");
        if (failure)
            throw failure.reason;
        return results.map((result) => result.value);
    }
    async cancel(ids) { for (const id of ids)
        this.controllers.get(id)?.abort(); }
    async checkpoint(taskId, world) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId))
            throw new Error("Invalid task id");
        const directory = resolve(this.cwd, ".gauntlet", "sessions", taskId), path = join(directory, "native-checkpoint.json");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(world), { mode: 0o600 });
        await rename(temporary, path);
    }
    async resume(taskId) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId))
            throw new Error("Invalid task id");
        try {
            return JSON.parse(await readFile(join(this.cwd, ".gauntlet", "sessions", taskId, "native-checkpoint.json"), "utf8"));
        }
        catch (error) {
            if (error.code === "ENOENT")
                return null;
            throw error;
        }
    }
}
