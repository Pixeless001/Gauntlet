import assert from "node:assert/strict";
import test from "node:test";
import { fuseProof, mayExpand, type ProofPacket } from "../src/context/proof-views.js";

const packet = (id: string, authority: "repository" | "external", detailLevel: ProofPacket["detailLevel"], locator: string): ProofPacket => ({
  id, detailLevel, resolves: ["api"], sourceRefs: [{ source: id, locator }],
  claims: [{ id: "api:retry", subject: "retry", statement: "retry accepts a signal", authority, sourceRefs: [{ source: id, locator }] }],
});

test("proof fusion keeps authoritative claims and merged source files", () => {
  const fused = fuseProof([packet("docs", "external", "concise", "web"), packet("types", "repository", "reference", "index.d.ts")]);
  assert.equal(fused.length, 1);
  assert.equal(fused[0]?.id, "types");
  assert.equal(fused[0]?.claims[0]?.authority, "repository");
  assert.deepEqual(fused[0]?.claims[0]?.sourceRefs.map((ref) => ref.locator).sort(), ["index.d.ts", "web"]);
});

test("progressive proof expands only for unresolved uncertainty", () => {
  const value = packet("types", "repository", "reference", "index.d.ts");
  assert.equal(mayExpand(value, "api", { suppliedClaims: new Set(), resolved: new Set() }), true);
  assert.equal(mayExpand(value, "api", { suppliedClaims: new Set(), resolved: new Set(["api"]) }), false);
  assert.equal(fuseProof([{ ...value, detailLevel: "detailed" }], "concise").length, 0);
});
