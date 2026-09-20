import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityResolver } from "../src/capabilities/resolver.js";
import { GauntletEngine } from "../src/core/engine.js";
import { runCapabilityBoundary } from "../src/capabilities/boundary.js";

test("capabilities prefer repository then host and report alternatives", () => {
  const registry = new CapabilityRegistry();
  registry.register({ id: "fallback", kind: "search", source: "gauntlet", available: true, value: () => "fallback" });
  registry.register({ id: "native", kind: "search", source: "host", available: true, value: () => "native" });
  registry.register({ id: "repo", kind: "search", source: "repository", available: true, value: () => "repo" });
  const result = new CapabilityResolver(registry).resolve<string>("search");
  assert.equal(result.capability?.value(), "repo");
  assert.deepEqual(result.conflicts.sort(), ["fallback", "native"]);
});

test("capability overrides are explicit and unavailable providers degrade", () => {
  const registry = new CapabilityRegistry();
  registry.register({ id: "host", kind: "browser", source: "host", available: false, value: () => "host" });
  registry.register({ id: "installed", kind: "browser", source: "installed", available: true, value: () => "installed" });
  assert.equal(new CapabilityResolver(registry, { browser: "installed" }).resolve<string>("browser").capability?.value(), "installed");
  assert.equal(new CapabilityResolver(new CapabilityRegistry()).resolve("browser").capability, null);
});

test("engine registry applies repository, host, installed, and native precedence", () => {
  const engine = new GauntletEngine(process.cwd(), { harness: "codex", capabilities: [
    { id: "installed-output", kind: "output", source: "installed", available: true, value: () => "installed" },
    { id: "repository-output", kind: "output", source: "repository", available: true, value: () => "repository" },
  ] });
  assert.equal(engine.capability<string>("output").capability?.id, "repository-output");
});

test("optional capability boundary redacts, limits, tracks source, and fails open", async () => {
  const held: (() => void)[] = [], run = (request: string) => new Promise<string>((resolve) => held.push(() => resolve(request)));
  const first = runCapabilityBoundary({ source: "local-provider", request: "token=secret-value", maxConcurrency: 1, run });
  const rejected = await runCapabilityBoundary({ source: "local-provider", request: "safe", maxConcurrency: 1, run }); assert.equal(rejected.status, "unavailable"); assert.equal(rejected.source, "local-provider");
  held[0]!(); const completed = await first; assert.equal(completed.status, "ok"); assert.equal(completed.result, "token=[redacted]");
  const timedOut = await runCapabilityBoundary({ source: "slow-provider", request: "safe", timeoutMs: 1, run: async (_request, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("late")))) }); assert.deepEqual(timedOut, { status: "unavailable", source: "slow-provider", request: "safe", reason: "deadline exceeded" });
});
