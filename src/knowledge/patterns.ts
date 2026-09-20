import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type PatternStatus = "observed" | "supported" | "promoted";
export type PatternKind = "skill" | "selector" | "repository-rule" | "proof-policy" | "context-policy" | "reference";
export interface ExperiencePattern {
  id: string; kind: PatternKind; status: PatternStatus; summary: string; taskClasses: string[];
  supportingProof: string[]; contradictingProof: string[]; repositoryFingerprint?: string; updatedAt: string;
}

const MAX_PATTERNS = 200, MAX_TEXT = 1_000;
export class PatternStore {
  private readonly path: string;
  constructor(cwd: string) { this.path = join(cwd, ".gauntlet", "knowledge", "patterns.json"); }
  async list(): Promise<ExperiencePattern[]> {
    try { const value = JSON.parse(await readFile(this.path, "utf8")) as { version?: number; patterns?: unknown[] }; return value.version === 1 && Array.isArray(value.patterns) ? value.patterns.filter(valid).slice(-MAX_PATTERNS) : []; }
    catch { return []; }
  }
  async put(pattern: ExperiencePattern): Promise<void> {
    if (!valid(pattern)) throw new Error("Invalid experience pattern");
    const values = await this.list(), patterns = [...values.filter((item) => item.id !== pattern.id), pattern].slice(-MAX_PATTERNS), directory = join(this.path, "..");
    await mkdir(directory, { recursive: true, mode: 0o700 }); const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, patterns }), { mode: 0o600 }); await rename(temporary, this.path);
  }
}

function valid(value: unknown): value is ExperiencePattern {
  if (!value || typeof value !== "object") return false; const item = value as ExperiencePattern;
  return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(item.id) && ["skill", "selector", "repository-rule", "proof-policy", "context-policy", "reference"].includes(item.kind) && ["observed", "supported", "promoted"].includes(item.status) && typeof item.summary === "string" && item.summary.length > 0 && item.summary.length <= MAX_TEXT && Array.isArray(item.taskClasses) && Array.isArray(item.supportingProof) && Array.isArray(item.contradictingProof) && typeof item.updatedAt === "string";
}
