import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
const valid = (value) => Boolean(value && typeof value === "object" && typeof value.scope === "string" && typeof value.fact === "string" && typeof value.source === "string" && /^[a-f0-9]{64}$/.test(value.fingerprint));
export async function sourceFingerprint(cwd, source) {
    const root = resolve(cwd), path = resolve(root, source), scoped = relative(root, path);
    if (!source || scoped.startsWith("..") || resolve(root) === path)
        return null;
    try {
        return createHash("sha256").update(await readFile(path)).digest("hex");
    }
    catch {
        return null;
    }
}
export async function loadLessons(cwd, paths = []) {
    let text;
    try {
        text = await readFile(join(cwd, ".gauntlet", "lessons.jsonl"), "utf8");
    }
    catch {
        return [];
    }
    const parsed = text.split("\n").filter(Boolean).flatMap((line) => { try {
        const value = JSON.parse(line);
        return valid(value) ? [value] : [];
    }
    catch {
        return [];
    } }).slice(-200);
    const relevant = paths.length ? parsed.filter((lesson) => paths.some((path) => path === lesson.source || path.startsWith(`${lesson.scope}/`) || lesson.source.startsWith(`${path}/`))) : parsed;
    const checked = await Promise.all(relevant.map(async (lesson) => await sourceFingerprint(cwd, lesson.source) === lesson.fingerprint ? lesson : null));
    return checked.filter((lesson) => lesson !== null).slice(0, 20);
}
export async function saveLesson(cwd, lesson) {
    if (!valid(lesson) || lesson.fact.length > 500 || lesson.scope.length > 300 || lesson.source.length > 500)
        throw new Error("Invalid repository lesson");
    if (await sourceFingerprint(cwd, lesson.source) !== lesson.fingerprint)
        throw new Error("Lesson proof is stale or outside the repository");
    const directory = join(cwd, ".gauntlet"), path = join(directory, "lessons.jsonl"), lock = `${path}.lock`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await acquire(lock);
    try {
        const existing = await loadAll(path), lessons = [...existing.filter((item) => !(item.scope === lesson.scope && item.fact === lesson.fact)), lesson].slice(-200), temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, `${lessons.map((item) => JSON.stringify(item)).join("\n")}\n`, { mode: 0o600 });
        await rename(temporary, path);
    }
    finally {
        await rm(lock, { recursive: true, force: true });
    }
}
async function loadAll(path) {
    try {
        return (await readFile(path, "utf8")).split("\n").filter(Boolean).flatMap((line) => { try {
            const value = JSON.parse(line);
            return valid(value) ? [value] : [];
        }
        catch {
            return [];
        } });
    }
    catch {
        return [];
    }
}
async function acquire(lock) {
    for (let attempt = 0; attempt < 250; attempt++)
        try {
            await mkdir(lock);
            return;
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            try {
                if (Date.now() - (await stat(lock)).mtimeMs > 30_000)
                    await rm(lock, { recursive: true, force: true });
            }
            catch { /* released concurrently */ }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    throw new Error("Timed out acquiring repository lesson lock");
}
