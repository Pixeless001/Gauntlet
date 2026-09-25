import { run } from "./process.js";
import { detectDependencies } from "./detect.js";
import { captureTestSignatures } from "./tests.js";
import { createRepoIndex, fingerprintFiles, parseStatus } from "./index.js";
import { walk } from "./tests.js";
async function git(cwd, args) { return run("git", args, cwd, 15_000, 8_000_000); }
export async function captureBaseline(cwd) {
    const index = await createRepoIndex(cwd);
    const [dependencies, tests] = await Promise.all([detectDependencies(cwd), captureTestSignatures(cwd, index.tests)]);
    return { head: index.head, status: index.dirty, dependencies, files: index.fingerprints, tests, index };
}
export async function changedFiles(cwd, baseline) {
    if (!baseline) {
        const [result, untracked] = await Promise.all([git(cwd, ["diff", "--numstat", "HEAD"]), git(cwd, ["ls-files", "--others", "--exclude-standard"])]);
        const files = result.stdout.trim().split("\n").filter(Boolean).map(parseNumstat);
        for (const path of untracked.stdout.trim().split("\n").filter(Boolean)) {
            const current = await fingerprintFiles(cwd, [path]);
            files.push(lineDelta(path, [], current[path]?.lineHashes ?? []));
        }
        return files;
    }
    if (baseline.index?.mode === "git" && baseline.head) {
        const [status, diff] = await Promise.all([git(cwd, ["status", "--porcelain=v1", "-z"]), git(cwd, ["diff", "--numstat", baseline.head])]);
        const currentPaths = parseStatus(status.stdout), ambiguous = new Set(Object.keys(baseline.files)), inspected = [...new Set([...currentPaths, ...ambiguous])];
        const deltas = new Map(diff.stdout.trim().split("\n").filter(Boolean).map((line) => { const value = parseNumstat(line); return [value.path, value]; }));
        const current = await fingerprintFiles(cwd, inspected);
        for (const path of inspected) {
            if (ambiguous.has(path)) {
                if (baseline.files[path]?.hash !== current[path]?.hash)
                    deltas.set(path, lineDelta(path, baseline.files[path]?.lineHashes ?? [], current[path]?.lineHashes ?? []));
                else
                    deltas.delete(path);
            }
            else if (!deltas.has(path))
                deltas.set(path, lineDelta(path, [], current[path]?.lineHashes ?? []));
        }
        return [...deltas.values()].sort((a, b) => a.path.localeCompare(b.path));
    }
    const currentPaths = await walk(cwd), current = await fingerprintFiles(cwd, currentPaths);
    return [...new Set([...Object.keys(baseline.files), ...Object.keys(current)])].filter((path) => baseline.files[path]?.hash !== current[path]?.hash).sort().map((path) => lineDelta(path, baseline.files[path]?.lineHashes ?? [], current[path]?.lineHashes ?? []));
}
export async function captureBinaryDiff(cwd, base) {
    if (!base)
        return null;
    const tracked = await git(cwd, ["diff", "--binary", base]);
    if (tracked.exitCode !== 0)
        return null;
    const untracked = await git(cwd, ["ls-files", "--others", "--exclude-standard"]);
    if (untracked.exitCode !== 0)
        return null;
    const additions = await Promise.all(untracked.stdout.trim().split("\n").filter((path) => path && !path.startsWith(".gauntlet/")).map(async (path) => {
        const result = await git(cwd, ["diff", "--no-index", "--binary", "--", "/dev/null", path]);
        return result.exitCode === 1 ? result.stdout : "";
    }));
    return `${tracked.stdout}${additions.join("")}`;
}
function parseNumstat(line) { const [added = "0", removed = "0", path = ""] = line.split("\t"); return { path, added: Number(added) || 0, removed: Number(removed) || 0 }; }
function lineDelta(path, before, after) {
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
        prefix++;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix])
        suffix++;
    return { path, added: Math.max(0, after.length - prefix - suffix), removed: Math.max(0, before.length - prefix - suffix) };
}
