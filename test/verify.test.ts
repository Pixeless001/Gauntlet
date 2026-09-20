import assert from "node:assert/strict";
import test from "node:test";
import { selectVerification } from "../src/verify/selector.js";
import { formatSummary } from "../src/reporting/summary.js";
import { inspectTestIntegrity } from "../src/verify/test-integrity.js";
import { captureTestSignatures } from "../src/repo/tests.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialUncertainty } from "../src/control/uncertainty.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../src/core/policy.js";
import { remainingProof } from "../src/verify/proof-selector.js";

test("verification uses declared tools and stops without changes", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], commands: [{ name: "typecheck", command: "npm", args: ["run", "typecheck"] }, { name: "test", command: "npm", args: ["test"] }] };
  assert.deepEqual(selectVerification(profile, []).checks.map((item) => item.id), ["typecheck"]);
  assert.deepEqual(selectVerification(profile, [{ path: "a.ts", added: 1, removed: 0 }]).checks.map((item) => item.id), ["typecheck", "repository-tests"]);
});

test("verification proof is selected by the shared control plane", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], commands: [{ name: "typecheck", command: "npm", args: ["run", "typecheck"] }, { name: "lint", command: "npm", args: ["run", "lint"] }, { name: "test", command: "npm", args: ["test"] }] };
  const contract = { intent: "Change behavior in a.ts", acceptanceCriteria: [], explicitPaths: ["a.ts"], constraints: [] }, uncertainty = initialUncertainty(contract, "ordinary");
  const plan = selectVerification(profile, [{ path: "a.ts", added: 1, removed: 0 }], [], undefined, { uncertainty, budget: DEFAULT_INTERVENTION_BUDGET, event: 3 });
  assert.deepEqual(plan.checks.map((item) => item.id), ["lint", "repository-tests"]); assert.equal(plan.selectionTrace?.trigger, "before_stop"); assert.equal(plan.selectionTrace?.rejected.find((item) => item.id === "proof:typecheck")?.reason, "dominated");
});

test("completion does not demand proof from an unavailable provider", () => {
  const uncertainty = initialUncertainty({ intent: "Implement a visual modal", acceptanceCriteria: [], explicitPaths: ["modal.tsx"], constraints: [] }, "ordinary");
  assert.equal(remainingProof(uncertainty, ["diff"], ["diff", "repository_rule", "test"]).some((item) => item.uncertainty === "visual"), false);
  assert.equal(remainingProof(uncertainty, ["diff"], ["diff", "repository_rule", "test", "browser"]).some((item) => item.uncertainty === "visual"), true);
});

test("documentation-only changes avoid build and behavioral suites", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], commands: [{ name: "typecheck", command: "npm", args: ["run", "typecheck"] }, { name: "test", command: "npm", args: ["test"] }] };
  const plan = selectVerification(profile, [{ path: "README.md", added: 1, removed: 1 }]); assert.deepEqual(plan.checks.map((item) => item.id), ["diff-check"]); assert.match(plan.rationale[0]!, /Skipped/);
});

test("verification targets related tests for known runners and falls back for broad changes", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], testRunner: "vitest" as const, commands: [{ name: "test", command: "npm", args: ["run", "test"] }] };
  const targeted = selectVerification(profile, [{ path: "src/auth.ts", added: 1, removed: 0 }], ["src/auth.ts", "src/auth.test.ts"]);
  assert.equal(targeted.checks[0]?.id, "impacted-tests"); assert.deepEqual(targeted.checks[0]?.args, ["run", "test", "--", "src/auth.test.ts"]);
  assert.equal(selectVerification(profile, [{ path: "package.json", added: 1, removed: 1 }], ["src/auth.test.ts"]).checks[0]?.id, "repository-tests");
  assert.equal(selectVerification(profile, [{ path: "src/auth.ts", added: 1, removed: 0 }, { path: "src/billing.ts", added: 1, removed: 0 }], ["src/auth.test.ts"]).checks[0]?.id, "repository-tests");
  assert.equal(selectVerification(profile, [{ path: "src/auth.ts", added: 1, removed: 0 }], ["src/authz.test.ts"]).checks[0]?.id, "repository-tests");
});

test("verification uses structural tested-by edges before filename fallback", () => {
  const profile = { packageManager: "npm", language: ["typescript"], harnesses: [], testRunner: "vitest" as const, commands: [{ name: "test", command: "npm", args: ["run", "test"] }] };
  const structural = { version: 1 as const, head: null, files: { "src/session.ts": { path: "src/session.ts", imports: [], exports: ["refresh"], symbols: ["refresh"], tests: ["test/concurrency.test.ts"] } }, dependents: {} };
  const plan = selectVerification(profile, [{ path: "src/session.ts", added: 1, removed: 0 }], ["src/session.ts", "test/concurrency.test.ts"], structural);
  assert.equal(plan.checks[0]?.id, "impacted-tests"); assert.equal(plan.checks[0]?.args.at(-1), "test/concurrency.test.ts");
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

test("failed completion reports actionable proof and its raw reference", () => {
  const output = formatSummary({ version: 1, taskId: "x", startedAt: "", finishedAt: "", durationMs: 1, attempts: 1, files: 1, added: 1, removed: 0, testsPassed: 0, checksRun: 1, clean: false, verified: false, firstPass: false, findings: ["tests-skipped: skipped count increased (a.test.ts, 0 → 1)"], proof: [{ id: "impacted-tests", status: "fail", summary: "npm test: failed (1)\nFAIL a.test.ts", reference: ".gauntlet/runs/x.log" }] }, false);
  assert.match(output, /tests-skipped/); assert.match(output, /FAIL a\.test\.ts/); assert.match(output, /Full result/);
});
