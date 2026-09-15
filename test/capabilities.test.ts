import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityResolver } from "../src/capabilities/resolver.js";

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
