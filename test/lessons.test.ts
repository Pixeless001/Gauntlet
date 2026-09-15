import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLessons, saveLesson, sourceFingerprint } from "../src/repo/lessons.js";

test("lessons remain small, scoped, and evidence-backed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-lessons-"));
  try {
    await writeFile(join(cwd, "auth.test.ts"), "expiry equality is expired"); const fingerprint = await sourceFingerprint(cwd, "auth.test.ts"); assert.ok(fingerprint);
    await saveLesson(cwd, { scope: "auth", fact: "expiresAt equality is expired", source: "auth.test.ts", fingerprint });
    assert.equal((await loadLessons(cwd, ["auth/session.ts"]))[0]?.fact, "expiresAt equality is expired");
    await writeFile(join(cwd, "auth.test.ts"), "changed"); assert.deepEqual(await loadLessons(cwd, ["auth/session.ts"]), []);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
