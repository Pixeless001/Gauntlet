import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLessons, saveLesson, sourceFingerprint } from "../src/repo/lessons.js";
import { createContextPacket, formatContext } from "../src/core/context.js";

test("lessons remain small, scoped, and evidence-backed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-lessons-"));
  try {
    await writeFile(join(cwd, "auth.test.ts"), "expiry equality is expired"); const fingerprint = await sourceFingerprint(cwd, "auth.test.ts"); assert.ok(fingerprint);
    await saveLesson(cwd, { scope: "auth", fact: "expiresAt equality is expired", source: "auth.test.ts", fingerprint });
    assert.equal((await loadLessons(cwd, ["auth/session.ts"]))[0]?.fact, "expiresAt equality is expired");
    await writeFile(join(cwd, "auth.test.ts"), "changed"); assert.deepEqual(await loadLessons(cwd, ["auth/session.ts"]), []);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("verified lessons enter the bounded task context", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-lessons-"));
  try {
    await writeFile(join(cwd, "auth.ts"), "export const auth = true"); const fingerprint = await sourceFingerprint(cwd, "auth.ts"); assert.ok(fingerprint);
    await saveLesson(cwd, { scope: ".", fact: "auth errors use AuthError", source: "auth.ts", fingerprint });
    const packet = await createContextPacket(cwd, { intent: "change auth.ts", acceptanceCriteria: [], constraints: [], explicitPaths: ["auth.ts"] });
    assert.match(formatContext(packet), /Verified repository lessons:[\s\S]*AuthError/);
    assert.ok(packet.evidence?.some((item) => item.id.startsWith("lesson:") && item.claims[0]?.authority === "cached"));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("lessons reject stale and out-of-repository evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-lessons-"));
  try { await assert.rejects(saveLesson(cwd, { scope: ".", fact: "unsafe", source: "../outside", fingerprint: "a".repeat(64) }), /outside/); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});
