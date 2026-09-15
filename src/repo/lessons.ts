import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface RepositoryLesson { scope: string; fact: string; source: string; fingerprint: string }
const valid = (value: unknown): value is RepositoryLesson => Boolean(value && typeof value === "object" && typeof (value as RepositoryLesson).scope === "string" && typeof (value as RepositoryLesson).fact === "string" && typeof (value as RepositoryLesson).source === "string" && /^[a-f0-9]{64}$/.test((value as RepositoryLesson).fingerprint));

export async function sourceFingerprint(cwd: string, source: string): Promise<string | null> {
  try { return createHash("sha256").update(await readFile(join(cwd, source))).digest("hex"); } catch { return null; }
}

export async function loadLessons(cwd: string, paths: string[] = []): Promise<RepositoryLesson[]> {
  let text: string; try { text = await readFile(join(cwd, ".gauntlet", "lessons.jsonl"), "utf8"); } catch { return []; }
  const parsed = text.split("\n").filter(Boolean).flatMap((line) => { try { const value: unknown = JSON.parse(line); return valid(value) ? [value] : []; } catch { return []; } }).slice(-200);
  const relevant = paths.length ? parsed.filter((lesson) => paths.some((path) => path === lesson.source || path.startsWith(`${lesson.scope}/`) || lesson.source.startsWith(`${path}/`))) : parsed;
  const checked = await Promise.all(relevant.map(async (lesson) => await sourceFingerprint(cwd, lesson.source) === lesson.fingerprint ? lesson : null));
  return checked.filter((lesson): lesson is RepositoryLesson => lesson !== null).slice(0, 20);
}

export async function saveLesson(cwd: string, lesson: RepositoryLesson): Promise<void> {
  if (!valid(lesson) || lesson.fact.length > 500 || lesson.scope.length > 300 || lesson.source.length > 500) throw new Error("Invalid repository lesson");
  const directory = join(cwd, ".gauntlet"), path = join(directory, "lessons.jsonl"), existing = await loadAll(path);
  const lessons = [...existing.filter((item) => !(item.scope === lesson.scope && item.fact === lesson.fact)), lesson].slice(-200), temporary = `${path}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(temporary, `${lessons.map((item) => JSON.stringify(item)).join("\n")}\n`, { mode: 0o600 }); await rename(temporary, path);
}

async function loadAll(path: string): Promise<RepositoryLesson[]> {
  try { return (await readFile(path, "utf8")).split("\n").filter(Boolean).flatMap((line) => { try { const value: unknown = JSON.parse(line); return valid(value) ? [value] : []; } catch { return []; } }); } catch { return []; }
}
