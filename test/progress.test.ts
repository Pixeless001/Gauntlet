import assert from "node:assert/strict";
import test from "node:test";
import { assessProgress } from "../src/execution-state/progress.js";
import type { ExecutionCheckpoint } from "../src/execution-state/checkpoints.js";
import { initialUncertainty } from "../src/control/uncertainty.js";
import { contract } from "./support.js";

const point = (id: string, status: ExecutionCheckpoint["status"] = "active"): ExecutionCheckpoint => ({ id, kind: "implementation", status, summary: id, constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], proofRefs: [], createdFromEvent: 0, resolves: [], ...(status === "rejected" ? { rejectionReason: "invalid approach" } : {}) });
const uncertainty = () => initialUncertainty(contract("Fix broken behavior"), "elevated");

test("progress stalls only when repeated work adds no proof", () => {
  const checkpoints = [point("root")];
  const stalled = assessProgress({ checkpoints, activeCheckpointId: "root", uncertainty: uncertainty(), events: [
    { index: 0, type: "failure", target: "npm test", outcome: "fail" }, { index: 1, type: "failure", target: "npm test", outcome: "fail" },
  ] });
  assert.equal(stalled.status, "STALLED");
  const progress = assessProgress({ checkpoints, activeCheckpointId: "root", uncertainty: uncertainty(), events: [...[
    { index: 0, type: "failure" as const, target: "npm test", outcome: "fail" as const }, { index: 1, type: "test_result" as const, target: "cause", outcome: "pass" as const, proofRef: "run:2" },
  ]] });
  assert.equal(progress.status, "PROGRESS");
});

test("progress regresses when current work repeats a rejected direction", () => {
  const rejected = { ...point("bad", "rejected"), summary: "custom retry helper" };
  const result = assessProgress({ checkpoints: [rejected, point("good")], activeCheckpointId: "good", uncertainty: uncertainty(), events: [{ index: 0, type: "file_write", target: "custom retry helper", outcome: "pass" }] });
  assert.equal(result.status, "REGRESSED");
});
