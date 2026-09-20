import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeCache } from "../src/knowledge/cache.js";

test("knowledge cache is version keyed and replaces duplicate facts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cache-")); try { const cache = new KnowledgeCache(cwd); await cache.put({ package: "demo", version: "1", query: "api", source: "installed_types", proof: "one" }); await cache.put({ package: "demo", version: "1", query: "api", source: "installed_source", proof: "two" }); assert.equal((await cache.get("demo", "1", "api"))?.proof, "two"); assert.equal(await cache.get("demo", "2", "api"), null); } finally { await rm(cwd, { recursive: true, force: true }); }
});
