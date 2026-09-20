import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conditionOutput } from "../src/output/conditioner.js";
import { processArtifact } from "../src/output/processors.js";
import { ArtifactStore, storeOutput } from "../src/output/store.js";

const result = { command: "npm test", exitCode: 1, stdout: "boilerplate\nboilerplate\nFAIL auth.test.ts\nExpected 2 received 3\n", stderr: "", durationMs: 1, timedOut: false };

test("conditioning deduplicates noise and preserves actionable failures", () => {
  const value = conditionOutput(result);
  assert.match(value.summary, /FAIL auth\.test\.ts/); assert.match(value.summary, /Expected 2 received 3/);
  assert.ok(value.retainedBytes < value.rawBytes + Buffer.byteLength("npm test: failed (1)"));
  assert.equal(value.actionableFailures, 2); assert.equal(value.truncated, false); assert.ok(value.tokensRemoved >= 0);
});

test("conditioning records truncation and estimated context savings", () => {
  const diagnostics = Array.from({ length: 100 }, (_, index) => `FAIL diagnostic ${index}`).join("\n");
  const value = conditionOutput({ ...result, stdout: `${diagnostics}\nunique error\n` }, 64);
  assert.equal(value.truncated, true); assert.ok(value.tokensRemoved > 0); assert.match(value.summary, /summary truncated/);
});

test("browser proof conditioning keeps acceptance signals and drops page noise", () => {
  const output = Array.from({ length: 200 }, (_, index) => `div class="noise-${index}"`).join("\n") + "\nconsole error: hydration failed\nbutton Submit enabled";
  const summary = processArtifact({ operation: "browser", input: "open /settings", output, status: "fail", paths: [], symbols: [], processor: "browser" });
  assert.match(summary, /hydration failed/); assert.match(summary, /button Submit/); assert.doesNotMatch(summary, /noise-150/); assert.ok(Buffer.byteLength(summary) < Buffer.byteLength(output));
});

test("raw proof retention remains bounded", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-output-"));
  try { for (let index = 0; index < 105; index++) await storeOutput(cwd, { ...result, exitCode: 0, stdout: String(index) }, "task"); assert.equal((await readdir(join(cwd, ".gauntlet/sessions/task/artifacts"))).length, 100); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("raw proof is stored outside task state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-output-"));
  try { const handle = await storeOutput(cwd, result, "task-1"); assert.match((await new ArtifactStore(cwd).raw(handle)).toString(), /boilerplate[\s\S]*FAIL/); assert.match(handle, /^artifact:\/\/task-1\/t_000001$/); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("artifact retrieval is byte-identical, addressable, and progressively bounded", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-output-")), store = new ArtifactStore(cwd), output = "one\ntwo\nthree\n";
  try {
    const metadata = await store.put("task", { operation: "search", target: "src", input: "query", output, status: "pass", semanticDescription: "matching source lines", paths: ["src/a.ts"], symbols: [], processor: "search" }, 4);
    assert.equal(metadata.id, "t_000001"); assert.equal((await store.raw(metadata.artifactRef)).equals(Buffer.from(output)), true);
    assert.equal(await store.read(metadata.artifactRef, { detail: "reference" }), metadata.artifactRef);
    assert.equal(await store.read(metadata.artifactRef, { detail: "raw", lines: { start: 2, end: 2 } }), "two");
    await assert.rejects(store.read("artifact://task/../../outside", { detail: "raw" }), /Invalid artifact handle/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
