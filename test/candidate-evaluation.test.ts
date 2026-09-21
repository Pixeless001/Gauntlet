import assert from "node:assert/strict";
import test from "node:test";
import { addNode, createGraph, proposeResult, startNode } from "../src/work/graph.js";
import { applyCandidateEvaluation, evaluateCandidate, type DeterministicEvaluation } from "../src/verify/candidate.js";
import { createWorld } from "../src/work/world.js";
import { contract, taskState } from "./support.js";
import { compileWorkerPacket, createVerificationView } from "../src/evidence/packets.js";

const inputs = { contract: "contract", files: {}, packages: {}, rules: "rules", runtime: "native" };
const pass: DeterministicEvaluation = { commandPassed: true, artifactsPresent: true, staticChecksPassed: true, testsPassed: true, acceptanceEvidence: true, preservationEvidence: true, ownershipValid: true, baseCompatible: true, scopeValid: true, rulesValid: true };

function candidateWorld() {
  let graph = addNode(createGraph(), { id: "implementation", title: "Implement", kind: "implementation", writePaths: ["source.ts"] });
  graph = startNode(graph, "implementation");
  const world = createWorld(contract("Change source.ts"), null, inputs), candidate = { nodeId: "implementation", attempt: 1, executor: "primary" as const, inputFingerprint: world.fingerprint.value, claims: ["changed behavior"], artifactRefs: ["artifact://task/t_000001"], evidenceRefs: ["artifact://task/t_000001"], affectedPaths: ["source.ts"], unresolved: [] };
  graph = proposeResult(graph, candidate); return { ...world, work: graph };
}

test("deterministic evaluation rejects before promotion and stale worlds never validate", () => {
  const world = candidateWorld(), node = world.work.nodes.implementation!;
  assert.deepEqual(evaluateCandidate(world, node, { ...pass, testsPassed: false }), { disposition: "rejected", reasons: ["test failed"] });
  assert.deepEqual(evaluateCandidate({ ...world, fingerprint: { ...world.fingerprint, value: "new" } }, node, pass), { disposition: "stale", reasons: ["candidate input world is stale"] });
  const promoted = applyCandidateEvaluation(world, "implementation", evaluateCandidate(world, node, pass));
  assert.equal(promoted.work.nodes.implementation?.state, "VALIDATED"); assert.equal(promoted.decision.valid, false);
});

test("semantic residue stays outside deterministic promotion", () => {
  const world = candidateWorld(), node = world.work.nodes.implementation!;
  assert.deepEqual(evaluateCandidate(world, node, { ...pass, semanticAmbiguity: true }), { disposition: "semantic-verification-required", reasons: [] });
  assert.equal(applyCandidateEvaluation(world, "implementation", { disposition: "semantic-verification-required", reasons: [] }).work.nodes.implementation?.state, "CANDIDATE");
});

test("worker and verifier packets are sparse and narrative-free", () => {
  const state = taskState("Change source.ts"), world = candidateWorld(); state.world = world;
  const node = world.work.nodes.implementation!, packet = compileWorkerPacket(state, node), verification = createVerificationView(state, node);
  assert.equal(packet.returnSchema, "CandidateResult"); assert.deepEqual(packet.ownership, ["source.ts"]); assert.deepEqual(verification.candidate.affectedPaths, ["source.ts"]); assert.equal("claims" in verification.candidate, false);
});
