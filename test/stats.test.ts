import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatStats, loadHistory } from "../src/reporting/stats.js";

const entry = (taskId: string, extra: object) => JSON.stringify({ taskId, files: 1, added: 10, removed: 4, checksRun: 2, durationMs: 2_000, attempts: 1, findings: [], clean: true, verified: true, firstPass: true, ...extra });

test("stats keeps the last entry per task, drops read-only turns, and aggregates", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-stats-"));
  try {
    await mkdir(join(cwd, ".gauntlet"));
    await writeFile(join(cwd, ".gauntlet", "history.jsonl"), [entry("a", { firstPass: false, verified: false, attempts: 1, findings: ["x"] }), entry("a", { attempts: 2, firstPass: false }), entry("b", {}), entry("ro", { files: 0, checksRun: 0 }), "{torn"].join("\n"));
    const history = await loadHistory(cwd);
    assert.deepEqual(history.map((h) => h.taskId), ["a", "b"]);
    const out = formatStats(history, null);
    assert.match(out, /Tasks\s+2/); assert.match(out, /First pass\s+50%/); assert.match(out, /Corrected\s+1/); assert.match(out, /\+20\/-8/);
    assert.match(formatStats([], null), /No recorded tasks/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
