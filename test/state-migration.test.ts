import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGACY_KEYS, MIGRATION_MODULE, migrateTaskV1 } from "../src/state/v1-migration.js";
import { migrateTaskV2 } from "../src/state/v2-migration.js";
import { parseTaskState } from "../src/core/task-state.js";
import { StateStore } from "../src/state/store.js";
import { ConventionCache } from "../src/repo/conventions.js";
import { PatternStore } from "../src/knowledge/patterns.js";
import { createHash } from "node:crypto";

const exec = promisify(execFile);

test("first-version keys migrate without dropping stored results", () => {
  const [proof, proofRef, proofRefs, proofFound] = LEGACY_KEYS;
  const raw = {
    version: 1, id: "old", repository: process.cwd(), startedAt: new Date(0).toISOString(),
    contract: { intent: "Fix old state", acceptanceCriteria: [], explicitPaths: [], constraints: [] },
    baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: [], repositoryFacts: [], activities: [{ kind: "command", outputBytes: 1, [proofRef!]: "run:1" }],
    findings: [{ code: "old", severity: "warning", message: "kept", [proof!]: ["run:1"] }], attempts: 1,
    session: { decisions: ["keep choice"], selectionTraces: [{ event: 0, trigger: "old", candidates: [], selected: [], activations: [], rejected: [], [proofFound!]: true }], execution: { activeCheckpointId: "root", checkpoints: [{ id: "root", kind: "task", status: "active", summary: "old", constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], [proofRefs!]: ["run:1"], createdFromEvent: 0, resolves: [] }], events: [], nextEvent: 0 } },
  };
  const state = parseTaskState(migrateTaskV2(migrateTaskV1(raw)));
  assert.equal(state.version, 3);
  assert.deepEqual(state.findings[0]?.proof, ["run:1"]);
  assert.equal(state.activities[0]?.proofRef, "run:1");
  assert.deepEqual(state.control.execution.checkpoints[0]?.proofRefs, ["run:1"]);
  assert.deepEqual(state.control.validatedDecisions, ["keep choice"]);
  assert.equal(state.control.traces[0]?.proofFound, true);
});

test("legacy rewriting leaves current v3 evidence fields untouched", () => {
  const current = { version: 3, evidenceRefs: ["artifact://task/t_000001"] };
  assert.deepEqual(migrateTaskV1(current), current);
});

test("first-version stored outputs become artifact handles", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-migration-")), [, proofRef] = LEGACY_KEYS;
  try {
    const tasks = join(cwd, ".gauntlet", "tasks"), outputs = join(cwd, ".gauntlet", "runs", "old", "outputs"); await mkdir(tasks, { recursive: true }); await mkdir(outputs, { recursive: true }); await writeFile(join(outputs, "command.log"), "exact output\n");
    const raw = { version: 1, id: "old", repository: cwd, startedAt: new Date(0).toISOString(), contract: { intent: "Fix old state", acceptanceCriteria: [], explicitPaths: [], constraints: [] }, baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: [], repositoryFacts: [], activities: [{ kind: "command", outputBytes: 13, [proofRef!]: ".gauntlet/runs/old/outputs/command.log" }], findings: [], attempts: 1 };
    await writeFile(join(tasks, "old.json"), JSON.stringify(raw));
    const state = await new StateStore(cwd).loadTask("old"), handle = state.activities[0]?.proofRef;
    assert.match(handle ?? "", /^artifact:\/\/old\/t_000001$/); assert.equal((await readFile(join(cwd, ".gauntlet", "sessions", "old", "artifacts", "t_000001", "output.bin"), "utf8")), "exact output\n"); assert.equal(JSON.parse(await readFile(join(tasks, "old.json"), "utf8")).version, 3);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("cached facts and measurements rewrite to current field names", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cache-migration-")), sourceKey = LEGACY_KEYS.at(-1)!, supportKey = LEGACY_KEYS[5]!, contradictKey = LEGACY_KEYS[6]!, proofKey = LEGACY_KEYS[0]!;
  try {
    const gauntlet = join(cwd, ".gauntlet"), knowledge = join(gauntlet, "knowledge"); await mkdir(knowledge, { recursive: true }); await writeFile(join(cwd, "package.json"), "{}");
    const fingerprint = createHash("sha256").update("{}").digest("hex");
    await writeFile(join(gauntlet, "repo-profile.json"), JSON.stringify({ version: 1, facts: [{ id: "tool.package", category: "tooling", value: "npm", strength: "strong", scope: ".", [sourceKey]: [{ path: "package.json", fingerprint }], representatives: [] }] }));
    await writeFile(join(knowledge, "patterns.json"), JSON.stringify({ version: 1, patterns: [{ id: "p", kind: "selector", status: "supported", summary: "keep local", taskClasses: ["local"], [supportKey]: ["a"], [contradictKey]: [], updatedAt: new Date(0).toISOString() }] }));
    await writeFile(join(gauntlet, "last-result.json"), JSON.stringify({ version: 1, taskId: "old", [proofKey]: [{ id: "check", status: "pass" }] }));
    assert.equal((await new ConventionCache(cwd).load()).facts[0]?.sourceRefs[0]?.path, "package.json"); assert.deepEqual((await new PatternStore(cwd).list())[0]?.supportingProof, ["a"]); assert.deepEqual((await new StateStore(cwd).loadMeasurement() as unknown as Record<string, unknown>).proof, [{ id: "check", status: "pass" }]);
    for (const path of [join(gauntlet, "repo-profile.json"), join(knowledge, "patterns.json"), join(gauntlet, "last-result.json")]) { const content = await readFile(path, "utf8"); assert.equal([sourceKey, supportKey, contradictKey, proofKey].some((key) => new RegExp(`"${key}"`).test(content)), false); }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
