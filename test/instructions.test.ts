import assert from "node:assert/strict";
import test from "node:test";
import { selectInstructionSections } from "../src/repo/instructions.js";

const file = [
  "# AGENTS.md", "", "# Persona", "Be terse.".repeat(150), "",
  "# Code Guidelines", "Keep changes surgical.".repeat(40), "",
  "# Git & GitHub", "Never add `Co-Authored-By` to commits.", "    feat(auth): example title", "", "## Commit Rules", "- Use `type(scope): summary` titles.",
].join("\n");

test("instruction sections are chosen by relevance, so late git rules survive a size limit that a prefix would cut", () => {
  const editing = selectInstructionSections(file, "Fix the parser and push it", 700);
  assert.match(editing, /Co-Authored-By/); assert.match(editing, /Commit Rules/); assert.ok(editing.length <= 700); assert.doesNotMatch(editing, /example title/);
  assert.ok(!file.slice(0, 700).includes("Co-Authored-By"));
});

test("a section too large to fit keeps its heading and rule lines rather than a cut prefix", () => {
  const long = ["# Commit Rules", ...Array.from({ length: 40 }, (_, index) => `Titles are short and lowercase, number ${index}.`), "Never add `Co-Authored-By` to commits.", "Keep it friendly."].join("\n");
  const picked = selectInstructionSections(long, "Commit the fix", 300);
  assert.match(picked, /Never add `Co-Authored-By`/); assert.match(picked, /^# Commit Rules/); assert.doesNotMatch(picked, /Keep it friendly/); assert.ok(picked.length <= 300);
});

test("instruction selection honors term overlap and never exceeds its limit", () => {
  const picked = selectInstructionSections(file, "Rewrite persona guidelines", 300);
  assert.match(picked, /Persona/); assert.ok(picked.length <= 300);
});
