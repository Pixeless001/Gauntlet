import assert from "node:assert/strict";
import test from "node:test";
import { LocalExecutionEnvironment, ProviderExecutionEnvironment } from "../src/execution/local.js";

test("local execution is rooted and carries a stable source id", async () => {
  const environment = new LocalExecutionEnvironment(process.cwd(), "worktree"), result = await environment.run(process.execPath, ["-e", "process.stdout.write(process.cwd())"]);
  assert.equal(result.exitCode, 0); assert.equal(result.stdout, environment.root); assert.match(environment.id, /^worktree:/);
});

test("provider execution forwards bounded arguments", async () => {
  const provider = new ProviderExecutionEnvironment("/work", "provider:one", async (command, args, options) => ({ command: [command, ...args].join(" "), exitCode: 0, stdout: String(options?.maxBytes), stderr: "", durationMs: 0, timedOut: false }));
  assert.equal((await provider.run("test", ["one"], { maxBytes: 8 })).stdout, "8");
});
