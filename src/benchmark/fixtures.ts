import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "../repo/process.js";

// Real task corpus: zero-dependency ESM repos with a seeded defect. The reference fix is
// used only for counterfactual validation (tests must fail on base and pass on the fix);
// it is never shown to the benchmarked agent.
export interface BenchmarkTask {
  id: string;
  intent: string;
  files: Record<string, string>;
  referenceFix: Record<string, string>;
}

const test = (name: string, body: string) => `import assert from "node:assert/strict";\nimport test from "node:test";\n${body}`;

export function benchmarkTasks(): BenchmarkTask[] {
  return [
    {
      id: "obvious-diagnostic",
      intent: "In src/user.js, initials(\"\") currently throws a TypeError. Make initials return an empty string for empty input without changing any other behavior.",
      files: {
        "src/user.js": `export function initials(name) {\n  const parts = name.split(" ");\n  return parts.map((part) => part[0].toUpperCase()).join("");\n}\n`,
        "test/discriminating.test.js": test("", `import { initials } from "../src/user.js";\ntest("empty input yields empty initials", () => { assert.equal(initials(""), ""); });\n`),
        "test/preservation.test.js": test("", `import { initials } from "../src/user.js";\ntest("normal names keep initials", () => { assert.equal(initials("ada byron"), "AB"); assert.equal(initials("a"), "A"); });\n`),
      },
      referenceFix: { "src/user.js": `export function initials(name) {\n  if (!name) return "";\n  const parts = name.split(" ");\n  return parts.map((part) => part[0].toUpperCase()).join("");\n}\n` },
    },
    {
      id: "local-rename",
      intent: "src/stats.js exports a misspelled function `avarage`. Rename it to `average` in the whole file, including the internal caller. No behavior change.",
      files: {
        "src/stats.js": `export function avarage(values) {\n  return values.reduce((sum, value) => sum + value, 0) / values.length;\n}\n\nexport function spread(values) {\n  const mid = avarage(values);\n  return Math.max(...values) - Math.min(...values) + (mid - mid);\n}\n`,
        "test/discriminating.test.js": test("", `import { average } from "../src/stats.js";\ntest("average is exported and correct", () => { assert.equal(average([1, 2, 3]), 2); });\n`),
        "test/preservation.test.js": test("", `import { spread } from "../src/stats.js";\ntest("spread keeps working", () => { assert.equal(spread([1, 2, 7]), 6); });\n`),
      },
      referenceFix: { "src/stats.js": `export function average(values) {\n  return values.reduce((sum, value) => sum + value, 0) / values.length;\n}\n\nexport function spread(values) {\n  const mid = average(values);\n  return Math.max(...values) - Math.min(...values) + (mid - mid);\n}\n` },
    },
    {
      id: "repeated-failure",
      intent: "In src/list.js, chunks([1,2,3,4], 2) returns [[1],[3]] but should return [[1,2],[3,4]]: each chunk silently drops its last element. Fix the slicing bug.",
      files: {
        "src/list.js": `export function chunks(list, size) {\n  const out = [];\n  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size - 1));\n  return out;\n}\n`,
        "test/discriminating.test.js": test("", `import { chunks } from "../src/list.js";\ntest("chunks keep every element", () => { assert.deepEqual(chunks([1, 2, 3, 4], 2), [[1, 2], [3, 4]]); });\n`),
        "test/preservation.test.js": test("", `import { chunks } from "../src/list.js";\ntest("edge inputs still work", () => { assert.deepEqual(chunks([], 2), []); assert.deepEqual(chunks([1], 3), [[1]]); });\n`),
      },
      referenceFix: { "src/list.js": `export function chunks(list, size) {\n  const out = [];\n  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));\n  return out;\n}\n` },
    },
    {
      id: "public-api",
      intent: "In src/discount.js, the exported finalPrice accepts any percentOff. Make it throw a TypeError when percentOff is below 0 or above 100; valid inputs must keep working exactly as before.",
      files: {
        "src/discount.js": `export function finalPrice(price, percentOff) {\n  return price - (price * percentOff) / 100;\n}\n`,
        "test/discriminating.test.js": test("", `import { finalPrice } from "../src/discount.js";\ntest("invalid percents are rejected", () => { assert.throws(() => finalPrice(100, -5), TypeError); assert.throws(() => finalPrice(100, 150), TypeError); });\n`),
        "test/preservation.test.js": test("", `import { finalPrice } from "../src/discount.js";\ntest("valid discounts unchanged", () => { assert.equal(finalPrice(100, 25), 75); assert.equal(finalPrice(80, 0), 80); });\n`),
      },
      referenceFix: { "src/discount.js": `export function finalPrice(price, percentOff) {\n  if (percentOff < 0 || percentOff > 100) throw new TypeError("percentOff out of range");\n  return price - (price * percentOff) / 100;\n}\n` },
    },
    {
      id: "duplicate-helper",
      intent: "In src/ids.js, normalizeId(\"ab  cd\") keeps the double space while the sibling helper in src/names.js collapses whitespace. Make normalizeId collapse internal whitespace runs to a single space, without touching src/names.js.",
      files: {
        "src/ids.js": `export function normalizeId(id) {\n  return id.trim().toLowerCase();\n}\n`,
        "src/names.js": `export function normalizeName(name) {\n  return name.trim().toLowerCase().replace(/\\s+/g, " ");\n}\n`,
        "test/discriminating.test.js": test("", `import { normalizeId } from "../src/ids.js";\ntest("ids collapse inner whitespace", () => { assert.equal(normalizeId("ab  cd"), "ab cd"); });\n`),
        "test/preservation.test.js": test("", `import { normalizeId } from "../src/ids.js";\nimport { normalizeName } from "../src/names.js";\ntest("neighbors unchanged", () => { assert.equal(normalizeId("  AB "), "ab"); assert.equal(normalizeName("Ada  Byron"), "ada byron"); });\n`),
      },
      referenceFix: { "src/ids.js": `export function normalizeId(id) {\n  return id.trim().toLowerCase().replace(/\\s+/g, " ");\n}\n` },
    },
    {
      id: "authorization-boundary",
      intent: "In src/gate.js, canPublish is wrong: it must return true for admins, true for editors only when user.active is exactly true, and false for everyone else. Fix it without changing canDelete or canEdit.",
      files: {
        "src/gate.js": `export function canDelete(user) {\n  return user.role === "admin";\n}\n\nexport function canEdit(user) {\n  if (user.role === "admin") return true;\n  if (user.role === "editor") return user.active === true;\n  return false;\n}\n\nexport function canPublish(user) {\n  return user.role === "editor";\n}\n`,
        "test/discriminating.test.js": test("", `import { canPublish } from "../src/gate.js";\ntest("publish gate respects role and activation", () => { assert.equal(canPublish({ role: "admin" }), true); assert.equal(canPublish({ role: "editor", active: false }), false); });\n`),
        "test/preservation.test.js": test("", `import { canDelete, canEdit, canPublish } from "../src/gate.js";\ntest("existing gates unchanged", () => { assert.equal(canDelete({ role: "admin" }), true); assert.equal(canEdit({ role: "editor", active: true }), true); assert.equal(canEdit({ role: "editor", active: false }), false); assert.equal(canPublish({ role: "editor", active: true }), true); assert.equal(canPublish({ role: "viewer" }), false); });\n`),
      },
      referenceFix: { "src/gate.js": `export function canDelete(user) {\n  return user.role === "admin";\n}\n\nexport function canEdit(user) {\n  if (user.role === "admin") return true;\n  if (user.role === "editor") return user.active === true;\n  return false;\n}\n\nexport function canPublish(user) {\n  if (user.role === "admin") return true;\n  if (user.role === "editor") return user.active === true;\n  return false;\n}\n` },
    },
  ];
}

