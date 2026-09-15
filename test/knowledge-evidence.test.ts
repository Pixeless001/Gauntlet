import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePackageKnowledge } from "../src/knowledge/resolver.js";
import { initialUncertainty } from "../src/control/uncertainty.js";
import { hasSufficientEvidence, remainingEvidence } from "../src/verify/evidence-selector.js";
import { correctionPacket } from "../src/verify/correction.js";

test("package knowledge stops at installed types before external docs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-knowledge-")); let external = 0;
  try { const root = join(cwd, "node_modules", "demo"); await mkdir(root, { recursive: true }); await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.2.3", types: "index.d.ts" })); await writeFile(join(root, "index.d.ts"), "export function refresh(): void;\n");
    const fact = await resolvePackageKnowledge(cwd, "demo", "refresh", { externalDocs: async () => { external += 1; return "docs"; } }); assert.equal(fact?.source, "installed_types"); assert.equal(external, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("package knowledge reads modern exports but rejects escaping metadata paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-knowledge-")); let external = 0;
  try {
    const safe = join(cwd, "node_modules", "safe"), escaped = join(cwd, "node_modules", "escaped"); await mkdir(safe, { recursive: true }); await mkdir(escaped, { recursive: true });
    await writeFile(join(safe, "package.json"), JSON.stringify({ version: "2.0.0", exports: { ".": { types: "./dist/index.d.ts" } } })); await mkdir(join(safe, "dist")); await writeFile(join(safe, "dist", "index.d.ts"), "export function modern(): void;\n");
    await writeFile(join(escaped, "package.json"), JSON.stringify({ version: "1.0.0", types: "../../../secret.d.ts" })); await writeFile(join(cwd, "secret.d.ts"), "export function secret(): void;\n");
    assert.equal((await resolvePackageKnowledge(cwd, "safe", "modern"))?.source, "installed_types");
    assert.equal((await resolvePackageKnowledge(cwd, "escaped", "secret", { externalDocs: async () => { external += 1; return "authoritative"; } }))?.source, "external_docs"); assert.equal(external, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("evidence selection asks only for unresolved unsupported uncertainty", () => {
  const state = initialUncertainty({ intent: "Fix race", acceptanceCriteria: [], explicitPaths: [], constraints: [] }, "elevated");
  assert.equal(remainingEvidence(state, ["reproduction", "test", "diff", "graph", "repository_rule", "contract"]).some((item) => item.uncertainty === "cause"), false);
});

test("regression uncertainty requires both structural impact and behavioral evidence", () => {
  const resolved = initialUncertainty({ intent: "Fix race", acceptanceCriteria: [], explicitPaths: [], constraints: [] }, "elevated");
  for (const kind of Object.keys(resolved) as (keyof typeof resolved)[]) resolved[kind] = "resolved";
  assert.equal(hasSufficientEvidence("regression", ["graph"]), false);
  assert.equal(hasSufficientEvidence("regression", ["test"]), false);
  assert.equal(hasSufficientEvidence("regression", ["graph", "test"]), true);
  assert.deepEqual(remainingEvidence({ ...resolved, regression: "open" }, ["graph"]), [{ uncertainty: "regression", evidence: "test" }]);
});

test("correction packets are bounded and evidence backed", () => {
  const packet = correctionPacket([{ code: "route", severity: "error", blocking: true, message: "Route bypasses repository layer", evidence: ["src/route.ts:4"] }], ["src/route.ts"]);
  assert.deepEqual(packet?.scope, ["src/route.ts"]); assert.deepEqual(packet?.evidence, ["src/route.ts:4"]); assert.equal(packet?.uncertainty, "regression");
});
