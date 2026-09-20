import assert from "node:assert/strict";
import test from "node:test";
import type { CounterfactualEnvironment } from "../src/verify/counterfactual.js";
import { verifyCounterfactual } from "../src/verify/counterfactual.js";

const environment = (exitCode: number): CounterfactualEnvironment => ({ kind: "sandbox-provider", id: String(exitCode), root: "/tmp", candidateProofAvailable: true, run: async () => ({ command: "test", exitCode, stdout: "", stderr: "", durationMs: 1, timedOut: false }) });
const check = { id: "regression", reason: "new behavior", command: "npm", args: ["test"] };
test("counterfactual proof distinguishes strong, weak, and skipped checks", async () => {
  assert.equal((await verifyCounterfactual(check, environment(1), environment(0), true)).status, "strong");
  assert.equal((await verifyCounterfactual(check, environment(0), environment(0), true)).status, "weak");
  assert.equal((await verifyCounterfactual(check, null, environment(0), true)).status, "skipped");
});
