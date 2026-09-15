import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStructuralIndex } from "../src/intelligence/index.js";
import { impact, workingGraph } from "../src/intelligence/working-graph.js";
import { selectMarginal } from "../src/context/marginality.js";
import type { RepoIndex } from "../src/repo/index.js";

test("structural intelligence finds imports, dependents, exports, symbols, and tests", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-intelligence-"));
  try {
    await writeFile(join(cwd, "owner.ts"), "export function owner() {}\n"); await writeFile(join(cwd, "caller.ts"), "import { owner } from './owner.js'; owner();\n"); await writeFile(join(cwd, "owner.test.ts"), "test('owner', () => {});\n");
    const repository: RepoIndex = { mode: "filesystem", head: null, files: ["owner.ts", "caller.ts", "owner.test.ts"], tests: ["owner.test.ts"], configs: [], dirty: [], fingerprints: {} };
    const index = await buildStructuralIndex(cwd, repository), cone = impact(index, "owner.ts");
    assert.deepEqual(index.dependents["owner.ts"], ["caller.ts"]); assert.deepEqual(index.files["owner.ts"]?.symbols, ["owner"]); assert.equal(cone.publicSurface, true); assert.deepEqual(cone.affectedTests, ["owner.test.ts"]);
    assert.deepEqual(workingGraph(index, ["owner.ts"]).map((item) => item.path), ["owner.ts", "caller.ts", "owner.test.ts"]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("marginal selection rejects relevant but redundant context", () => {
  assert.deepEqual(selectMarginal([{ value: "owner", contributions: ["owner"], cost: 1 }, { value: "same", contributions: ["owner"], cost: 1 }, { value: "test", contributions: ["acceptance"], cost: 1 }], 2), { selected: ["owner", "test"], rejected: ["same"] });
});
