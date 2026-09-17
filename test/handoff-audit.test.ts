import assert from "node:assert/strict";
import test from "node:test";
import { expandSections, HANDOFF_AUDIT, summarizeHandoffAudit } from "../src/measure/handoff-audit.js";

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
