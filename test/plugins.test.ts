import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("native plugin manifests and portable hooks ship in the package", async () => {
  const [codex, claude, hooks, pkg] = await Promise.all([readFile(".codex-plugin/plugin.json", "utf8"), readFile(".claude-plugin/plugin.json", "utf8"), readFile("hooks/hooks.json", "utf8"), readFile("package.json", "utf8")].map(async (promise) => JSON.parse(await promise)));
  assert.equal(codex.name, "gauntlet"); assert.equal(claude.name, "gauntlet"); assert.match(JSON.stringify(hooks), /hook auto/); assert.match(JSON.stringify(hooks), /CLAUDE_PLUGIN_ROOT/); assert.match(JSON.stringify(hooks), /PLUGIN_ROOT/);
  assert.ok(pkg.files.includes(".codex-plugin")); assert.ok(pkg.files.includes(".claude-plugin")); assert.ok(pkg.files.includes("hooks"));
});
