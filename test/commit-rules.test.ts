import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitRules, inspectCommitRules } from "../src/repo/commit-rules.js";
import { run } from "../src/repo/process.js";

async function withRepo(instructions: string, body: (cwd: string, head: string, commit: (...message: string[]) => Promise<void>) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-commit-rules-")), git = (...args: string[]) => run("git", args, cwd);
  try {
    await git("init"); await git("config", "user.email", "test@example.com"); await git("config", "user.name", "Test");
    await writeFile(join(cwd, "AGENTS.md"), instructions); await git("add", "."); await git("commit", "-m", "base");
    await body(cwd, (await git("rev-parse", "HEAD")).stdout.trim(), async (...message) => { await git("commit", "--allow-empty", ...message.flatMap((part) => ["-m", part])); });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

test("negative commit instructions that name terms become checkable rules", () => {
  const rules = commitRules("AGENTS.md", ["# Git", "Never add `Co-Authored-By` or \"Generated with\" to commits.", "- Do not create empty commits.", "Never touch `secrets.env`.", "Keep commits small."].join("\n"));
  assert.deepEqual(rules.map((rule) => rule.terms), [["Co-Authored-By", "Generated with"]]);
});

test("commits are checked against whatever terms the repository's instructions forbid", async () => {
  await withRepo("Never add `Co-Authored-By` to commits.\nDo not include `Ticket:` lines in commits.\n", async (cwd, head, commit) => {
    await commit("feat: clean", "Explains why Co-Authored-By is not used here.");
    assert.deepEqual(await inspectCommitRules(cwd, head), []);
    await commit("feat: trailer", "Co-Authored-By: Someone <a@b.c>"); await commit("feat: ticket", "Ticket: 42");
    const findings = await inspectCommitRules(cwd, head);
    assert.equal(findings.length, 2); assert.ok(findings.every((finding) => finding.code === "convention-instruction" && finding.blocking === false && finding.proof.length === 1));
  });
});

test("nothing is flagged without a matching rule or a baseline commit", async () => {
  await withRepo("Keep commits small.\n", async (cwd, head, commit) => {
    await commit("feat: trailer", "Co-Authored-By: Someone <a@b.c>");
    assert.deepEqual(await inspectCommitRules(cwd, head), []);
  });
  await withRepo("Never add `Co-Authored-By` to commits.\n", async (cwd, _head, commit) => {
    await commit("feat: trailer", "Co-Authored-By: Someone <a@b.c>");
    assert.deepEqual(await inspectCommitRules(cwd, null), []);
  });
});
