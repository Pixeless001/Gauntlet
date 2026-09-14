import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { z } from "zod";
import type { TaskContract } from "../core/events.js";
import { walk } from "./tests.js";
import type { RepoIndex } from "./index.js";

export const conventionStrength = z.enum(["strong", "medium", "weak"]);
const sourceSchema = z.object({ path: z.string().max(500), fingerprint: z.string().length(64) });
const factSchema = z.object({
  id: z.string().max(100), category: z.enum(["tooling", "primitive", "architecture", "testing", "api"]),
  value: z.string().max(200), strength: conventionStrength, scope: z.string().max(500),
  sources: z.array(sourceSchema).max(6), representatives: z.array(z.string().max(500)).max(4),
});
const profileSchema = z.object({ version: z.literal(1), facts: z.array(factSchema).max(80) });
export type ConventionFact = z.infer<typeof factSchema>;
export type RepoConventionProfile = z.infer<typeof profileSchema>;
export interface ConventionBudget { maxFiles: number; maxBytes: number; maxFacts: number; maxSearchResults: number }
export const DEFAULT_CONVENTION_BUDGET: ConventionBudget = { maxFiles: 400, maxBytes: 256_000, maxFacts: 3, maxSearchResults: 30 };

async function hashFile(cwd: string, path: string) {
  try { return createHash("sha256").update(await readFile(join(cwd, path))).digest("hex"); } catch { return createHash("sha256").update("missing").digest("hex"); }
}

async function source(cwd: string, path: string) { return { path, fingerprint: await hashFile(cwd, path) }; }

export class ConventionCache {
  readonly path: string;
  constructor(private readonly cwd: string) { this.path = join(cwd, ".gauntlet", "repo-profile.json"); }
  async load(): Promise<RepoConventionProfile> {
    try {
      if ((await stat(this.path)).size > 64_000) return { version: 1, facts: [] };
      const parsed = profileSchema.safeParse(JSON.parse(await readFile(this.path, "utf8")));
      if (!parsed.success) return { version: 1, facts: [] };
      const facts: ConventionFact[] = [];
      for (const fact of parsed.data.facts) {
        const valid = await Promise.all(fact.sources.map(async (item) => item.fingerprint === await hashFile(this.cwd, item.path)));
        if (valid.every(Boolean)) facts.push(fact);
      }
      return { version: 1, facts };
    } catch { return { version: 1, facts: [] }; }
  }
  async save(profile: RepoConventionProfile) {
    const value = profileSchema.parse(profile), content = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(content) > 64_000) throw new Error("Convention profile exceeds 64KB");
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`; await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, this.path);
  }
}

const dependencyCapabilities: Record<string, [string, string[]]> = {
  zod: ["validation", ["zod"]], joi: ["validation", ["joi"]], yup: ["validation", ["yup"]], ajv: ["validation", ["ajv"]],
  axios: ["http", ["axios"]], got: ["http", ["got"]], "node-fetch": ["http", ["node-fetch"]],
  pino: ["logging", ["pino"]], winston: ["logging", ["winston"]],
  vitest: ["test-runner", ["vitest"]], jest: ["test-runner", ["jest"]], mocha: ["test-runner", ["mocha"]],
};
export function dependencyCapability(name: string) { return dependencyCapabilities[name]?.[0] ?? null; }

async function packageFacts(cwd: string, files: string[], budget: ConventionBudget): Promise<ConventionFact[]> {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string>; type?: string };
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }, src = [await source(cwd, "package.json")], facts: ConventionFact[] = [];
    const installed = Object.entries(dependencyCapabilities).filter(([name]) => name in dependencies), usage = new Map(installed.map(([name]) => [name, [] as string[]])); let bytes = 0;
    for (const path of files.filter((file) => /\.[cm]?[jt]sx?$/.test(file)).slice(0, budget.maxFiles)) {
      try {
        const size = (await stat(join(cwd, path))).size; if (size > budget.maxBytes - bytes) break;
        const content = await readFile(join(cwd, path), "utf8"); bytes += size;
        for (const [name, [, imports]] of installed) if (usage.get(name)!.length < 4 && imports.some((module) => importsModule(content, module))) usage.get(name)!.push(path);
      } catch { /* unreadable candidate */ }
    }
    for (const [name, [capability]] of installed) {
      const representatives = usage.get(name)!, tooling = capability === "test-runner";
      const declaredRunner = tooling && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(pkg.scripts?.test ?? "");
      facts.push({ id: tooling ? "tool.test-runner" : `primitive.${capability}`, category: tooling ? "tooling" : "primitive", value: name, strength: declaredRunner || representatives.length >= 2 ? "strong" : "medium", scope: ".", sources: [...src, ...await Promise.all(representatives.map((path) => source(cwd, path)))].slice(0, 6), representatives });
    }
    if (pkg.scripts?.lint) facts.push({ id: "tool.linter", category: "tooling", value: pkg.scripts.lint, strength: "strong", scope: ".", sources: src, representatives: [] });
    if (pkg.scripts?.format) facts.push({ id: "tool.formatter", category: "tooling", value: pkg.scripts.format, strength: "strong", scope: ".", sources: src, representatives: [] });
    if (pkg.type === "module") facts.push({ id: "api.module", category: "api", value: "esm", strength: "strong", scope: ".", sources: src, representatives: [] });
    return facts;
  } catch { return []; }
}

function importsModule(content: string, module: string): boolean {
  const escaped = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:from\\s+|require\\(\\s*)["']${escaped}(?:[/'"]|$)`).test(content);
}

