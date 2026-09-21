import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { CurrentValidWorld, GraphEvent, WorldPatch } from "./types.js";

export class GraphEventStore {
  private readonly root: string;
  constructor(cwd: string) { this.root = resolve(cwd, ".gauntlet", "sessions"); }

  async append(taskId: string, event: Omit<GraphEvent, "sequence">, world: CurrentValidWorld): Promise<GraphEvent> {
    const directory = this.directory(taskId); await mkdir(directory, { recursive: true, mode: 0o700 });
    return withLock(join(directory, ".events-lock"), async () => {
      const events = await this.read(taskId), previous = await this.resume(taskId), next = { ...event, sequence: (events.at(-1)?.sequence ?? 0) + 1 };
      const materialized = { ...world, appliedEvent: next.sequence }, stored = { ...next, patch: diffWorld(previous?.world, materialized) };
      await appendFile(join(directory, "events.jsonl"), `${JSON.stringify(stored)}\n`, { mode: 0o600 });
      await writeAtomic(join(directory, "world.json"), `${JSON.stringify({ sequence: next.sequence, world: materialized })}\n`);
      return next;
    });
  }

  async read(taskId: string, after = 0): Promise<GraphEvent[]> {
    try {
      const lines = (await readFile(join(this.directory(taskId), "events.jsonl"), "utf8")).split("\n").filter(Boolean);
      const events = lines.map((line) => JSON.parse(line) as GraphEvent);
      if (events.some((event, index) => !Number.isInteger(event.sequence) || event.sequence !== index + 1)) throw new Error("Invalid graph event sequence");
      return events.filter((event) => event.sequence > after);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }

  async resume(taskId: string): Promise<{ sequence: number; world: CurrentValidWorld } | null> {
    const events = await this.read(taskId);
    let checkpoint: { sequence: number; world: CurrentValidWorld } | null = null;
    try { checkpoint = JSON.parse(await readFile(join(this.directory(taskId), "world.json"), "utf8")) as { sequence: number; world: CurrentValidWorld }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    let world = checkpoint?.world, sequence = checkpoint?.sequence ?? 0;
    for (const event of events.filter((item) => item.sequence > sequence)) {
      if (event.world) world = event.world;
      else if (event.patch) world = applyPatch(world, event.patch);
      else throw new Error(`Graph event ${event.sequence} has no replayable state`);
      sequence = event.sequence;
    }
    return world ? { sequence, world } : null;
  }

  private directory(taskId: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) throw new Error("Invalid task id");
    const directory = resolve(this.root, taskId);
    if (!directory.startsWith(`${this.root}${sep}`)) throw new Error("Invalid task id");
    return directory;
  }
}

function diffWorld(before: CurrentValidWorld | undefined, after: CurrentValidWorld): WorldPatch[] {
  const patches: WorldPatch[] = [];
  visit(before, after, [], patches);
  return patches;
}

function visit(before: unknown, after: unknown, path: string[], patches: WorldPatch[]): void {
  if (same(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(after, key)) patches.push({ path: [...path, key], remove: true });
      else if (!Object.hasOwn(before, key)) patches.push({ path: [...path, key], value: after[key] });
      else visit(before[key], after[key], [...path, key], patches);
    }
    return;
  }
  patches.push({ path, value: after });
}

function applyPatch(before: CurrentValidWorld | undefined, patches: WorldPatch[]): CurrentValidWorld {
  let result: unknown = before === undefined ? undefined : structuredClone(before);
  for (const patch of patches) {
    if (!patch.path.length) {
      if (patch.remove) throw new Error("Graph replay cannot remove its root");
      result = structuredClone(patch.value);
      continue;
    }
    if (!isRecord(result)) throw new Error("Graph replay has no base world");
    let target: Record<string, unknown> = result;
    for (const key of patch.path.slice(0, -1)) {
      const value = target[key];
      if (!isRecord(value)) target[key] = {};
      target = target[key] as Record<string, unknown>;
    }
    const key = patch.path.at(-1)!;
    if (patch.remove) delete target[key]; else target[key] = structuredClone(patch.value);
  }
  if (!isRecord(result)) throw new Error("Graph replay produced no world");
  return result as unknown as CurrentValidWorld;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

async function writeAtomic(path: string, value: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 }); await rename(temporary, path);
}

async function withLock<T>(lock: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 250; attempt++) {
    try { await mkdir(lock); break; } catch (error) {
      if (!['EEXIST', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true }); } catch { /* lock was released */ }
      await new Promise((done) => setTimeout(done, 20));
    }
    if (attempt === 249) throw new Error("Timed out acquiring graph event lock");
  }
  try { return await run(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}
