import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ToolPayload } from "../core/events.js";
import type { CommandResult } from "../repo/process.js";
import { processArtifact } from "./processors.js";

export type ArtifactDetail = "reference" | "concise" | "detailed" | "raw";
export interface ArtifactMetadata {
  version: 2;
  id: string;
  taskId: string;
  artifactRef: string;
  operation: string;
  target?: string;
  status: ToolPayload["status"];
  semanticDescription: string;
  paths: string[];
  symbols: string[];
  eventIndex: number;
  processor: ToolPayload["processor"];
  inputHash: string;
  outputHash: string;
  inputBytes: number;
  outputBytes: number;
  createdAt: string;
}

export interface ArtifactReadOptions { detail?: ArtifactDetail; lines?: { start: number; end: number } }

export class ArtifactStore {
  private readonly root: string;
  constructor(private readonly cwd: string) { this.root = resolve(cwd, ".gauntlet", "sessions"); }

  async put(taskId: string, payload: ToolPayload, eventIndex = 0, goal = "", uncertainty = ""): Promise<ArtifactMetadata> {
    validateId(taskId, "task");
    const taskRoot = resolve(this.root, taskId), artifacts = join(taskRoot, "artifacts"), lock = join(taskRoot, ".artifact-lock");
    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    await acquire(lock);
    try {
      const id = await nextId(artifacts), directory = join(artifacts, id);
      await mkdir(directory, { mode: 0o700 });
      const input = Buffer.from(payload.input), output = Buffer.from(payload.output), artifactRef = `artifact://${taskId}/${id}`;
      const metadata: ArtifactMetadata = {
        version: 2, id, taskId, artifactRef, operation: payload.operation, ...(payload.target ? { target: payload.target } : {}), status: payload.status,
        semanticDescription: payload.semanticDescription?.trim() || describe(payload, goal, uncertainty), paths: payload.paths, symbols: payload.symbols, eventIndex, processor: payload.processor,
        inputHash: hash(input), outputHash: hash(output), inputBytes: input.length, outputBytes: output.length, createdAt: new Date().toISOString(),
      };
      await atomicWrite(join(directory, "input.bin"), input);
      await atomicWrite(join(directory, "output.bin"), output);
      await atomicWrite(join(directory, "concise.txt"), Buffer.from(processArtifact(payload)));
      await atomicWrite(join(directory, "metadata.json"), Buffer.from(JSON.stringify(metadata, null, 2)));
      await prune(artifacts, id);
      return metadata;
    } finally { await rm(lock, { recursive: true, force: true }); }
  }

  async metadata(handle: string): Promise<ArtifactMetadata> {
    const { taskId, id } = parseHandle(handle), directory = this.directory(taskId, id);
    return JSON.parse(await readFile(join(directory, "metadata.json"), "utf8")) as ArtifactMetadata;
  }

  async raw(handle: string): Promise<Buffer> {
    const { taskId, id } = parseHandle(handle);
    return readFile(join(this.directory(taskId, id), "output.bin"));
  }

  async read(handle: string, options: ArtifactReadOptions = {}): Promise<string> {
    const detail = options.detail ?? "concise";
    if (detail === "reference") return handle;
    const metadata = await this.metadata(handle);
    let value = detail === "concise" ? await readFile(join(this.directory(metadata.taskId, metadata.id), "concise.txt"), "utf8") : (await this.raw(handle)).toString("utf8");
    if (detail === "detailed") value = value.slice(0, 64_000);
    if (options.lines) value = lineRange(value, options.lines);
    return value;
  }

  private directory(taskId: string, id: string): string {
    validateId(taskId, "task"); validateId(id, "artifact");
    const path = resolve(this.root, taskId, "artifacts", id);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Invalid artifact path");
    return path;
  }
}

export async function storeOutput(cwd: string, result: CommandResult, taskId = "verification", eventIndex = 0): Promise<string> {
  const status = result.timedOut ? "timeout" : result.exitCode === 0 ? "pass" : result.exitCode === null ? "unavailable" : "fail";
  const payload: ToolPayload = { operation: result.command, input: result.command, output: JSON.stringify({ stdout: result.stdout, stderr: result.stderr }), status, semanticDescription: `Command result for ${result.command}`, paths: [], symbols: [], processor: "log" };
  return (await new ArtifactStore(cwd).put(taskId, payload, eventIndex)).artifactRef;
}

export function parseArtifactHandle(handle: string): { taskId: string; id: string } { return parseHandle(handle); }

function parseHandle(handle: string): { taskId: string; id: string } {
  const match = /^artifact:\/\/([a-zA-Z0-9_-]{1,128})\/(t_\d{6})$/.exec(handle);
  if (!match) throw new Error("Invalid artifact handle");
  return { taskId: match[1]!, id: match[2]! };
}

function validateId(value: string, kind: "task" | "artifact"): void {
  const valid = kind === "task" ? /^[a-zA-Z0-9_-]{1,128}$/.test(value) : /^t_\d{6}$/.test(value);
  if (!valid) throw new Error(`Invalid ${kind} id`);
}

async function nextId(directory: string): Promise<string> {
  const values = await readdir(directory, { withFileTypes: true });
  const number = values.filter((item) => item.isDirectory() && /^t_\d{6}$/.test(item.name)).reduce((max, item) => Math.max(max, Number(item.name.slice(2))), 0) + 1;
  if (number > 999_999) throw new Error("Artifact id capacity reached");
  return `t_${String(number).padStart(6, "0")}`;
}

async function atomicWrite(path: string, value: Buffer): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await rename(temporary, path);
}

async function acquire(lock: string): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    try { await mkdir(lock); return; } catch (error) {
      if (!["EEXIST", "EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) await rm(lock, { recursive: true, force: true }); } catch { /* released */ }
      await new Promise((done) => setTimeout(done, 20));
    }
  }
  throw new Error("Timed out acquiring artifact lock");
}

async function prune(directory: string, current: string): Promise<void> {
  const values = (await readdir(directory, { withFileTypes: true })).filter((item) => item.isDirectory() && /^t_\d{6}$/.test(item.name) && item.name !== current).sort((a, b) => a.name.localeCompare(b.name));
  if (values.length < 100) return;
  const records = await Promise.all(values.map(async (item) => { try { return { item, metadata: JSON.parse(await readFile(join(directory, item.name, "metadata.json"), "utf8")) as ArtifactMetadata }; } catch { return { item, metadata: null }; } }));
  const successful = records.filter((record) => record.metadata?.status === "pass");
  const remove = successful.slice(0, Math.max(0, successful.length - 99));
  await Promise.all(remove.map((record) => rm(join(directory, record.item.name), { recursive: true, force: true })));
}

function describe(payload: ToolPayload, goal: string, uncertainty: string): string {
  return [payload.operation, payload.target ? `on ${payload.target}` : "", goal ? `for ${goal}` : "", uncertainty ? `while resolving ${uncertainty}` : ""].filter(Boolean).join(" ");
}

function hash(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function lineRange(value: string, lines: { start: number; end: number }): string {
  if (!Number.isInteger(lines.start) || !Number.isInteger(lines.end) || lines.start < 1 || lines.end < lines.start) throw new Error("Invalid artifact line range");
  return value.split(/\r?\n/).slice(lines.start - 1, lines.end).join("\n");
}
