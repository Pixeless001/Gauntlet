import assert from "node:assert/strict";
import test from "node:test";
import { parseAddedLines } from "../src/repo/diff-text.js";
import { analyzeSlopLines } from "../src/verify/slop.js";

test("added-line parser maps unified diff hunks to files and skips context", () => {
  const diff = ["diff --git a/src/a.ts b/src/a.ts", "index 1..2 100644", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,2 +1,3 @@", " const kept = 1;", "+const fresh = 2;", "-const gone = 3;", "diff --git a/src/b.ts b/src/b.ts", "--- a/src/b.ts", "+++ /dev/null"].join("\n");
  const added = parseAddedLines(diff);
  assert.deepEqual(added["src/a.ts"], ["const fresh = 2;"]);
  assert.equal(added["src/b.ts"], undefined);
});

test("slop analysis flags narrational comments, density, empty catch, decorated logs", () => {
  const narrated = analyzeSlopLines("src/x.ts", ["// This function adds numbers", "const a = 1;"]);
  assert.ok(narrated.some((signal) => signal.code === "slop-narrational-comment"));
  const dense = analyzeSlopLines("src/x.ts", ["// first", "// second", "// third", "// fourth", "// fifth", "const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;", "const e = 5;", "const f = 6;"]);
  assert.ok(dense.some((signal) => signal.code === "slop-comment-density"));
  const swallow = analyzeSlopLines("src/x.ts", ["try {", "run();", "} catch {", "}", "done();"]);
  assert.ok(swallow.some((signal) => signal.code === "slop-empty-catch"));
  const decorated = analyzeSlopLines("src/x.ts", ["console.log('✅ done');"]);
  assert.ok(decorated.some((signal) => signal.code === "slop-decorated-log"));
  const ai = analyzeSlopLines("src/x.ts", ["// It's worth noting that this handles edge cases"]);
  assert.ok(ai.some((signal) => signal.code === "slop-narrational-comment"));
});

test("slop analysis ignores non-code files and clean code", () => {
  assert.deepEqual(analyzeSlopLines("README.md", ["// This function", "const a = 1;"]), []);
  assert.deepEqual(analyzeSlopLines("src/clean.ts", ["const sum = (a: number, b: number): number => a + b;", "export { sum };"]), []);
});
