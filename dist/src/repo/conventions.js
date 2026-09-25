import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { z } from "zod";
import { walk } from "./tests.js";
import { migrateLegacyKeys } from "../state/v1-migration.js";
export const conventionStrength = z.enum(["strong", "medium", "weak"]);
const sourceSchema = z.object({ path: z.string().max(500), fingerprint: z.string().length(64) });
const factSchema = z.object({
    id: z.string().max(100), category: z.enum(["tooling", "primitive", "architecture", "testing", "api"]),
    value: z.string().max(200), strength: conventionStrength, scope: z.string().max(500),
    sourceRefs: z.array(sourceSchema).max(6), representatives: z.array(z.string().max(500)).max(4),
});
const profileSchema = z.object({ version: z.literal(1), facts: z.array(factSchema).max(80) });
export const DEFAULT_CONVENTION_BUDGET = { maxFiles: 400, maxBytes: 256_000, maxFacts: 3, maxSearchResults: 30 };
async function hashFile(cwd, path) {
    try {
        return createHash("sha256").update(await readFile(join(cwd, path))).digest("hex");
    }
    catch {
        return createHash("sha256").update("missing").digest("hex");
    }
}
async function source(cwd, path) { return { path, fingerprint: await hashFile(cwd, path) }; }
export class ConventionCache {
    cwd;
    path;
    constructor(cwd) {
        this.cwd = cwd;
        this.path = join(cwd, ".gauntlet", "repo-profile.json");
    }
    async load() {
        try {
            if ((await stat(this.path)).size > 64_000)
                return { version: 1, facts: [] };
            const raw = JSON.parse(await readFile(this.path, "utf8")), migrated = migrateLegacyKeys(raw), parsed = profileSchema.safeParse(migrated);
            if (!parsed.success)
                return { version: 1, facts: [] };
            const facts = [];
            for (const fact of parsed.data.facts) {
                const valid = await Promise.all(fact.sourceRefs.map(async (item) => item.fingerprint === await hashFile(this.cwd, item.path)));
                if (valid.every(Boolean))
                    facts.push(fact);
            }
            const profile = { version: 1, facts };
            if (JSON.stringify(raw) !== JSON.stringify(migrated))
                await this.save(profile);
            return profile;
        }
        catch {
            return { version: 1, facts: [] };
        }
    }
    async save(profile) {
        const value = profileSchema.parse(profile), content = JSON.stringify(value, null, 2);
        if (Buffer.byteLength(content) > 64_000)
            throw new Error("Convention profile exceeds 64KB");
        await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
        const temporary = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporary, content, { mode: 0o600 });
        await rename(temporary, this.path);
    }
}
const dependencyCapabilities = {
    zod: ["validation", ["zod"]], joi: ["validation", ["joi"]], yup: ["validation", ["yup"]], ajv: ["validation", ["ajv"]],
    axios: ["http", ["axios"]], got: ["http", ["got"]], "node-fetch": ["http", ["node-fetch"]],
    pino: ["logging", ["pino"]], winston: ["logging", ["winston"]],
    vitest: ["test-runner", ["vitest"]], jest: ["test-runner", ["jest"]], mocha: ["test-runner", ["mocha"]],
};
export function dependencyCapability(name) { return dependencyCapabilities[name]?.[0] ?? null; }
async function packageFacts(cwd, files, budget) {
    try {
        const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
        const dependencies = { ...pkg.dependencies, ...pkg.devDependencies }, src = [await source(cwd, "package.json")], facts = [];
        const installed = Object.entries(dependencyCapabilities).filter(([name]) => name in dependencies), usage = new Map(installed.map(([name]) => [name, []]));
        let bytes = 0;
        for (const path of files.filter((file) => /\.[cm]?[jt]sx?$/.test(file)).slice(0, budget.maxFiles)) {
            try {
                const size = (await stat(join(cwd, path))).size;
                if (size > budget.maxBytes - bytes)
                    break;
                const content = await readFile(join(cwd, path), "utf8");
                bytes += size;
                for (const [name, [, imports]] of installed)
                    if (usage.get(name).length < 4 && imports.some((module) => importsModule(content, module)))
                        usage.get(name).push(path);
            }
            catch { /* unreadable candidate */ }
        }
        for (const [name, [capability]] of installed) {
            const representatives = usage.get(name), tooling = capability === "test-runner";
            const declaredRunner = tooling && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(pkg.scripts?.test ?? "");
            facts.push({ id: tooling ? "tool.test-runner" : `primitive.${capability}`, category: tooling ? "tooling" : "primitive", value: name, strength: declaredRunner || representatives.length >= 2 ? "strong" : "medium", scope: ".", sourceRefs: [...src, ...await Promise.all(representatives.map((path) => source(cwd, path)))].slice(0, 6), representatives });
        }
        if (pkg.scripts?.lint)
            facts.push({ id: "tool.linter", category: "tooling", value: pkg.scripts.lint, strength: "strong", scope: ".", sourceRefs: src, representatives: [] });
        if (pkg.scripts?.format)
            facts.push({ id: "tool.formatter", category: "tooling", value: pkg.scripts.format, strength: "strong", scope: ".", sourceRefs: src, representatives: [] });
        if (pkg.type === "module")
            facts.push({ id: "api.module", category: "api", value: "esm", strength: "strong", scope: ".", sourceRefs: src, representatives: [] });
        return facts;
    }
    catch {
        return [];
    }
}
function importsModule(content, module) {
    const escaped = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:from\\s+|require\\(\\s*)["']${escaped}(?:[/'"]|$)`).test(content);
}
async function configFacts(cwd) {
    const facts = [];
    for (const [path, id, value] of [["tsconfig.json", "tool.language", "typescript"], ["pyproject.toml", "tool.language", "python"], ["Cargo.toml", "tool.language", "rust"]]) {
        try {
            await stat(join(cwd, path));
            facts.push({ id, category: "tooling", value, strength: "strong", scope: ".", sourceRefs: [await source(cwd, path)], representatives: [] });
        }
        catch { /* absent config */ }
    }
    for (const [path, value] of [["package-lock.json", "npm"], ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["Cargo.lock", "cargo"], ["uv.lock", "uv"], ["poetry.lock", "poetry"]]) {
        try {
            await stat(join(cwd, path));
            facts.push({ id: "tool.package-manager", category: "tooling", value, strength: "strong", scope: ".", sourceRefs: [await source(cwd, path)], representatives: [] });
            break;
        }
        catch { /* try next lockfile */ }
    }
    return facts;
}
const primitivePattern = /(?:^|\/)(?:lib|utils?|shared|common|infrastructure)\/.*(?:retry|http|client|logger|logging|errors?|validation|schema|pagination|config|serializ|cache|auth|database|db)/i;
const capabilityForPath = (path) => ["retry", "http", "logging", "error", "validation", "pagination", "config", "serialization", "cache", "auth", "database"].find((word) => path.toLowerCase().includes(word))?.replace("error", "errors").replace("database", "db") ?? null;
export async function discoverConventions(cwd, touched = [], budget = DEFAULT_CONVENTION_BUDGET, index) {
    const cache = new ConventionCache(cwd), cached = await cache.load(), all = (index?.files ?? await walk(cwd)).slice(0, budget.maxFiles);
    const indexed = new Set(all), candidates = [...new Set([...touched.filter((path) => indexed.has(path)), ...all.filter((path) => primitivePattern.test(path)).slice(0, budget.maxSearchResults)])];
    const discovered = [...await packageFacts(cwd, all, budget), ...await configFacts(cwd)];
    for (const path of candidates) {
        const capability = capabilityForPath(path);
        if (!capability)
            continue;
        const peers = candidates.filter((item) => capabilityForPath(item) === capability);
        const representatives = peers.slice(0, 4);
        discovered.push({ id: `primitive.${capability}`, category: "primitive", value: "local", strength: peers.length >= 2 ? "strong" : "medium", scope: dirname(path), sourceRefs: await Promise.all(representatives.map((item) => source(cwd, item))), representatives });
    }
    const testFiles = all.filter((path) => /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path));
    if (testFiles.length >= 2) {
        const colocated = testFiles.filter((path) => !/(?:^|\/)(?:test|tests|__tests__)\//.test(path)).length > testFiles.length / 2;
        discovered.push({ id: "testing.placement", category: "testing", value: colocated ? "colocated" : "centralized", strength: testFiles.length >= 3 ? "strong" : "medium", scope: ".", sourceRefs: await Promise.all(testFiles.slice(0, 4).map((path) => source(cwd, path))), representatives: testFiles.slice(0, 4) });
    }
    const routes = all.filter((path) => /(?:^|\/)(?:routes?|controllers?)\//.test(path));
    const repositories = all.filter((path) => /(?:^|\/)(?:repositories|repos)\//.test(path));
    const services = all.filter((path) => /(?:^|\/)services\//.test(path));
    if (routes.length >= 2 && repositories.length >= 2 && services.length >= 2)
        discovered.push({ id: "architecture.db-access", category: "architecture", value: "routes → services → repositories", strength: "strong", scope: ".", sourceRefs: await Promise.all([...routes.slice(0, 2), ...services.slice(0, 2), ...repositories.slice(0, 2)].map((path) => source(cwd, path))), representatives: [routes[0], services[0], repositories[0]] });
    const merged = new Map(cached.facts.map((fact) => [`${fact.id}:${fact.value}@${fact.scope}`, fact]));
    for (const fact of discovered)
        merged.set(`${fact.id}:${fact.value}@${fact.scope}`, fact);
    const profile = { version: 1, facts: [...merged.values()].slice(0, 80) };
    await cache.save(profile);
    return profile;
}
const rank = (strength) => ({ weak: 0, medium: 1, strong: 2 })[strength];
const taskCapability = (intent) => ["validation", "retry", "http", "logging", "error", "pagination", "config", "serialization", "cache", "auth", "database", "db", "test"].filter((term) => intent.toLowerCase().includes(term));
export function selectConventionFacts(profile, contract, limit = DEFAULT_CONVENTION_BUDGET.maxFacts) {
    const capabilities = taskCapability(contract.intent);
    return profile.facts.filter((fact) => fact.strength !== "weak" && (capabilities.some((cap) => fact.id.includes(cap)) || contract.explicitPaths.some((path) => path.startsWith(fact.scope)))).sort((a, b) => rank(b.strength) - rank(a.strength)).slice(0, limit);
}
export function relativeScope(cwd, path) { return relative(cwd, join(cwd, path)) || "."; }
export function testPlacementConflict(fact, path) { return fact.id === "testing.placement" && fact.value === "colocated" && /(?:^|\/)(?:test|tests|__tests__)\//.test(path); }
export function isSharedPrimitive(path) { return primitivePattern.test(path) || /(?:retry|http|logger|schema|validation|database|cache)/i.test(basename(path)); }
