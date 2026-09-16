import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStructuralIndex, updateStructuralIndex } from "../src/intelligence/index.js";
import { ensureDepth, impact, workingGraph } from "../src/intelligence/working-graph.js";
import { selectMarginal } from "../src/context/marginality.js";
import type { RepoIndex } from "../src/repo/index.js";

test("structural intelligence finds imports, dependents, exports, symbols, and tests", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-intelligence-"));
  try {
    await writeFile(join(cwd, "owner.ts"), "export interface Contract {}\nexport class Owner extends Base implements Contract { run() {} }\nexport function owner() {}\n"); await writeFile(join(cwd, "caller.ts"), "import { owner } from './owner.js'; owner();\n"); await writeFile(join(cwd, "feature.ts"), "import { owner } from './caller.js'; owner();\n"); await writeFile(join(cwd, "owner.test.ts"), "test('owner', () => {});\n");
    const repository: RepoIndex = { mode: "filesystem", head: null, files: ["owner.ts", "caller.ts", "feature.ts", "owner.test.ts"], tests: ["owner.test.ts"], configs: [], dirty: [], fingerprints: {} };
    const index = await buildStructuralIndex(cwd, repository), cone = impact(index, "owner.ts");
    assert.deepEqual(index.dependents["owner.ts"], ["caller.ts"]); assert.deepEqual(index.files["owner.ts"]?.symbols, ["Contract", "Owner", "owner"]); assert.deepEqual(index.files["owner.ts"]?.extends, ["Base"]); assert.deepEqual(index.files["owner.ts"]?.implements, ["Contract"]); assert.ok(index.files["caller.ts"]?.calls?.includes("owner"));
    assert.equal(cone.publicSurface, true); assert.equal(cone.confidence, "high"); assert.deepEqual(cone.transitiveDependents, ["caller.ts", "feature.ts"]); assert.deepEqual(cone.affectedTests, ["owner.test.ts"]); assert.deepEqual(cone.packageCrossings, []);
    assert.deepEqual(workingGraph(index, ["owner.ts"]).map((item) => item.path), ["owner.ts", "caller.ts", "owner.test.ts", "feature.ts"]);
    const expanded = ensureDepth(index, ["owner.ts"], "relation"); assert.ok(expanded.symbols.includes("owner")); assert.ok(expanded.relations.some((edge) => edge.kind === "dependent" && edge.to === "caller.ts"));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("structural intelligence incrementally replaces changed files and removes deleted files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-index-update-"));
  try {
    await mkdir(join(cwd, "pkg")); await writeFile(join(cwd, "package.json"), "{}"); await writeFile(join(cwd, "pkg/a.ts"), "export const oldName = 1;\n"); await writeFile(join(cwd, "gone.ts"), "export const gone = 1;\n");
    const firstRepo: RepoIndex = { mode: "filesystem", head: null, files: ["package.json", "pkg/a.ts", "gone.ts"], tests: [], configs: ["package.json"], dirty: [], fingerprints: {} };
    const first = await buildStructuralIndex(cwd, firstRepo); await writeFile(join(cwd, "pkg/a.ts"), "export const newName = 2;\n"); await rm(join(cwd, "gone.ts"));
    const nextRepo: RepoIndex = { ...firstRepo, files: ["package.json", "pkg/a.ts"] }, next = await updateStructuralIndex(cwd, nextRepo, first, ["pkg/a.ts", "gone.ts"]);
    assert.deepEqual(next.files["pkg/a.ts"]?.symbols, ["newName"]); assert.equal(next.files["gone.ts"], undefined); assert.notEqual(next.files["pkg/a.ts"]?.hash, first.files["pkg/a.ts"]?.hash);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("marginal selection rejects relevant but redundant context", () => {
  assert.deepEqual(selectMarginal([{ value: "owner", contributions: ["owner"], cost: 1 }, { value: "same", contributions: ["owner"], cost: 1 }, { value: "test", contributions: ["acceptance"], cost: 1 }], 2), { selected: ["owner", "test"], rejected: ["same"] });
});
