import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseTaskState } from "../core/task-state.js";
import { MAX_STATE_BYTES } from "../core/policy.js";
import { migrateTaskV1 } from "./v1-migration.js";
import { migrateLegacyKeys } from "./v1-migration.js";
import { migrateTaskV2 } from "./v2-migration.js";
import { ArtifactStore } from "../output/store.js";
import { GraphEventStore } from "../work/event-store.js";
import { fingerprint as worldFingerprint } from "../work/graph.js";
const MAX_BASELINE_BYTES = 32_000_000;
export class StateStore {
    directory;
    repository;
    constructor(cwd) { this.repository = resolve(cwd); this.directory = join(this.repository, ".gauntlet"); }
    taskPath(id) { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
        throw new Error("Invalid task id"); return join(this.directory, "tasks", `${id}.json`); }
    baselinePath(id) { return this.taskPath(id).replace(/\.json$/, ".baseline.json"); }
    async atomicWrite(path, value, limit = MAX_STATE_BYTES) {
        const content = JSON.stringify(value, null, 2);
        if (Buffer.byteLength(content) > limit)
            throw new Error(`Gauntlet state exceeds ${limit / 1000}KB`);
        const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(temporary, content, { mode: 0o600 });
        await rename(temporary, path);
    }
    async saveTask(state) { const parsed = parseTaskState(state); if (resolve(parsed.repository) !== this.repository)
        throw new Error("Invalid Gauntlet task state"); await mkdir(join(this.directory, "tasks"), { recursive: true, mode: 0o700 }); await this.persist(parsed); }
    // Repo-sized baseline data (file index, fingerprints, test signatures) lives in a sidecar so it can't trip the task state cap.
    async persist(state) {
        const { files, tests, index, ...small } = state.baseline, sidecar = { files, tests, index }, path = this.baselinePath(state.id);
        if (await readFile(path, "utf8").catch(() => null) !== JSON.stringify(sidecar, null, 2))
            await this.atomicWrite(path, sidecar, MAX_BASELINE_BYTES);
        await this.atomicWrite(this.taskPath(state.id), { ...state, baseline: small });
    }
    async loadTask(id) {
        const path = this.taskPath(id), content = await readFile(path, "utf8");
        if (Buffer.byteLength(content) > MAX_STATE_BYTES)
            throw new Error("Gauntlet state exceeds 256KB");
        let raw;
        try {
            raw = JSON.parse(content);
        }
        catch {
            throw new Error("Invalid Gauntlet task state");
        }
        raw = await this.joinBaseline(id, raw);
        let migrated = migrateTaskV1(raw);
        if (raw?.version === 1)
            migrated = await importStoredReferences(this.repository, id, migrated);
        migrated = normalizeWorld(migrateTaskV2(migrated));
        let state;
        try {
            state = parseTaskState(migrated);
        }
        catch {
            throw new Error("Invalid Gauntlet task state");
        }
        if (state.id !== id || resolve(state.repository) !== this.repository)
            throw new Error("Invalid Gauntlet task state");
        const checkpoint = await new GraphEventStore(this.repository).resume(id), replay = Boolean(checkpoint && checkpoint.sequence > state.world.appliedEvent);
        if (replay)
            state = parseTaskState(normalizeWorld({ ...state, world: checkpoint.world }));
        if (raw?.version !== 3 || replay || JSON.stringify(raw) !== JSON.stringify(state))
            await this.persist(state);
        return state;
    }
    async joinBaseline(id, raw) {
        const baseline = raw?.baseline;
        if (!baseline || typeof baseline !== "object" || "files" in baseline)
            return raw;
        let side;
        try {
            const text = await readFile(this.baselinePath(id), "utf8");
            if (Buffer.byteLength(text) > MAX_BASELINE_BYTES)
                throw 0;
            side = JSON.parse(text);
        }
        catch {
            throw new Error("Invalid Gauntlet task state");
        }
        const { head, status, dependencies, publicExports } = baseline;
        return { ...raw, baseline: { head, status, dependencies, files: side.files, tests: side.tests, ...(publicExports === undefined ? {} : { publicExports }), ...(side.index === undefined ? {} : { index: side.index }) } };
    }
    async updateTask(id, update) {
        return this.withTaskLock(id, async () => { const state = await this.loadTask(id); update(state); await this.saveTask(state); return state; });
    }
    async updateTaskWithWorldEvent(id, update) {
        return this.withTaskLock(id, async () => {
            const state = await this.loadTask(id), event = update(state), events = event ? (Array.isArray(event) ? event : [event]) : [];
            for (const item of events)
                state.world.appliedEvent = (await new GraphEventStore(this.repository).append(id, item, state.world)).sequence;
            await this.saveTask(state);
            return state;
        });
    }
    async withTaskLock(id, run) {
        const lock = `${this.taskPath(id)}.lock`;
        for (let attempt = 0;; attempt++) {
            try {
                await mkdir(lock);
                await writeFile(join(lock, "owner"), `${process.pid}\n${Date.now()}\n`);
                break;
            }
            catch (error) {
                if (!["EEXIST", "EPERM", "EACCES"].includes(error.code ?? "") || attempt >= 250)
                    throw error;
                try {
                    if (Date.now() - (await stat(lock)).mtimeMs > 30_000 && !await liveOwner(lock))
                        await rm(lock, { recursive: true, force: true });
                }
                catch { /* another writer released it */ }
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        }
        try {
            return await run();
        }
        finally {
            await rm(lock, { recursive: true, force: true });
        }
    }
    async saveMeasurement(value) { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await this.atomicWrite(join(this.directory, "last-result.json"), value); await appendFile(join(this.directory, "history.jsonl"), `${JSON.stringify(value)}\n`, { mode: 0o600 }); }
    async loadMeasurement() {
        const path = join(this.directory, "last-result.json");
        try {
            const raw = JSON.parse(await readFile(path, "utf8")), migrated = migrateLegacyKeys(raw);
            if (!migrated || typeof migrated !== "object" || typeof migrated.taskId !== "string")
                return null;
            if (JSON.stringify(raw) !== JSON.stringify(migrated))
                await this.atomicWrite(path, migrated);
            return migrated;
        }
        catch {
            return null;
        }
    }
}
function normalizeWorld(value) {
    if (!value || typeof value !== "object")
        return value;
    const task = value, world = task.world;
    if (!world || typeof world !== "object")
        return task;
    const current = world, contract = task.contract;
    const stored = current.fingerprint && typeof current.fingerprint === "object" ? current.fingerprint : null;
    const fingerprint = stored && (!("config" in stored) || !("upstream" in stored)) ? (() => {
        const inputs = { contract: String(stored.contract ?? ""), files: stored.files, packages: stored.packages, config: stored.config ?? {}, upstream: stored.upstream ?? {}, rules: String(stored.rules ?? ""), runtime: String(stored.runtime ?? "") };
        return { ...inputs, value: worldFingerprint(inputs) };
    })() : stored;
    return { ...task, world: { ...current, ...("contract" in current ? {} : { contract: task.contract }), ...("expectedScope" in current ? {} : { expectedScope: Array.isArray(contract?.expectedFrontier) ? contract.expectedFrontier : [] }), ...(fingerprint ? { fingerprint } : {}) } };
}
async function importStoredReferences(repository, taskId, value) {
    const imported = new Map(), store = new ArtifactStore(repository);
    const visit = async (item) => {
        if (Array.isArray(item))
            return Promise.all(item.map(visit));
        if (item && typeof item === "object")
            return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, await visit(child)])));
        if (typeof item !== "string" || !/^\.gauntlet[\\/]runs[\\/][\w-]+[\\/]outputs[\\/][\w-]+\.log$/.test(item))
            return item;
        if (imported.has(item))
            return imported.get(item);
        const path = resolve(repository, item), root = resolve(repository, ".gauntlet", "runs");
        if (!path.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`))
            return item;
        try {
            const output = await readFile(path, "utf8"), metadata = await store.put(taskId, { operation: "legacy-command", target: item, input: "", output, status: "unknown", semanticDescription: "Migrated command result", paths: [], symbols: [], processor: "log" });
            imported.set(item, metadata.artifactRef);
            return metadata.artifactRef;
        }
        catch {
            return item;
        }
    };
    return visit(value);
}
async function liveOwner(lock) {
    try {
        const pid = Number((await readFile(join(lock, "owner"), "utf8")).split("\n")[0]);
        if (!Number.isSafeInteger(pid) || pid <= 0)
            return false;
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === "EPERM";
    }
}
