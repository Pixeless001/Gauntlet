import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PatternStore, type ExperiencePattern } from "../src/knowledge/patterns.js";
import { evaluateProposal, proposeAtomicChange } from "../src/knowledge/evolution.js";
import { compareEval, silenceResult } from "../src/measure/evals.js";

const pattern = (id = "repeat-failure"): ExperiencePattern => ({ id, kind: "selector", status: "supported", summary: "Investigate after repeated unsupported patches", taskClasses: ["debug"], supportingEvidence: ["run:1", "run:2"], contradictingEvidence: [], updatedAt: new Date(0).toISOString() });

test("experience storage remains bounded and proposes one atomic change", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-patterns-"));
  try { const store = new PatternStore(cwd); await store.put(pattern()); assert.equal((await store.list()).length, 1); assert.equal(proposeAtomicChange(await store.list())?.patternId, "repeat-failure"); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("rejected behavior keeps supported knowledge while passing evaluation promotes it", () => {
  const value = pattern(), proposal = proposeAtomicChange([value])!;
  assert.equal(evaluateProposal(value, proposal, []).pattern.status, "supported");
  const candidate = (id: string, passed: boolean) => silenceResult(id, 1, { category: "behavior", passed }), results = ["a", "b", "c"].map((id, index) => compareEval(candidate(id, index !== 0), candidate(id, true)));
  const decision = evaluateProposal(value, proposal, results); assert.equal(decision.retainBehavior, true); assert.equal(decision.pattern.status, "promoted");
});