async function configFacts(cwd: string): Promise<ConventionFact[]> {
  const facts: ConventionFact[] = [];
  for (const [path, id, value] of [["tsconfig.json", "tool.language", "typescript"], ["pyproject.toml", "tool.language", "python"], ["Cargo.toml", "tool.language", "rust"]] as const) {
    try { await stat(join(cwd, path)); facts.push({ id, category: "tooling", value, strength: "strong", scope: ".", sources: [await source(cwd, path)], representatives: [] }); } catch { /* absent config */ }
  }
  for (const [path, value] of [["package-lock.json", "npm"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["Cargo.lock", "cargo"], ["uv.lock", "uv"], ["poetry.lock", "poetry"]] as const) {
    try { await stat(join(cwd, path)); facts.push({ id: "tool.package-manager", category: "tooling", value, strength: "strong", scope: ".", sources: [await source(cwd, path)], representatives: [] }); break; } catch { /* try next lockfile */ }
  }
  return facts;
}

const primitivePattern = /(?:^|\/)(?:lib|utils?|shared|common|infrastructure)\/.*(?:retry|http|client|logger|logging|errors?|validation|schema|pagination|config|serializ|cache|auth|database|db)/i;
const capabilityForPath = (path: string) => ["retry", "http", "logging", "error", "validation", "pagination", "config", "serialization", "cache", "auth", "database"].find((word) => path.toLowerCase().includes(word))?.replace("error", "errors").replace("database", "db") ?? null;

export async function discoverConventions(cwd: string, touched: string[] = [], budget = DEFAULT_CONVENTION_BUDGET, index?: RepoIndex): Promise<RepoConventionProfile> {
  const cache = new ConventionCache(cwd), cached = await cache.load(), all = (index?.files ?? await walk(cwd)).slice(0, budget.maxFiles);
  const candidates = [...new Set([...touched, ...all.filter((path) => primitivePattern.test(path)).slice(0, budget.maxSearchResults)])];
  const discovered = [...await packageFacts(cwd, all, budget), ...await configFacts(cwd)];
  for (const path of candidates) {
    const capability = capabilityForPath(path); if (!capability) continue;
    const peers = candidates.filter((item) => capabilityForPath(item) === capability);
    discovered.push({ id: `primitive.${capability}`, category: "primitive", value: "local", strength: peers.length >= 2 ? "strong" : "medium", scope: dirname(path), sources: [await source(cwd, path)], representatives: peers.slice(0, 4) });
  }
  const testFiles = all.filter((path) => /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path));
  if (testFiles.length >= 2) {
    const colocated = testFiles.filter((path) => !/(?:^|\/)(?:test|tests|__tests__)\//.test(path)).length > testFiles.length / 2;
    discovered.push({ id: "testing.placement", category: "testing", value: colocated ? "colocated" : "centralized", strength: testFiles.length >= 3 ? "strong" : "medium", scope: ".", sources: await Promise.all(testFiles.slice(0, 4).map((path) => source(cwd, path))), representatives: testFiles.slice(0, 4) });
  }
  const routes = all.filter((path) => /(?:^|\/)(?:routes?|controllers?)\//.test(path));
  const repositories = all.filter((path) => /(?:^|\/)(?:repositories|repos)\//.test(path));
  const services = all.filter((path) => /(?:^|\/)services\//.test(path));
  if (routes.length >= 2 && repositories.length >= 2 && services.length >= 2) discovered.push({ id: "architecture.db-access", category: "architecture", value: "routes → services → repositories", strength: "strong", scope: ".", sources: await Promise.all([...routes.slice(0, 2), ...services.slice(0, 2), ...repositories.slice(0, 2)].map((path) => source(cwd, path))), representatives: [routes[0]!, services[0]!, repositories[0]!] });
  const merged = new Map(cached.facts.map((fact) => [`${fact.id}:${fact.value}@${fact.scope}`, fact]));
  for (const fact of discovered) { const key = `${fact.id}:${fact.value}@${fact.scope}`, previous = merged.get(key); if (!previous || rank(fact.strength) >= rank(previous.strength)) merged.set(key, fact); }
  const profile: RepoConventionProfile = { version: 1, facts: [...merged.values()].slice(0, 80) }; await cache.save(profile); return profile;
}

const rank = (strength: ConventionFact["strength"]) => ({ weak: 0, medium: 1, strong: 2 })[strength];
const taskCapability = (intent: string) => ["validation", "retry", "http", "logging", "error", "pagination", "config", "serialization", "cache", "auth", "database", "db", "test"].filter((term) => intent.toLowerCase().includes(term));
export function selectConventionFacts(profile: RepoConventionProfile, contract: TaskContract, limit = DEFAULT_CONVENTION_BUDGET.maxFacts) {
  const capabilities = taskCapability(contract.intent);
  return profile.facts.filter((fact) => fact.strength !== "weak" && (capabilities.some((cap) => fact.id.includes(cap)) || contract.explicitPaths.some((path) => path.startsWith(fact.scope)))).sort((a, b) => rank(b.strength) - rank(a.strength)).slice(0, limit);
}

export function relativeScope(cwd: string, path: string) { return relative(cwd, join(cwd, path)) || "."; }
export function testPlacementConflict(fact: ConventionFact, path: string) { return fact.id === "testing.placement" && fact.value === "colocated" && /(?:^|\/)(?:test|tests|__tests__)\//.test(path); }
export function isSharedPrimitive(path: string) { return primitivePattern.test(path) || /(?:retry|http|logger|schema|validation|database|cache)/i.test(basename(path)); }
