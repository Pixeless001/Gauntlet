import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARCHITECTURE_AUDIT, summarizeArchitectureAudit, validateAuditProof, type ArchitectureAuditItem } from "../src/measure/architecture-audit.js";

test("architecture audit proves every mandatory product capability", async () => {
  const summary = summarizeArchitectureAudit(), issues = await validateAuditProof(process.cwd());
  assert.equal(new Set(ARCHITECTURE_AUDIT.map((item) => item.id)).size, ARCHITECTURE_AUDIT.length);
  assert.equal(summary.total, 12); assert.equal(summary.mandatory, 12); assert.equal(summary.releaseReady, true); assert.deepEqual(summary.blocking, []); assert.deepEqual(issues, []);
  assert.ok(ARCHITECTURE_AUDIT.every((item) => item.acceptance && item.implementation.length && item.tests.length && !item.gap));
});

test("architecture audit rejects duplicate capability ids", () => { assert.throws(() => summarizeArchitectureAudit([ARCHITECTURE_AUDIT[0]!, ARCHITECTURE_AUDIT[0]!]), /duplicate/); });

test("audit proof rejects missing, unverified, and escaping paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-audit-")), outside = await mkdtemp(join(tmpdir(), "gauntlet-audit-outside-"));
  try {
    await mkdir(join(cwd, "src")); await writeFile(join(cwd, "src", "present.ts"), "export {};\n"); await writeFile(join(outside, "escaped.ts"), "export const escaped = true;\n"); await symlink(join(outside, "escaped.ts"), join(cwd, "src", "linked.ts"));
    const item = (id: string, implementation: string[], tests: string[]): ArchitectureAuditItem => ({ id, capability: id, acceptance: id, mandatory: true, status: "implemented", implementation, tests });
    const items = [item("present", ["src/present.ts#export"], ["src/present.ts"]), item("missing", ["src/missing.ts"], ["src/present.ts"]), item("unsafe", ["../outside"], ["src/present.ts"]), item("directory", ["src"], ["src/present.ts"]), item("unverified", ["src/present.ts#missingSymbol"], ["src/present.ts"]), item("symlink", ["src/linked.ts#escaped"], ["src/present.ts"]), item("empty", [], ["src/present.ts"])];
    assert.deepEqual(await validateAuditProof(cwd, items), [{ id: "missing", kind: "implementation", proof: "src/missing.ts", reason: "missing" }, { id: "unsafe", kind: "implementation", proof: "../outside", reason: "unsafe" }, { id: "directory", kind: "implementation", proof: "src", reason: "missing" }, { id: "unverified", kind: "implementation", proof: "src/present.ts#missingSymbol", reason: "unverified" }, { id: "symlink", kind: "implementation", proof: "src/linked.ts#escaped", reason: "unsafe" }, { id: "empty", kind: "implementation", proof: "", reason: "missing" }]);
  } finally { await rm(cwd, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
