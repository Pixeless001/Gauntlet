import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/repo/process.js";
import { captureBinaryDiff } from "../src/repo/git.js";
import { verifyIsolatedPatch } from "../src/verify/promotion.js";

test("isolated promotion accepts an applicable patch without altering the source worktree", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-promotion-"));
  try {
    await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
    await writeFile(join(cwd, "source.ts"), "export const value = 1;\n"); await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
    const base = (await run("git", ["rev-parse", "HEAD"], cwd)).stdout.trim(); await writeFile(join(cwd, "source.ts"), "export const value = 2;\n");
    const patch = await captureBinaryDiff(cwd, base); assert.equal(await verifyIsolatedPatch(cwd, base, patch!), true); assert.match((await run("git", ["diff", "--", "source.ts"], cwd)).stdout, /value = 2/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
