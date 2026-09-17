import assert from "node:assert/strict";
import test from "node:test";
import { HANDOFF_AUDIT, summarizeHandoffAudit } from "../src/measure/handoff-audit.js";

test("handoff audit is explicit, evidenced, and refuses a false release-ready verdict", () => {
  const summary = summarizeHandoffAudit();
  assert.equal(HANDOFF_AUDIT.length, 31);
  assert.equal(summary.releaseReady, false);
  assert.ok(summary.missing > 0 && summary.partial > summary.implemented);
  assert.ok(HANDOFF_AUDIT.every((item) => item.status === "implemented" ? item.evidence.length > 0 && !item.gap : Boolean(item.gap)));
});

test("audit identifies dead-end optional capabilities and missing evaluation gates", () => {
  const missing = HANDOFF_AUDIT.filter((item) => item.status === "missing").map((item) => item.sections);
  assert.deepEqual(missing, ["62-68", "72", "73", "114", "116", "117"]);
  for (const sections of ["69-71", "74-76", "96-113", "115"]) {
    assert.equal(HANDOFF_AUDIT.find((item) => item.sections === sections)?.status, "partial");
  }
});
