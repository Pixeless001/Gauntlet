import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { RepoIndex } from "./index.js";
import { walk } from "./tests.js";
import type { TaskContract } from "../core/events.js";
import type { ConventionFact } from "./conventions.js";

export interface ContextEntry { path: string; reason: string; score: number }
export interface ContextPacket { entries: ContextEntry[]; instructions: string[]; conventions: ConventionFact[]; excluded: number }

export async function selectContext(cwd: string, contract: TaskContract, limit = 12, conventions: ConventionFact[] = [], index?: RepoIndex): Promise<ContextPacket> {
  const files = index?.files ?? await walk(cwd);
  const terms = contract.intent.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g)?.filter((term) => !["the", "and", "with", "from", "this", "that", "add", "fix"].includes(term)) ?? [];
  const scored = files.map((path): ContextEntry => {
    const lower = path.toLowerCase(); let score = contract.explicitPaths.some((item) => lower.includes(item.replaceAll("*", "").toLowerCase())) ? 20 : 0;
    score += terms.filter((term) => lower.includes(term)).length * 3;
    if (/(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) score += 2;
    if (["package.json", "tsconfig.json", "cargo.toml", "pyproject.toml"].includes(basename(lower))) score += 1;
    return { path, score, reason: score >= 20 ? "explicit task scope" : /test|spec/.test(lower) ? "related test candidate" : "task term match" };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const targets = [...contract.explicitPaths, ...scored.slice(0, limit).map((entry) => entry.path)];
  const instructionFiles = files.filter((path) => ["AGENTS.md", "CLAUDE.md"].includes(basename(path))).filter((path) => {
    const scope = dirname(path); return scope === "." || targets.some((target) => target === scope || target.startsWith(`${scope}/`));
  }).sort((a, b) => dirname(a).split("/").length - dirname(b).split("/").length || a.localeCompare(b));
  const instructions: string[] = [];
  for (const path of instructionFiles.slice(-4)) instructions.push(`${path}: ${(await readFile(join(cwd, path), "utf8")).slice(0, 2_000)}`);
  return { entries: scored.slice(0, limit), instructions, conventions: conventions.slice(0, 3), excluded: Math.max(0, scored.length - limit) };
}

export function relatedTestCandidates(changed: string[], files: string[]): string[] {
  const stems = changed.map((file) => basename(file, extname(file)).replace(/\.(?:test|spec)$/, ""));
  return files.filter((file) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(file) && stems.some((stem) => basename(file).startsWith(stem)));
}
