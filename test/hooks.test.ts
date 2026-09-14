import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchHook } from "../src/hooks/dispatch.js";

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
