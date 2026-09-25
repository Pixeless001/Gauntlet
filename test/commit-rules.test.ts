import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectCommitRules } from "../src/repo/commit-rules.js";
import { run } from "../src/repo/process.js";

async function withRepo(instructions: string, body: (cwd: string, head: string, commit: (...message: string[]) => Promise<void>) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-commit-rules-")), git = (...args: string[]) => run("git", args, cwd);
  try {
    await git("init"); await git("config", "user.email", "test@example.com"); await git("config", "user.name", "Test");
    await writeFile(join(cwd, "AGENTS.md"), instructions); await git("add", "."); await git("commit", "-m", "base");
    await body(cwd, (await git("rev-parse", "HEAD")).stdout.trim(), async (...message) => { await git("commit", "--allow-empty", ...message.flatMap((part) => ["-m", part])); });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

const forbidding = "Never add `Co-Authored-By`, `Signed-off-by`, \"Generated with\", or any other AI/tool attribution trailer.\n";

test("commits with attribution trailers violate a repository rule that forbids them", async () => {
  await withRepo(forbidding, async (cwd, head, commit) => {
    await commit("feat: clean");
    assert.deepEqual(await inspectCommitRules(cwd, head), []);
    await commit("feat: attributed", "Co-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_x");
    const [finding] = await inspectCommitRules(cwd, head);
    assert.equal(finding?.code, "commit-attribution"); assert.equal(finding?.blocking, true); assert.equal(finding?.proof.length, 1);
  });
});

test("attribution is not flagged without a rule forbidding it, or without a baseline commit", async () => {
  await withRepo("Keep commits small.\n", async (cwd, head, commit) => {
    await commit("feat: attributed", "Co-Authored-By: Claude <noreply@anthropic.com>");
    assert.deepEqual(await inspectCommitRules(cwd, head), []);
  });
  await withRepo(forbidding, async (cwd, _head, commit) => {
    await commit("feat: attributed", "Signed-off-by: Someone <a@b.c>");
    assert.deepEqual(await inspectCommitRules(cwd, null), []);
  });
});
