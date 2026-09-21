import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NativeExecutionEngine } from "../src/execution/native-engine.js";
import { GraphEventStore } from "../src/work/event-store.js";
import { addNode, createGraph } from "../src/work/graph.js";
import { createWorld } from "../src/work/world.js";
import { contract } from "./support.js";

const inputs = { contract: "contract", files: {}, packages: {}, rules: "rules", runtime: "native" };
const result = (nodeId: string, attempt = 1) => ({ nodeId, attempt, executor: "local" as const, inputFingerprint: "world", claims: [], artifactRefs: [], evidenceRefs: [], affectedPaths: [], unresolved: [] });

test("native engine batches independent local work and serializes overlapping writes", async () => {
  let graph = createGraph(); graph = addNode(graph, { id: "a", title: "a", kind: "local", executor: "local", writePaths: ["a.ts"] }); graph = addNode(graph, { id: "b", title: "b", kind: "local", executor: "local", writePaths: ["a.ts"] }); graph = addNode(graph, { id: "c", title: "c", kind: "local", executor: "local", writePaths: ["c.ts"] });
  const started: string[] = [], engine = new NativeExecutionEngine(process.cwd(), async (node) => { started.push(node.id); return result(node.id); }, 4);
  assert.deepEqual((await engine.runReady(Object.values(graph.nodes))).map((item) => item.nodeId).sort(), ["a", "c"]);
  assert.deepEqual(started.sort(), ["a", "c"]);
});

test("native engine checkpoints and graph events resume locally", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-native-"));
  try {
    const world = createWorld(contract("Inspect source.ts"), null, inputs), engine = new NativeExecutionEngine(cwd, async (node) => result(node.id));
    await engine.checkpoint("task", world); assert.deepEqual(await engine.resume("task"), world);
    const events = new GraphEventStore(cwd), event = await events.append("task", { at: new Date().toISOString(), type: "NODE_CREATED", nodeId: "inspect" }, world);
    assert.equal(event.sequence, 1); assert.deepEqual((await events.read("task")).map((item) => item.type), ["NODE_CREATED"]); assert.deepEqual((await events.resume("task"))?.world, world);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
