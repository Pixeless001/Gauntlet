import assert from "node:assert/strict";
import test from "node:test";
import { fuseEvidence, mayExpand, type EvidencePacket } from "../src/context/evidence-views.js";

const packet = (id: string, authority: "repository" | "external", detailLevel: EvidencePacket["detailLevel"], locator: string): EvidencePacket => ({
  id, detailLevel, resolves: ["api"], refs: [{ source: id, locator }],
  claims: [{ id: "api:retry", subject: "retry", statement: "retry accepts a signal", authority, refs: [{ source: id, locator }] }],
});

test("evidence fusion keeps authoritative claims and merged provenance", () => {
  const fused = fuseEvidence([packet("docs", "external", "concise", "web"), packet("types", "repository", "reference", "index.d.ts")]);
  assert.equal(fused.length, 1);
  assert.equal(fused[0]?.id, "types");
  assert.equal(fused[0]?.claims[0]?.authority, "repository");
  assert.deepEqual(fused[0]?.claims[0]?.refs.map((ref) => ref.locator).sort(), ["index.d.ts", "web"]);
});

test("progressive evidence expands only for unresolved uncertainty", () => {
  const value = packet("types", "repository", "reference", "index.d.ts");
  assert.equal(mayExpand(value, "api", { suppliedClaims: new Set(), resolved: new Set() }), true);
  assert.equal(mayExpand(value, "api", { suppliedClaims: new Set(), resolved: new Set(["api"]) }), false);
  assert.equal(fuseEvidence([{ ...value, detailLevel: "detailed" }], "concise").length, 0);
});
