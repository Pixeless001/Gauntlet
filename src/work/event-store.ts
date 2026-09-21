import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { CurrentValidWorld, GraphEvent } from "./types.js";

export class GraphEventStore {
  private readonly root: string;
  constructor(cwd: string) { this.root = resolve(cwd, ".gauntlet", "sessions"); }

  async append(taskId: string, event: Omit<GraphEvent, "sequence">, world: CurrentValidWorld): Promise<GraphEvent> {
    const directory = this.directory(taskId); await mkdir(directory, { recursive: true, mode: 0o700 });
    const events = await this.read(taskId), next = { ...event, sequence: (events.at(-1)?.sequence ?? 0) + 1 };
    await writeAtomic(join(directory, "events.jsonl"), `${[...events, next].map((item) => JSON.stringify(item)).join("\n")}\n`);
    await writeAtomic(join(directory, "world.json"), `${JSON.stringify({ sequence: next.sequence, world })}\n`);
    return next;
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
    try { return JSON.parse(await readFile(join(this.directory(taskId), "world.json"), "utf8")) as { sequence: number; world: CurrentValidWorld }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  private directory(taskId: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)) throw new Error("Invalid task id");
    const directory = resolve(this.root, taskId);
    if (!directory.startsWith(`${this.root}${sep}`)) throw new Error("Invalid task id");
    return directory;
  }
}

async function writeAtomic(path: string, value: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 }); await rename(temporary, path);
}
