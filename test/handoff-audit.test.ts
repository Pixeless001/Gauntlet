import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandSections, HANDOFF_AUDIT, summarizeHandoffAudit, validateAuditEvidence } from "../src/measure/handoff-audit.js";

test("handoff audit is explicit, evidenced, and refuses a false release-ready verdict", () => {
  const summary = summarizeHandoffAudit();
  assert.equal(HANDOFF_AUDIT.length, 31);
  assert.equal(summary.totalSections, 136);
  assert.equal(summary.releaseReady, false);
  assert.equal(summary.verdict, "not-ready");
  assert.ok(summary.missing > 0 && summary.partial > summary.implemented);
  assert.ok(summary.missingSections > summary.missing);
  assert.equal(summary.completion, (summary.implementedSections + summary.partialSections * 0.5) / 136);
  assert.equal(summary.coverageLowerBound, summary.implementedSections / 136);
  assert.equal(summary.coverageUpperBound, (summary.implementedSections + summary.partialSections) / 136);
  assert.ok(summary.coverageLowerBound < summary.completion && summary.completion < summary.coverageUpperBound);
  assert.deepEqual(summary.nextBlockingSections, ["5-10", "11-13", "26-28", "29-35", "36-39, 41"]);
  assert.ok(HANDOFF_AUDIT.every((item) => item.status === "implemented" ? item.evidence.length > 0 && !item.gap : Boolean(item.gap)));
});

test("audit identifies dead-end optional capabilities and missing evaluation gates", () => {
  const missing = HANDOFF_AUDIT.filter((item) => item.status === "missing").map((item) => item.sections);
  assert.deepEqual(missing, ["62-68", "72", "73", "114", "116", "117"]);
  for (const sections of ["69-71", "74-76", "96-101, 103-113", "115"]) {
    assert.equal(HANDOFF_AUDIT.find((item) => item.sections === sections)?.status, "partial");
  }
});

test("audit covers every numbered handoff section exactly through the final sequence", () => {
  const covered = new Set(HANDOFF_AUDIT.flatMap((item) => expandSections(item.sections)));
  assert.deepEqual([...covered].sort((a, b) => a - b), Array.from({ length: 136 }, (_, section) => section));
});

test("section range parsing rejects malformed overlapping audit input", () => {
  assert.deepEqual(expandSections("0-2, 5, 7-8"), [0, 1, 2, 5, 7, 8]);
  assert.throws(() => expandSections("4-2"), /descending/);
  assert.throws(() => summarizeHandoffAudit([HANDOFF_AUDIT[0]!, HANDOFF_AUDIT[0]!]), /overlaps/);
});

test("audit evidence rejects missing and escaping paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-audit-"));
  try {
    await mkdir(join(cwd, "src")); await writeFile(join(cwd, "src", "present.ts"), "export {};\n");
    const items = [{ sections: "1", capability: "present", status: "implemented" as const, evidence: ["src/present.ts"] }, { sections: "2", capability: "missing", status: "implemented" as const, evidence: ["src/missing.ts"] }, { sections: "3", capability: "unsafe", status: "implemented" as const, evidence: ["../outside"] }];
    assert.deepEqual(await validateAuditEvidence(cwd, items), [{ sections: "2", evidence: "src/missing.ts", reason: "missing" }, { sections: "3", evidence: "../outside", reason: "unsafe" }]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
