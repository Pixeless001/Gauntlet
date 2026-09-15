import assert from "node:assert/strict";
import test from "node:test";
import { selectVerification } from "../src/verify/selector.js";
import { formatSummary } from "../src/reporting/summary.js";
import { inspectTestIntegrity } from "../src/verify/test-integrity.js";
import { captureTestSignatures } from "../src/repo/tests.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("verification uses declared tools and stops without changes", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], commands: [{ name: "typecheck", command: "npm", args: ["run", "typecheck"] }, { name: "test", command: "npm", args: ["test"] }] };
  assert.deepEqual(selectVerification(profile, []).checks.map((item) => item.id), ["typecheck"]);
  assert.deepEqual(selectVerification(profile, [{ path: "a.ts", added: 1, removed: 0 }]).checks.map((item) => item.id), ["typecheck", "repository-tests"]);
});

test("verification targets related tests for known runners and falls back for broad changes", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], testRunner: "vitest" as const, commands: [{ name: "test", command: "npm", args: ["run", "test"] }] };
  const targeted = selectVerification(profile, [{ path: "src/auth.ts", added: 1, removed: 0 }], ["src/auth.ts", "src/auth.test.ts"]);
  assert.equal(targeted.checks[0]?.id, "impacted-tests"); assert.deepEqual(targeted.checks[0]?.args, ["run", "test", "--", "src/auth.test.ts"]);
  assert.equal(selectVerification(profile, [{ path: "package.json", added: 1, removed: 1 }], ["src/auth.test.ts"]).checks[0]?.id, "repository-tests");
  assert.equal(selectVerification(profile, [{ path: "src/auth.ts", added: 1, removed: 0 }, { path: "src/billing.ts", added: 1, removed: 0 }], ["src/auth.test.ts"]).checks[0]?.id, "repository-tests");
  assert.equal(selectVerification(profile, [{ path: "src/auth.ts", added: 1, removed: 0 }], ["src/authz.test.ts"]).checks[0]?.id, "repository-tests");
});

test("test integrity compares against task-start assertions, not HEAD", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-integrity-")), path = join(cwd, "client.test.ts");
  try {
    await writeFile(path, "test('x', () => expect(status).toBe(401));\n"); const before = await captureTestSignatures(cwd);
    await writeFile(path, "test('x', () => expect(status).toBeGreaterThanOrEqual(400));\n");
    const finding = (await inspectTestIntegrity(cwd, before))[0]; assert.equal(finding?.code, "assertion-weakened"); assert.equal(finding?.blocking, true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("test integrity does not block a task-scoped exact assertion update", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-integrity-")), path = join(cwd, "client.test.ts");
  try { await writeFile(path, "test('x', () => expect(status).toBe(401));\n"); const before = await captureTestSignatures(cwd); await writeFile(path, "test('x', () => expect(status).toBe(403));\n"); const finding = (await inspectTestIntegrity(cwd, before))[0]; assert.equal(finding?.code, "assertion-changed"); assert.equal(finding?.blocking, false); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("test integrity rejects newly added skipped tests", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-integrity-"));
  try { await writeFile(join(cwd, "new.test.ts"), "test.skip('missing', () => {});\n"); assert.equal((await inspectTestIntegrity(cwd, {}, [{ path: "new.test.ts", added: 1, removed: 0 }]))[0]?.code, "tests-skipped"); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("summary is compact and factual", () => {
  const output = formatSummary({ version: 1, taskId: "x", startedAt: "", finishedAt: "", durationMs: 1_000, attempts: 1, files: 2, added: 3, removed: 1, testsPassed: 1, checksRun: 2, clean: true, verified: true, firstPass: true, findings: [] }, false);
  assert.match(output, /✓ CLEAN/); assert.match(output, /LoC\s+\+3\/-1/);
});

test("failed completion reports actionable evidence and its raw reference", () => {
  const output = formatSummary({ version: 1, taskId: "x", startedAt: "", finishedAt: "", durationMs: 1, attempts: 1, files: 1, added: 1, removed: 0, testsPassed: 0, checksRun: 1, clean: false, verified: false, firstPass: false, findings: ["tests-skipped: skipped count increased (a.test.ts, 0 → 1)"], evidence: [{ id: "impacted-tests", status: "fail", summary: "npm test: failed (1)\nFAIL a.test.ts", reference: ".gauntlet/runs/x.log" }] }, false);
  assert.match(output, /tests-skipped/); assert.match(output, /FAIL a\.test\.ts/); assert.match(output, /Full result/);
});
