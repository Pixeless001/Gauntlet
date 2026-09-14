import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConventionCache, discoverConventions, selectConventionFacts } from "../src/repo/conventions.js";
import { inspectConventionDrift } from "../src/verify/convention-drift.js";
import type { TaskState } from "../src/core/task-state.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-conventions-"));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ type: "module", dependencies: { zod: "1.0.0" }, devDependencies: { vitest: "1.0.0" }, scripts: { test: "vitest" } }));
  await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "tsconfig.json"), "{}");
  await mkdir(join(cwd, "src/lib"), { recursive: true }); await writeFile(join(cwd, "src/lib/retry.ts"), "export const retry = () => 1");
  await writeFile(join(cwd, "src/lib/schema.ts"), "import { z } from 'zod'; export const schema = z.string()"); await writeFile(join(cwd, "src/lib/user.ts"), "import { z } from 'zod'; export const user = z.object({})");
  await writeFile(join(cwd, "src/lib/retry.test.ts"), "test('a', () => {})"); await writeFile(join(cwd, "src/lib/http.test.ts"), "test('b', () => {})");
  return cwd;
}

test("discovers compact evidence-backed conventions and selects relevant facts", async () => {
  const cwd = await fixture();
  try {
    const profile = await discoverConventions(cwd);
    assert.equal(profile.facts.find((fact) => fact.id === "primitive.validation")?.value, "zod");
    assert.equal(profile.facts.find((fact) => fact.id === "primitive.validation")?.strength, "strong");
    assert.equal(profile.facts.find((fact) => fact.id === "tool.test-runner")?.value, "vitest");
    const selected = selectConventionFacts(profile, { intent: "add retry behavior", acceptanceCriteria: [], constraints: [], explicitPaths: [] });
    assert.ok(selected.length <= 3); assert.ok(selected.some((fact) => fact.id === "primitive.retry"));
    assert.ok((await readFile(join(cwd, ".gauntlet/repo-profile.json"), "utf8")).length < 64_000);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("keeps dependency-only and competing conventions conservative", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-conventions-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { zod: "1", joi: "1" } }));
    const profile = await discoverConventions(cwd);
    const validation = profile.facts.filter((fact) => fact.id === "primitive.validation");
    assert.deepEqual(validation.map((fact) => fact.value).sort(), ["joi", "zod"]); assert.ok(validation.every((fact) => fact.strength === "medium"));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("invalidates only facts backed by a changed source", async () => {
  const cwd = await fixture();
  try {
    await discoverConventions(cwd); await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { joi: "1" } }));
    const cached = await new ConventionCache(cwd).load();
    assert.equal(cached.facts.some((fact) => fact.id === "primitive.validation"), false);
    assert.equal(cached.facts.some((fact) => fact.id === "primitive.retry"), true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("reports a conflicting dependency from strong task-start evidence", async () => {
  const cwd = await fixture();
  try {
    const profile = await discoverConventions(cwd); await writeFile(join(cwd, "package.json"), JSON.stringify({ dependencies: { zod: "1", joi: "1" } }));
    const state = { version: 1, id: "x", repository: cwd, startedAt: new Date().toISOString(), contract: { intent: "validation", acceptanceCriteria: [], constraints: [], explicitPaths: [] }, baseline: { head: null, status: [], dependencies: ["zod"], files: {}, tests: {} }, workingSet: [], repositoryFacts: [], conventions: profile.facts, conventionMetrics: { hints: 1, primitives: 1, interventions: 0, dependencyConflicts: 0, duplicates: 0, architectureBypasses: 0 }, activities: [], findings: [], attempts: 1 } satisfies TaskState;
    const findings = await inspectConventionDrift(cwd, state, [{ path: "package.json", added: 1, removed: 1 }]);
    assert.equal(findings[0]?.code, "convention-dependency-conflict");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
