import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { benchmarkTasks, validateTask } from "../src/benchmark/fixtures.js";
import { getDriver, scanTokenUsage } from "../src/benchmark/agents.js";
import { buildReport, formatReport } from "../src/benchmark/report.js";
import type { ArmOutcome } from "../src/benchmark/runner.js";

test("benchmark corpus tasks are counterfactually valid", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-bench-corpus-"));
  try {
    const tasks = benchmarkTasks();
    assert.ok(tasks.length >= 5);
    assert.equal(new Set(tasks.map((task) => task.id)).size, tasks.length);
    for (const task of tasks) {
      const validation = await validateTask(cwd, task);
      assert.deepEqual(validation, { task: task.id, discriminatingFailsOnBase: true, preservationPassesOnBase: true, passesOnFix: true, preservationPassesOnFix: true });
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("drivers exist for every benchmark harness and token usage parses real shapes", () => {
  for (const harness of ["codex", "claude-code", "opencode"] as const) {
    const driver = getDriver(harness);
    assert.equal(driver.name, harness);
  }
  const jsonl = ['{"type":"thread.started"}', '{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":34}}'].join("\n");
  assert.deepEqual(scanTokenUsage(jsonl), { tokensIn: 12, tokensOut: 34 });
  const single = JSON.stringify({ result: "ok", usage: { input_tokens: 5, output_tokens: 7 } });
  assert.deepEqual(scanTokenUsage(single), { tokensIn: 5, tokensOut: 7 });
  assert.deepEqual(scanTokenUsage("plain text without usage"), { tokensIn: null, tokensOut: null });
});

test("report pairs arms and computes rates, medians, and slop codes", () => {
  const outcome = (overrides: Partial<ArmOutcome>): ArmOutcome => ({ task: "t", arm: "baseline", repeat: 1, agentExit: 0, agentTimedOut: false, wallMs: 1000, tokensIn: null, tokensOut: null, locAdded: 10, locRemoved: 0, filesTouched: 1, acceptance: true, preservation: true, firstCleanPass: true, slopFindings: [], slopFree: true, ...overrides });
  const outcomes = [
    outcome({ arm: "baseline", wallMs: 1000, locAdded: 10, slopFindings: [{ code: "slop-narrational-comment", message: "m", proof: ["a:1"] }], slopFree: false }),
    outcome({ arm: "baseline", repeat: 2, wallMs: 3000, locAdded: 30 }),
    outcome({ arm: "treatment", wallMs: 2000, locAdded: 20, acceptance: false, firstCleanPass: false }),
    outcome({ arm: "treatment", repeat: 2, wallMs: 4000, locAdded: 40, tokensIn: 500, tokensOut: 100 }),
  ];
  const report = buildReport(outcomes, { harness: "codex", model: "free-model" });
  assert.equal(report.summary.baseline.acceptanceRate, 1);
  assert.equal(report.summary.treatment.acceptanceRate, 0.5);
  assert.equal(report.summary.baseline.slopFreeRate, 0.5);
  assert.equal(report.summary.treatment.slopFreeRate, 1);
  assert.equal(report.summary.baseline.medianWallMs, 1000);
  assert.equal(report.summary.treatment.medianWallMs, 2000);
  assert.equal(report.summary.treatment.tokensReported, 1);
  assert.deepEqual(report.tasks[0]?.slopCodes.baseline, ["slop-narrational-comment"]);
  const text = formatReport(report);
  assert.ok(text.includes("harness=codex") && text.includes("model=free-model") && text.includes("slop-narrational-comment"));
});
