import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/repo/process.js";

test("run launches real executables directly", async () => {
  const result = await run("git", ["--version"], process.cwd());
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /git version/);
});

test("run resolves package-manager shims that lack PATHEXT support", async () => {
  const result = await run("npm", ["--version"], process.cwd());
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^\d+\.\d+\.\d+/);
});
