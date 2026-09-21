import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphEventStore } from "../src/work/event-store.js";
import { admitDiscovery, initializeWork, observeWorldActivity, proposeNodeResult } from "../src/work/runtime.js";
import { createWorld, refreshCapabilities, refreshValidityInputs } from "../src/work/world.js";
import { addNode, addValidityEdges, createGraph, createValidityGraph, selectDecisionNode } from "../src/work/graph.js";
import { contract } from "./support.js";

const inputs = { contract: "contract", files: { "source.ts": "before" }, packages: { zod: "4.6.4" }, rules: "rules", runtime: "native" };

test("contract-scoped writes stale only the validity cone and rebuild the decision menu", () => {
  const original = initializeWork(createWorld(contract("Change source.ts", { explicitPaths: ["source.ts"] }), "base", inputs));
  assert.deepEqual(original.decision.candidates, ["implementation"]);
  const changed = observeWorldActivity(original, { kind: "file_write", target: "source.ts", outcome: "pass", outputBytes: 0 }, "after");
  assert.equal(changed.work.nodes.implementation?.state, "STALE");
  assert.equal(changed.work.nodes.verification?.state, "STALE");
  assert.notEqual(changed.fingerprint.value, original.fingerprint.value);
  assert.equal(changed.decision.valid, true); assert.deepEqual(changed.decision.candidates, []);
  const retry = proposeNodeResult(changed, "implementation", { executor: "primary", claims: ["changed"], artifactRefs: [], evidenceRefs: [], affectedPaths: ["source.ts"], unresolved: [] });
  assert.equal(retry.work.nodes.implementation?.state, "CANDIDATE"); assert.equal(retry.work.nodes.implementation?.attempt, 2);
});

test("graph event writes serialize sequence numbers and retain rejection candidates", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-world-events-"));
  try {
    const world = initializeWork(createWorld(contract("Change source.ts"), null, inputs)), events = new GraphEventStore(cwd);
    const written = await Promise.all(Array.from({ length: 12 }, (_, index) => events.append("task", { at: new Date().toISOString(), type: "RESULT_REJECTED", nodeId: "implementation", attempt: 1, detail: `constraint ${index}`, candidate: { nodeId: "implementation", attempt: 1, executor: "primary", inputFingerprint: world.fingerprint.value, claims: ["attempt"], artifactRefs: [], evidenceRefs: [], affectedPaths: ["source.ts"], unresolved: [] } }, world)));
    assert.deepEqual(written.map((event) => event.sequence).sort((left, right) => left - right), Array.from({ length: 12 }, (_, index) => index + 1));
    const history = await events.read("task"); assert.equal(history.length, 12); assert.equal(history.every((event) => event.candidate?.claims[0] === "attempt"), true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("rule and package fingerprint changes stale only their explicit dependants", () => {
  let work = createGraph(); work = addNode(work, { id: "api", title: "Inspect API", kind: "inspection", validityInputs: ["package:zod"] }); work = addNode(work, { id: "unrelated", title: "Unrelated", kind: "inspection" });
  let validity = createValidityGraph(); validity = addValidityEdges(validity, work.nodes.api!);
  const world = { ...createWorld(contract("Inspect API"), "base", inputs), work, validity };
  const refreshed = refreshValidityInputs(world, { ...inputs, packages: { zod: "4.7.0" } }, "base");
  assert.equal(refreshed.work.nodes.api?.state, "STALE"); assert.equal(refreshed.work.nodes.unrelated?.state, "READY"); assert.equal(refreshed.decision.valid, false);
});

test("config and upstream changes stale only their explicit dependants", () => {
  let work = createGraph(); work = addNode(work, { id: "config", title: "Read config", kind: "inspection", validityInputs: ["config:tsconfig.json"] }); work = addNode(work, { id: "upstream", title: "Use upstream", kind: "inspection", validityInputs: ["upstream:work:build"] }); work = addNode(work, { id: "unrelated", title: "Unrelated", kind: "inspection" });
  let validity = createValidityGraph(); for (const node of Object.values(work.nodes)) validity = addValidityEdges(validity, node);
  const world = { ...createWorld(contract("Inspect source.ts"), "base", { ...inputs, config: { "tsconfig.json": "old" }, upstream: { "work:build": "one" } }), work, validity };
  const changed = refreshValidityInputs(world, { ...world.fingerprint, config: { "tsconfig.json": "new" }, upstream: { "work:build": "two" } }, "base");
  assert.equal(changed.work.nodes.config?.state, "STALE"); assert.equal(changed.work.nodes.upstream?.state, "STALE"); assert.equal(changed.work.nodes.unrelated?.state, "READY");
});

test("capability changes invalidate action menus and dynamic work requires primary admission", () => {
  const world = initializeWork(createWorld(contract("Change source.ts"), null, inputs)), changed = refreshCapabilities(world, ["host:worktree"]);
  assert.equal(changed.decision.valid, false); assert.throws(() => selectDecisionNode(changed, "implementation"), /stale/);
  const admitted = admitDiscovery(world, { id: "inspect", title: "Inspect affected callers", kind: "inspection", changes: { scheduling: true }, validityInputs: ["contract"] });
  assert.ok(admitted.work.nodes.inspect); assert.throws(() => admitDiscovery(world, { id: "worker-node", title: "Worker node", kind: "inspection", changes: { scheduling: true } }, "worker"), /cannot create/);
});
