import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, installationStatus, uninstall } from "../src/adapters/install.js";
import { codexAdapter } from "../src/adapters/codex/index.js";
import { claudeCodeAdapter } from "../src/adapters/claude-code/index.js";
import { cursorAdapter } from "../src/adapters/cursor/index.js";

test("adapter translates native events and rejects foreign events", () => {
  const event = codexAdapter.translate({ hook_event_name: "UserPromptSubmit", session_id: "1", cwd: "/repo", prompt: "fix" });
  assert.equal(event.type, "task_start"); assert.equal(event.repository, "/repo");
  assert.throws(() => codexAdapter.translate({}, "sessionStart"), /Unsupported native hook event/);
  assert.throws(() => codexAdapter.translate({}, "Stop"), /stable session identifier/);
});

test("adapters publish individually testable capabilities", () => {
  assert.equal(claudeCodeAdapter.capabilities.lifecycle.failure, true);
  assert.equal(codexAdapter.capabilities.lifecycle.failure, false);
  assert.equal(cursorAdapter.capabilities.lifecycle.beforeStop, true);
  assert.equal(codexAdapter.capabilities.delegation.supported, false);
});

test("adapter records semantic file and command activity", () => {
  const read = codexAdapter.translate({ hook_event_name: "PostToolUse", session_id: "1", cwd: "/repo", tool_name: "Read", tool_input: { file_path: "/repo/src/a.ts" } });
  const shell = codexAdapter.translate({ hook_event_name: "PostToolUse", session_id: "1", cwd: "/repo", tool_name: "Shell", tool_input: { command: "npm   test -- auth" } });
  assert.equal(read.type, "task_activity"); if (read.type === "task_activity") assert.deepEqual(read.activity, { kind: "file_read", target: "src/a.ts", outcome: "pass", outputBytes: 2 });
  assert.equal(shell.type, "task_activity"); if (shell.type === "task_activity") assert.equal(shell.activity.target, "npm test -- auth");
});

test("adapter detects failures reported inside successful post-tool events", () => {
  const event = codexAdapter.translate({ hook_event_name: "PostToolUse", session_id: "1", cwd: "/repo", tool_name: "Shell", tool_input: { command: "npm test -- auth" }, tool_response: { exit_code: 1 } });
  assert.equal(event.type, "task_activity"); if (event.type === "task_activity") assert.equal(event.activity.outcome, "fail");
});

test("adapter carries a structured Gauntlet state report", () => {
  const value = codexAdapter.translate({ session_id: "report", cwd: "/repo", tool_name: "gauntlet_state", tool_input: { gauntlet_state: { kind: "cause_validated", summary: "request race reproduced", constraints: [], relevantFiles: ["src/request.ts"], relevantSymbols: [], proofRefs: ["test:race"] } } }, "PostToolUse");
  assert.equal(value.type, "task_activity");
  if (value.type === "task_activity") { assert.equal(value.activity.kind, "decision_signal"); assert.equal(value.activity.report?.kind, "cause_validated"); assert.deepEqual(value.activity.report?.relevantFiles, ["src/request.ts"]); }
});

test("installation is idempotent and reversible", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-install-"));
  try {
    const target = await install(cwd, "codex"); await install(cwd, "codex");
    const config = JSON.parse(await readFile(target, "utf8"));
    assert.equal(config.hooks.UserPromptSubmit.length, 1); assert.match(JSON.stringify(config), /--gauntlet-managed/);
    await uninstall(cwd, "codex"); await assert.rejects(readFile(target));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("native installation preserves unrelated Claude Code settings and hooks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-claude-")), directory = join(cwd, ".claude"), target = join(directory, "settings.json");
  try {
    await mkdir(directory); await writeFile(target, JSON.stringify({ permissions: { allow: ["Read"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo existing" }] }] } }));
    await install(cwd, "claude-code"); let config = JSON.parse(await readFile(target, "utf8"));
    assert.deepEqual(config.permissions, { allow: ["Read"] }); assert.equal(config.hooks.Stop.length, 2);
    await uninstall(cwd, "claude-code"); config = JSON.parse(await readFile(target, "utf8"));
    assert.deepEqual(config.permissions, { allow: ["Read"] }); assert.equal(config.hooks.Stop.length, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Cursor installation uses its native lower-camel event schema", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cursor-"));
  try { const target = await install(cwd, "cursor"); const config = JSON.parse(await readFile(target, "utf8")); assert.equal(config.version, 1); assert.ok(config.hooks.sessionStart); assert.equal(config.hooks.stop[0].loop_limit, 1); } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("installation creates each native configuration directory and reports exact status", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-hosts-"));
  try {
    await Promise.all([install(cwd, "codex"), install(cwd, "claude-code"), install(cwd, "cursor")]); const status = await installationStatus(cwd);
    assert.equal(status.codex.path, join(cwd, ".codex/hooks.json")); assert.equal(status["claude-code"].path, join(cwd, ".claude/settings.json")); assert.equal(status.cursor.path, join(cwd, ".cursor/hooks.json"));
    assert.equal(Object.values(status).every((item) => item.installed), true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
