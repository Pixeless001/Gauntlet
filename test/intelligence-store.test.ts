import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadStructuralIndex, saveStructuralIndex } from "../src/intelligence/store.js";
import { buildStructuralIndex } from "../src/intelligence/index.js";
import type { StructuralIndex } from "../src/intelligence/index.js";

test("structural index storage is local atomic and recoverable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-index-store-"));
  try {
    const value: StructuralIndex = { version: 1, head: "abc", files: {}, dependents: {} };
    assert.equal(await saveStructuralIndex(cwd, value), true);
    assert.deepEqual(await loadStructuralIndex(cwd), value);
    assert.equal(await loadStructuralIndex(cwd, "different-head"), null);
    assert.deepEqual(await loadStructuralIndex(cwd, "abc"), value);
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

test("structural index storage rejects state copied from another repository", async () => {
  const source = await mkdtemp(join(tmpdir(), "gauntlet-index-source-")), target = await mkdtemp(join(tmpdir(), "gauntlet-index-target-"));
  try {
    const value: StructuralIndex = { version: 1, head: "abc", files: {}, dependents: {} };
    await saveStructuralIndex(source, value);
    await mkdir(join(target, ".gauntlet", "index"), { recursive: true });
    await writeFile(join(target, ".gauntlet", "index", "structural-v1.json"), await readFile(join(source, ".gauntlet", "index", "structural-v1.json")));
    assert.equal(await loadStructuralIndex(target), null);
  } finally { await rm(source, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }); }
});

test("structural index storage invalidates changed file fingerprints", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-index-fingerprint-"));
  try {
    await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
    const value = await buildStructuralIndex(cwd, { mode: "git", head: "abc", files: ["source.ts"], tests: [], configs: [], dirty: [], fingerprints: {} });
    await saveStructuralIndex(cwd, value); assert.deepEqual(await loadStructuralIndex(cwd, "abc"), value);
    await writeFile(join(cwd, "source.ts"), "export const value = 2;\n");
    assert.equal(await loadStructuralIndex(cwd, "abc"), null);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