export async function scaffoldTask(parent: string, task: BenchmarkTask): Promise<string> {
  const cwd = join(parent, task.id);
  await rm(cwd, { recursive: true, force: true });
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(join(cwd, "package.json"), `${JSON.stringify({ name: task.id, private: true, type: "module", scripts: { test: "node --test test/" } }, null, 2)}\n`);
  await writeFile(join(cwd, ".gitignore"), [".gauntlet/", ".codex/", ".claude/", ".cursor/", ".opencode/"].join("\n") + "\n");
  for (const [path, content] of Object.entries(task.files)) await writeFile(join(cwd, path), content);
  await git(cwd, ["init", "-q"]);
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["-c", "user.email=benchmark@local", "-c", "user.name=benchmark", "commit", "-qm", "baseline"]);
  return cwd;
}

export interface TaskValidation { task: string; discriminatingFailsOnBase: boolean; preservationPassesOnBase: boolean; passesOnFix: boolean; preservationPassesOnFix: boolean }

export async function validateTask(parent: string, task: BenchmarkTask): Promise<TaskValidation> {
  const cwd = await scaffoldTask(parent, task);
  try {
    const discriminatingOnBase = await nodeTest(cwd, "test/discriminating.test.js");
    const preservationOnBase = await nodeTest(cwd, "test/preservation.test.js");
    for (const [path, content] of Object.entries(task.referenceFix)) await writeFile(join(cwd, path), content);
    const discriminatingOnFix = await nodeTest(cwd, "test/discriminating.test.js");
    const preservationOnFix = await nodeTest(cwd, "test/preservation.test.js");
    return { task: task.id, discriminatingFailsOnBase: !discriminatingOnBase, preservationPassesOnBase: preservationOnBase, passesOnFix: discriminatingOnFix, preservationPassesOnFix: preservationOnFix };
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

async function git(cwd: string, args: string[]) { const result = await run("git", args, cwd, 30_000, 1_000_000); if (result.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`); }
async function nodeTest(cwd: string, file: string) { const result = await run("node", ["--test", file], cwd, 60_000, 4_000_000); return result.exitCode === 0; }
