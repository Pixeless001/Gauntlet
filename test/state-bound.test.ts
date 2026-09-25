import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GauntletEngine } from "../src/core/engine.js";
import { MAX_STATE_BYTES } from "../src/core/policy.js";
import { boundState } from "../src/state/bound.js";
import { taskState } from "./support.js";

const activity = (index: number, outcome: "pass" | "fail" = "pass") => ({ kind: "command" as const, target: `cmd ${index}`, outcome, outputBytes: 10, artifactRef: `artifact://task/t_${index}` });
const fact = (id: string) => ({ id, provenance: id, statement: id, evidenceRefs: [], fingerprint: "f", version: 1, status: "validated" as const });

test("bounded state keeps recent detail and failures, expires old activity facts, and keeps file facts", () => {
  const state = taskState("Inspect");
  state.activities = Array.from({ length: 200 }, (_, index) => activity(index, index === 3 ? "fail" : "pass"));
  state.world.facts = { "file:a.ts": fact("file:a.ts"), ...Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`activity:command:c${index}`, fact(`c${index}`)])) };
  boundState(state);
  assert.equal(state.activities.length, 200);
  assert.equal(state.activities[3]?.target, "cmd 3"); assert.equal(state.activities[4]?.target, undefined); assert.equal(state.activities[4]?.outputBytes, 10); assert.equal(state.activities[199]?.target, "cmd 199");
  assert.equal(Object.keys(state.world.facts).filter((key) => key.startsWith("activity:")).length, 24); assert.ok(state.world.facts["file:a.ts"]); assert.ok(state.world.facts["activity:command:c39"]);
});

test("dropping old activities rebases every stored activity index", () => {
  const state = taskState("Inspect");
  state.activities = Array.from({ length: 700 }, (_, index) => activity(index)); Object.assign(state.control, { lastCompactedActivity: 650 });
  state.control.observations = [{ path: "a.ts", hash: "h", lastObserved: 690, relevantSymbols: [] }]; state.control.context.recentCompletedTurns = [10, 690]; state.control.lifecycle.lastStableEvent = 500;
  boundState(state);
  assert.equal(state.activities.length, 300); assert.equal(state.activities.at(-1)?.target, "cmd 699");
  assert.equal(state.control.lastCompactedActivity, 250); assert.equal(state.control.observations[0]?.lastObserved, 290); assert.deepEqual(state.control.context.recentCompletedTurns, [290]); assert.equal(state.control.lifecycle.lastStableEvent, 100);
});

test("a long run of long commands stays under the state size cap", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-bound-"));
  try {
    const engine = new GauntletEngine(cwd); await engine.start("Inspect the repo", "long");
    for (let index = 0; index < 150; index++) await engine.activity("long", { kind: "command", target: `cd /some/long/path && grep -rn "step ${index}" src | cut -c1-230; echo ${"x".repeat(200)}`, outcome: "pass", outputBytes: 100 });
    assert.ok(Buffer.byteLength(await readFile(join(cwd, ".gauntlet/tasks/long.json"), "utf8")) < MAX_STATE_BYTES * 0.75);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
