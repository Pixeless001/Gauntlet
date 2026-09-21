import assert from "node:assert/strict";
import test from "node:test";
import { addCommunicationEdge, addNode, addValidityEdges, claimOwnership, collapseValidated, communicationEvidence, createCommunicationGraph, createGraph, createValidityGraph, invalidateCone, nodeEarnsStructure, proposeResult, readyFrontier, rejectNode, retryNode, startNode, validateNode } from "../src/work/graph.js";
import { createWorld } from "../src/work/world.js";
import { contract } from "./support.js";

const inputs = { contract: "contract", files: {}, packages: {}, rules: "rules", runtime: "runtime" };
const candidate = (nodeId: string, attempt = 1) => ({ nodeId, attempt, executor: "local" as const, inputFingerprint: "world", claims: [nodeId], artifactRefs: [], evidenceRefs: [`artifact://${nodeId}`], affectedPaths: [], unresolved: [] });

test("work graph exposes only validated dependency-ready work on the critical path", () => {
  let graph = createGraph();
  graph = addNode(graph, { id: "inspect", title: "inspect", kind: "inspection", duration: "short" });
  graph = addNode(graph, { id: "implement", title: "implement", kind: "implementation", dependencies: ["inspect"], duration: "long" });
  graph = addNode(graph, { id: "verify", title: "verify", kind: "verification", dependencies: ["implement"] });
  const world = { ...createWorld(contract("Fix source.ts"), null, inputs), work: graph };
  assert.deepEqual(readyFrontier(world).map((node) => node.id), ["inspect"]);
  graph = startNode(graph, "inspect"); graph = proposeResult(graph, candidate("inspect")); graph = validateNode(graph, "inspect");
  assert.equal(graph.nodes.implement?.state, "READY");
  assert.ok((graph.nodes.inspect?.criticalPath ?? 0) > (graph.nodes.verify?.criticalPath ?? 0));
});

test("candidate output never validates itself and rejection needs a new attempt", () => {
  let graph = addNode(createGraph(), { id: "implementation", title: "implementation", kind: "implementation" });
  graph = startNode(graph, "implementation"); graph = proposeResult(graph, candidate("implementation"));
  assert.equal(graph.nodes.implementation?.state, "CANDIDATE");
  graph = rejectNode(graph, "implementation", "Do not use a process-local mutex", "artifact://failure");
  assert.equal(graph.nodes.implementation?.state, "REJECTED");
  graph = retryNode(graph, "implementation");
  assert.deepEqual(graph.nodes.implementation?.rejection, { constraint: "Do not use a process-local mutex", evidenceRef: "artifact://failure" });
  assert.equal(graph.nodes.implementation?.attempt, 2);
});

test("validity invalidation stales only the dependency cone and communication stays explicit", () => {
  let work = createGraph();
  work = addNode(work, { id: "api", title: "api", kind: "inspection", validityInputs: ["package:api"] });
  work = addNode(work, { id: "dependent", title: "dependent", kind: "inspection", validityInputs: ["api"] });
  work = addNode(work, { id: "unrelated", title: "unrelated", kind: "inspection" });
  for (const id of ["api", "dependent", "unrelated"]) { work = startNode(work, id); work = proposeResult(work, candidate(id)); work = validateNode(work, id); }
  let validity = createValidityGraph(); validity = addValidityEdges(validity, work.nodes.api!); validity = addValidityEdges(validity, work.nodes.dependent!);
  let communication = createCommunicationGraph(); communication = addCommunicationEdge(communication, "api", "reducer");
  const world = { ...createWorld(contract("Inspect API"), null, inputs), work, validity, communication, facts: { "package:api": { id: "package:api", provenance: "package:api", statement: "API v1", evidenceRefs: [], fingerprint: "v1", version: 1, status: "validated" as const } } };
  const result = invalidateCone(world, "package:api");
  assert.deepEqual(result.stale.sort(), ["api", "dependent"]);
  assert.equal(result.world.work.nodes.unrelated?.state, "VALIDATED");
  assert.deepEqual(communicationEvidence(world, "reducer"), ["artifact://api"]);
});

test("node admission and ownership reject graph bloat and overlapping writes", () => {
  assert.equal(nodeEarnsStructure({ id: "read", title: "read", kind: "local", changes: {} }), false);
  assert.equal(nodeEarnsStructure({ id: "verify", title: "verify", kind: "verification", changes: { validation: true } }), true);
  let work = addNode(createGraph(), { id: "one", title: "one", kind: "implementation", writePaths: ["src/a.ts"] });
  work = addNode(work, { id: "two", title: "two", kind: "implementation", writePaths: ["src/a.ts"] });
  let world = { ...createWorld(contract("Change source"), null, inputs), work };
  world = claimOwnership(world, work.nodes.one!);
  assert.throws(() => claimOwnership(world, work.nodes.two!), /conflict/);
});

test("ready frontier excludes stale facts and overlapping ownership", () => {
  let work = createGraph(); work = addNode(work, { id: "write", title: "Write", kind: "implementation", writePaths: ["source.ts"], validityInputs: ["file:source.ts"] }); work = addNode(work, { id: "other", title: "Other", kind: "implementation", writePaths: ["source.ts"] });
  const base = { ...createWorld(contract("Change source.ts"), null, inputs), work, facts: { "file:source.ts": { id: "file:source.ts", provenance: "file:source.ts", statement: "changed", evidenceRefs: [], fingerprint: "old", version: 1, status: "stale" as const } } };
  assert.deepEqual(readyFrontier(base).map((node) => node.id), ["other"]);
  assert.deepEqual(readyFrontier({ ...base, facts: {}, ownership: { owner: ["source.ts"] } }).map((node) => node.id), []);
});

test("validated inactive branches collapse behind a compact reference", () => {
  let work = addNode(createGraph(), { id: "fact", title: "fact", kind: "inspection" });
  work = startNode(work, "fact"); work = proposeResult(work, candidate("fact")); work = validateNode(work, "fact");
  const collapsed = collapseValidated({ ...createWorld(contract("Inspect"), null, inputs), work });
  assert.equal(collapsed.work.nodes.fact?.state, "COLLAPSED");
  assert.match(collapsed.work.nodes.fact?.collapsedRef ?? "", /^world:\/\//);
});
