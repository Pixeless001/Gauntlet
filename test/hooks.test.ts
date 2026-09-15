import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchHook, harnessForEvent } from "../src/hooks/dispatch.js";

test("portable plugin hooks select compatible native event schemas", () => {
  assert.equal(harnessForEvent("UserPromptSubmit"), "claude-code"); assert.equal(harnessForEvent("PostToolUseFailure"), "claude-code"); assert.equal(harnessForEvent("sessionStart"), "cursor");
});

test("Codex UserPromptSubmit returns native additional context", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-codex-hook-"));
  try {
    await writeFile(join(cwd, "task.ts"), "export {};\n");
    const output = await dispatchHook("codex", { hook_event_name: "UserPromptSubmit", session_id: "session", cwd, prompt: "Change task.ts" });
    assert.equal((output.hookSpecificOutput as Record<string, unknown>).hookEventName, "UserPromptSubmit");
    assert.match(String((output.hookSpecificOutput as Record<string, unknown>).additionalContext), /task\.ts/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Cursor sessionStart returns environment and native context fields", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cursor-hook-"));
  try {
    const output = await dispatchHook("cursor", { session_id: "session", cwd }, "sessionStart");
    assert.match(String((output.env as Record<string, unknown>).GAUNTLET_TASK_ID), /^native-/); assert.match(String(output.additional_context), /smallest justified/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Cursor task id environment handoff remains stable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cursor-id-hook-"));
  try {
    const started = await dispatchHook("cursor", { session_id: "session", cwd }, "sessionStart"); const id = String((started.env as Record<string, unknown>).GAUNTLET_TASK_ID);
    const previous = process.env.GAUNTLET_TASK_ID; process.env.GAUNTLET_TASK_ID = id;
    try { const output = await dispatchHook("cursor", { cwd, tool_name: "Shell" }, "postToolUse"); assert.deepEqual(output, {}); } finally { if (previous === undefined) delete process.env.GAUNTLET_TASK_ID; else process.env.GAUNTLET_TASK_ID = previous; }
    const state = JSON.parse(await readFile(join(cwd, `.gauntlet/tasks/${id}.json`), "utf8")); assert.equal(state.activities.length, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("subsequent prompts preserve the task-start baseline", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-lifecycle-hook-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "task.ts"), "before\n");
    const event = { hook_event_name: "UserPromptSubmit", session_id: "session", cwd };
    await dispatchHook("claude-code", { ...event, prompt: "Change task.ts" }); await writeFile(join(cwd, "task.ts"), "after\n"); await dispatchHook("claude-code", { ...event, prompt: "Continue" });
    await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "session", cwd });
    const measurement = JSON.parse(await readFile(join(cwd, ".gauntlet/last-result.json"), "utf8")); assert.equal(measurement.files, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("dirty findings block stop and advance the attempt", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-clean-hook-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "task.test.ts"), "test('x', () => assert.equal(1, 1));\n");
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", session_id: "session", cwd, prompt: "Change tests" }); await unlink(join(cwd, "task.test.ts"));
    const output = await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "session", cwd }); assert.equal(output.decision, "block");
    const state = JSON.parse(await readFile(join(cwd, ".gauntlet/tasks/native-3f3af1ecebbd1410ab417ec0.json"), "utf8")); assert.equal(state.attempts, 2);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Gauntlet permits at most one correction without trusting native counters", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-correction-hook-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "task.test.ts"), "test('x', () => 1);\n");
    const identity = { hook_event_name: "UserPromptSubmit", session_id: "correction", cwd, prompt: "Change tests" }; await dispatchHook("claude-code", identity); await unlink(join(cwd, "task.test.ts"));
    assert.equal((await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "correction", cwd })).decision, "block");
    const second = await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "correction", cwd }); assert.equal(second.decision, undefined); assert.match(String(second.systemMessage), /CLEAN/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

for (const fixture of [
  { harness: "codex" as const, start: "UserPromptSubmit", activity: "PostToolUse", stop: "Stop" },
  { harness: "claude-code" as const, start: "UserPromptSubmit", activity: "PostToolUseFailure", stop: "Stop" },
  { harness: "cursor" as const, start: "sessionStart", activity: "postToolUseFailure", stop: "stop" },
]) test(`${fixture.harness} executes its native lifecycle contract`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), `gauntlet-${fixture.harness}-contract-`));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}");
    const identity = { session_id: "contract-session", cwd }; await dispatchHook(fixture.harness, { ...identity, prompt: "Maintain contract" }, fixture.start); await dispatchHook(fixture.harness, { ...identity, tool_name: "Shell", error_message: "failed" }, fixture.activity);
    const output = await dispatchHook(fixture.harness, identity, fixture.stop); assert.ok(fixture.harness === "cursor" ? String(output.followup_message).includes("not clean and verified") : output.decision === "block");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
