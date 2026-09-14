import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, uninstall } from "../src/adapters/install.js";
import { codexAdapter } from "../src/adapters/codex/index.js";

test("adapter validates common events", () => {
  const event = codexAdapter.translate({ version: 1, type: "task_start", taskId: "1", repository: "/repo", timestamp: new Date().toISOString(), intent: "fix" });
  assert.equal(event.type, "task_start");
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
