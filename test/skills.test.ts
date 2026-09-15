import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("packaged skills have unique valid frontmatter", async () => {
  const directories = await readdir("skills"), names = new Set<string>();
  assert.deepEqual(directories.sort(), ["implement", "investigate", "optimize", "review", "understand", "verify"]);
  for (const directory of directories) {
    const content = await readFile(`skills/${directory}/SKILL.md`, "utf8"), frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${directory} has frontmatter`);
    const fields = Object.fromEntries(frontmatter[1]!.split("\n").map((line) => { const index = line.indexOf(":"); return [line.slice(0, index), line.slice(index + 1).trim()]; }));
    assert.match(fields.name ?? "", /^[a-z0-9-]+$/); assert.equal(fields.name, directory); assert.ok(fields.description); assert.ok(fields.triggers); assert.ok(fields.budget); assert.equal(names.has(fields.name!), false); names.add(fields.name!);
    assert.match(content, /Stop /); assert.doesNotMatch(content, /You are an expert|Think deeply|Be comprehensive/);
  }
});
