import assert from "node:assert/strict";
import test from "node:test";
import { addNode, createGraph, rejectNode, startNode } from "../src/work/graph.js";
import { approachFingerprint, precheckFailure } from "../src/work/precheck.js";
import { reduceCandidates } from "../src/work/reducer.js";

const candidate = (nodeId: string, path: string, claim: string) => ({ nodeId, attempt: 1, executor: "worker" as const, inputFingerprint: "world", claims: [claim], artifactRefs: [`artifact:${nodeId}`], evidenceRefs: [`proof:${nodeId}`], affectedPaths: [path], unresolved: [] });

test("failure precheck blocks a materially repeated rejected approach", () => {
  let graph = addNode(createGraph(), { id: "fix", title: "Fix", kind: "implementation" }); graph = startNode(graph, "fix");
  const approach = { mechanism: "replace", target: "source.ts", assumptions: ["cache is stale"] }, signature = approachFingerprint(approach);
  graph = rejectNode(graph, "fix", "replacement did not invalidate cache", "proof:test", signature);
  assert.deepEqual(precheckFailure(graph.nodes.fix!, approach), { permitted: false, fingerprint: signature, constraint: "replacement did not invalidate cache", evidenceRef: "proof:test" });
  assert.equal(precheckFailure(graph.nodes.fix!, { ...approach, assumptions: ["cache key is stale"] }).permitted, true);
});

test("candidate reducer preserves independent evidence and isolates semantic conflicts", () => {
  const reduced = reduceCandidates([candidate("b", "b.ts", "b"), candidate("a", "a.ts", "a"), candidate("c", "a.ts", "conflict")]);
  assert.deepEqual(reduced, { claims: ["b"], evidenceRefs: ["proof:b"], artifacts: ["artifact:b"], conflicts: ["a.ts"] });
});
