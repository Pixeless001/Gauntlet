import assert from "node:assert/strict";
import test from "node:test";
import { uncertaintyKinds, type UncertaintyState } from "../src/control/uncertainty.js";
import { decideCompletion } from "../src/verify/completion.js";
import { createWorld } from "../src/work/world.js";
import { contract } from "./support.js";

const resolved = Object.fromEntries(uncertaintyKinds.map((kind) => [kind, "irrelevant"])) as UncertaintyState;
const inputs = { contract: "contract", files: {}, packages: {}, rules: "rules", runtime: "native" };

test("completion rejects active ownership and inconsistent world fingerprints", () => {
  const world = createWorld(contract("Fix README typo"), null, inputs), fresh = { ...world, decision: { ...world.decision, valid: true, revision: world.revision, candidates: [] } };
  const owned = decideCompletion(fresh.contract, [], resolved, ["diff", "repository_rule"], { ...fresh, ownership: { writer: ["README.md"] } });
  assert.ok(owned.missingInvariants?.includes("write ownership remains active"));
  const corrupt = decideCompletion(fresh.contract, [], resolved, ["diff", "repository_rule"], { ...fresh, fingerprint: { ...fresh.fingerprint, value: "wrong" } });
  assert.ok(corrupt.missingInvariants?.includes("world fingerprint is inconsistent"));
});

test("completion rejects repository drift and invalid evidence", () => {
  const world = createWorld(contract("Fix README typo"), "base", inputs), fresh = { ...world, decision: { ...world.decision, valid: true, revision: world.revision, candidates: [] } };
  const drifted = decideCompletion(fresh.contract, [], resolved, ["diff", "repository_rule"], fresh, { repositoryRevision: "other", evidenceValid: false });
  assert.ok(drifted.missingInvariants?.includes("repository revision changed")); assert.ok(drifted.missingInvariants?.includes("evidence is unreadable or hash-mismatched"));
});
