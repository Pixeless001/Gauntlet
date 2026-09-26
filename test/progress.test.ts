import assert from "node:assert/strict";
import test from "node:test";
import { assessProgress } from "../src/execution-state/progress.js";
import type { ExecutionCheckpoint } from "../src/execution-state/checkpoints.js";
import type { ExecutionEvent } from "../src/execution-state/events.js";
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

test("repeated rewrites stall only without a proof between them, and never for agent scratch files", () => {
  const checkpoints = [point("root")], write = (index: number, target: string) => ({ index, type: "file_write" as const, target, outcome: "pass" as const });
  const run = (events: ExecutionEvent[]) => assessProgress({ checkpoints, activeCheckpointId: "root", uncertainty: uncertainty(), events }).status;
  assert.equal(run([write(0, "src/a.ts"), write(1, "src/a.ts"), write(2, "src/a.ts")]), "STALLED");
  assert.equal(run([write(0, "src/a.ts"), { index: 1, type: "test_result", target: "npm test", outcome: "pass" }, write(2, "src/a.ts"), write(3, "src/a.ts")]), "PROGRESS");
  assert.equal(run([write(0, "C:/Users/me/.claude/plans/plan.md"), write(1, "C:/Users/me/.claude/plans/plan.md"), write(2, "C:/Users/me/.claude/plans/plan.md")]), "PROGRESS");
});
