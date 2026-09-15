import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAssumption } from "../src/repo/assumptions.js";
import type { RepoIndex } from "../src/repo/index.js";

const index = (files: string[]): RepoIndex => ({ mode: "filesystem", head: null, files, tests: [], configs: [], dirty: [], fingerprints: {} });

test("assumptions prefer bounded repository usage", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-assumption-"));
  try {
    await writeFile(join(cwd, "large.ts"), "x".repeat(100)); await writeFile(join(cwd, "usage.ts"), "import { parse } from 'zod'; parse();");
    const value = await resolveAssumption(cwd, { packageName: "zod", symbol: "parse" }, index(["large.ts", "usage.ts"]), 4, 64);
    assert.equal(value.kind, "repository-usage"); assert.deepEqual(value.evidence, ["usage.ts"]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("assumption package names cannot escape node_modules", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-assumption-"));
  try { await assert.rejects(resolveAssumption(cwd, { packageName: "../../secret" }, index([])), /Invalid package name/); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});
