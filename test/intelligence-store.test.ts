import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadStructuralIndex, saveStructuralIndex } from "../src/intelligence/store.js";
import type { StructuralIndex } from "../src/intelligence/index.js";

test("structural index storage is local atomic and recoverable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-index-store-"));
  try {
    const value: StructuralIndex = { version: 1, head: "abc", files: {}, dependents: {} };
    assert.equal(await saveStructuralIndex(cwd, value), true);
    assert.deepEqual(await loadStructuralIndex(cwd), value);
    const path = join(cwd, ".gauntlet", "index", "structural-v1.json");
    assert.equal(JSON.parse(await readFile(path, "utf8")).head, "abc");
    await writeFile(path, "not json");
    assert.equal(await loadStructuralIndex(cwd), null);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("structural index storage rejects oversized state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-index-bounds-"));
  try {
    await mkdir(join(cwd, ".gauntlet", "index"), { recursive: true });
    await writeFile(join(cwd, ".gauntlet", "index", "structural-v1.json"), "x".repeat(1_048_577));
    assert.equal(await loadStructuralIndex(cwd), null);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
