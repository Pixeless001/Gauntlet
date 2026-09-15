import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateInstructions, normalizeSearch, repeatedSearch } from "../src/context/governor.js";

test("search observations deduplicate only the same query scope and version", () => {
  const search = normalizeSearch("rg retry src/auth"); assert.deepEqual(search, { query: "retry", scope: "src/auth" });
  assert.equal(repeatedSearch([{ ...search!, version: "a", matches: [] }], { ...search!, version: "a", matches: [] }), true);
  assert.equal(repeatedSearch([{ ...search!, version: "a", matches: [] }], { ...search!, version: "b", matches: [] }), false);
});

test("repository instructions win over overlapping generic guidance", () => {
  assert.deepEqual(deduplicateInstructions([{ source: "gauntlet", text: "Prefer existing project Button" }, { source: "repository", text: "Use the existing Button" }]), ["Use the existing Button"]);
});
