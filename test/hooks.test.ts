import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchHook, harnessForEvent } from "../src/hooks/dispatch.js";
import { GauntletEngine } from "../src/core/engine.js";
import { run } from "../src/repo/process.js";

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

test("Cursor task id remains stable across environments", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cursor-id-hook-"));
  try {
    const started = await dispatchHook("cursor", { session_id: "session", cwd }, "sessionStart"); const id = String((started.env as Record<string, unknown>).GAUNTLET_TASK_ID);
    const previous = process.env.GAUNTLET_TASK_ID; process.env.GAUNTLET_TASK_ID = id;
    try { const output = await dispatchHook("cursor", { cwd, tool_name: "Shell" }, "postToolUse"); assert.deepEqual(output, {}); } finally { if (previous === undefined) delete process.env.GAUNTLET_TASK_ID; else process.env.GAUNTLET_TASK_ID = previous; }
    const state = JSON.parse(await readFile(join(cwd, `.gauntlet/tasks/${id}.json`), "utf8")); assert.equal(state.activities.length, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("host adapters condition results only through declared replacement paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-replacement-hook-")), identity = { session_id: "replacement", cwd };
  try {
    await dispatchHook("claude-code", { ...identity, prompt: "Change task.ts" }, "UserPromptSubmit");
    const general = await dispatchHook("claude-code", { ...identity, tool_name: "Shell", tool_input: { command: "npm test" }, tool_response: { stdout: "noise\nFAIL case\nExpected one received two", exit_code: 1 } }, "PostToolUse");
    const replaced = (general.hookSpecificOutput as { updatedToolOutput: { stdout: string; exit_code: number } }).updatedToolOutput;
    assert.match(replaced.stdout, /FAIL case/); assert.equal(replaced.exit_code, 1);
    const mcp = await dispatchHook("cursor", { ...identity, tool_name: "mcp__browser", tool_response: { result: "button Save" } }, "postToolUse");
    assert.match(String(mcp.updated_mcp_tool_output), /button Save/);
    const feedback = await dispatchHook("codex", { ...identity, tool_name: "Shell", tool_response: { stdout: "done", exit_code: 0 } }, "PostToolUse");
    assert.match(String((feedback.hookSpecificOutput as Record<string, unknown>).additionalContext), /passed/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("compact lifecycle returns a bounded re-grounding record", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-compact-hook-")), identity = { session_id: "compact", cwd };
  try {
    await dispatchHook("claude-code", { ...identity, prompt: "Change task.ts" }, "UserPromptSubmit");
    const output = await dispatchHook("claude-code", identity, "PreCompact"), context = JSON.parse(String((output.hookSpecificOutput as Record<string, unknown>).additionalContext));
    assert.equal(context.task, "Change task.ts"); assert.ok(Array.isArray(context.artifactRefs));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("stop stays silent when the turn changed nothing and ran no checks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-readonly-hook-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: {} })); await writeFile(join(cwd, "package-lock.json"), "{}");
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", session_id: "ro", cwd, prompt: "Is gauntlet active?" });
    assert.deepEqual(await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "ro", cwd }), {});
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
    const second = await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "correction", cwd }); assert.deepEqual(second, {});
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("hooks fired from a subdirectory keep state and baseline at the repository root", async () => {
  const root = await mkdtemp(join(tmpdir(), "gauntlet-subdir-hook-")), sub = join(root, "src", "nested"), git = (...args: string[]) => run("git", args, root);
  try {
    await git("init"); await git("config", "user.email", "test@example.com"); await git("config", "user.name", "Test"); await mkdir(sub, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(root, "package-lock.json"), "{}"); await writeFile(join(root, "notes.txt"), "a\n");
    await git("add", "."); await git("commit", "-m", "base"); await writeFile(join(root, "notes.txt"), "a\nb\n");
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", session_id: "sub", cwd: sub, prompt: "What does this repo do" });
    assert.equal(existsSync(join(sub, ".gauntlet")), false); assert.equal(existsSync(join(root, ".gauntlet", "tasks")), true);
    assert.equal((await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "sub", cwd: sub })).decision, undefined);
    assert.equal(JSON.parse(await readFile(join(root, ".gauntlet/last-result.json"), "utf8")).files, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a prompt after an accepted stop starts a fresh task instead of reusing the old baseline", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-turns-hook-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}");
    const identity = { session_id: "turns", cwd }, stop = { hook_event_name: "Stop", ...identity };
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", ...identity, prompt: "What does this repo do" });
    assert.equal((await dispatchHook("claude-code", stop)).decision, undefined); await writeFile(join(cwd, "notes.txt"), "written between turns\n");
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", ...identity, prompt: "Explain the layout" });
    assert.equal((await dispatchHook("claude-code", stop)).decision, undefined);
    const tasks = join(cwd, ".gauntlet/tasks"), names = await readdir(tasks), current = names.find((name) => /^native-[a-f0-9]{24}\.json$/.test(name))!;
    assert.equal(names.filter((name) => /^native-[a-f0-9]{24}-\d+\.json$/.test(name)).length, 1);
    const state = JSON.parse(await readFile(join(tasks, current), "utf8")); assert.equal(state.contract.intent, "Explain the layout"); assert.equal(state.attempts, 1);
    assert.equal(JSON.parse(await readFile(join(cwd, ".gauntlet/last-result.json"), "utf8")).files, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("an allowed Claude Code stop shows the user nothing and does not block", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-advisory-hook-")), git = (...args: string[]) => run("git", args, cwd);
  try {
    await git("init"); await git("config", "user.email", "test@example.com"); await git("config", "user.name", "Test");
    await writeFile(join(cwd, "AGENTS.md"), "Never add `Co-Authored-By` to commits.\n"); await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}");
    await git("add", "."); await git("commit", "-m", "base");
    const identity = { session_id: "advisory", cwd }; await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", ...identity, prompt: "What does this repo do" });
    await git("commit", "--allow-empty", "-m", "chore: note", "-m", "Co-Authored-By: Someone <a@b.c>");
    const output = await dispatchHook("claude-code", { hook_event_name: "Stop", ...identity });
    assert.equal(output.decision, undefined); assert.equal(output.systemMessage, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a lock orphaned by a killed hook is reclaimed immediately instead of failing the next hook", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-orphan-lock-"));
  try {
    await writeFile(join(cwd, "package.json"), "{}");
    const identity = { session_id: "orphan", cwd }; await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", ...identity, prompt: "What does this repo do" });
    const task = (await readdir(join(cwd, ".gauntlet", "tasks"))).find((name) => /^native-[0-9a-f]+\.json$/.test(name))!, lock = join(cwd, ".gauntlet", "tasks", `${task}.lock`);
    await mkdir(lock); await writeFile(join(lock, "owner"), `2147483646\n${Date.now()}\n`);
    const started = Date.now(); await dispatchHook("claude-code", { hook_event_name: "Stop", ...identity });
    assert.ok(Date.now() - started < 4_000); assert.equal(existsSync(lock), false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a commit that breaks a repository instruction is reported to the model in the same turn, once", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-inturn-hook-")), git = (...args: string[]) => run("git", args, cwd);
  try {
    await git("init"); await git("config", "user.email", "test@example.com"); await git("config", "user.name", "Test");
    await writeFile(join(cwd, "AGENTS.md"), "Never add `Co-Authored-By` to commits.\n"); await git("add", "."); await git("commit", "-m", "base");
    const identity = { session_id: "inturn", cwd }, commit = { hook_event_name: "PostToolUse", ...identity, tool_name: "Bash", tool_input: { command: "git commit --allow-empty -m note" }, tool_response: { stdout: "ok" } };
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", ...identity, prompt: "Commit a note" });
    const context = (output: Record<string, unknown>) => String((output.hookSpecificOutput as Record<string, unknown> | undefined)?.additionalContext ?? "");
    assert.equal(context(await dispatchHook("claude-code", commit)), "");
    await git("commit", "--allow-empty", "-m", "chore: note", "-m", "Co-Authored-By: Someone <a@b.c>");
    assert.match(context(await dispatchHook("claude-code", commit)), /Co-Authored-By/); assert.equal(context(await dispatchHook("claude-code", commit)), "");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a written test file that breaks the colocated-test convention is reported in the same turn", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-drift-hook-"));
  try {
    for (const name of ["a", "b", "c"]) await writeFile(join(cwd, `${name}.test.ts`), "export {};\n");
    const engine = new GauntletEngine(cwd); await engine.start("Add a test for the parser", "drift");
    await mkdir(join(cwd, "tests"), { recursive: true }); await writeFile(join(cwd, "tests", "parser.test.ts"), "export {};\n");
    const result = await engine.activity("drift", { kind: "file_write", target: "tests/parser.test.ts", outcome: "pass", outputBytes: 0 });
    assert.ok(result.notices.some((notice) => /colocated/.test(notice)));
    assert.deepEqual((await engine.activity("drift", { kind: "file_write", target: "tests/parser.test.ts", outcome: "pass", outputBytes: 0 })).notices, []);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a turn with no file changes is not gated on completion", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-nochange-hook-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}");
    await dispatchHook("claude-code", { hook_event_name: "UserPromptSubmit", session_id: "ask", cwd, prompt: "What does this repo do" });
    assert.equal((await dispatchHook("claude-code", { hook_event_name: "Stop", session_id: "ask", cwd })).decision, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

for (const fixture of [
  { harness: "codex" as const, start: "UserPromptSubmit", activity: "PostToolUse", stop: "Stop" },
  { harness: "claude-code" as const, start: "UserPromptSubmit", activity: "PostToolUseFailure", stop: "Stop" },
  { harness: "cursor" as const, start: "sessionStart", activity: "postToolUseFailure", stop: "stop" },
]) test(`${fixture.harness} executes its native lifecycle contract`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), `gauntlet-${fixture.harness}-contract-`));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "task.ts"), "before\n");
    const identity = { session_id: "contract-session", cwd }; await dispatchHook(fixture.harness, { ...identity, prompt: "Maintain contract" }, fixture.start); await dispatchHook(fixture.harness, { ...identity, tool_name: "Shell", error_message: "failed" }, fixture.activity); await writeFile(join(cwd, "task.ts"), "after\n");
    const output = await dispatchHook(fixture.harness, identity, fixture.stop); assert.ok(fixture.harness === "cursor" ? String(output.followup_message).includes("not clean and verified") : output.decision === "block");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
