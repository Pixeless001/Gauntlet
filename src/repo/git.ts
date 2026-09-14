import { run } from "./process.js";
import type { Baseline, FileDelta } from "../core/task-state.js";
import { detectDependencies } from "./detect.js";
import { captureTestSignatures, walk } from "./tests.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function git(cwd: string, args: string[]) { return run("git", args, cwd, 15_000); }

export async function captureBaseline(cwd: string): Promise<Baseline> {
  const paths = await walk(cwd);
  const [head, status, dependencies, files, tests] = await Promise.all([
    git(cwd, ["rev-parse", "HEAD"]), git(cwd, ["status", "--porcelain"]), detectDependencies(cwd), fingerprintFiles(cwd, paths), captureTestSignatures(cwd, paths),
  ]);
  return { head: head.exitCode === 0 ? head.stdout.trim() : null, status: status.stdout.trim().split("\n").filter(Boolean), dependencies, files, tests };
}

async function fingerprintFiles(cwd: string, paths: string[]) {
  const result: Baseline["files"] = {};
  await Promise.all(paths.map(async (path) => {
    try {
      const content = await readFile(join(cwd, path));
      const lines = content.byteLength <= 2_000_000 && !content.includes(0) ? content.toString("utf8").split("\n") : [];
      result[path] = { hash: createHash("sha256").update(content).digest("hex"), lineHashes: lines.map((line) => createHash("sha256").update(line).digest("base64url").slice(0, 12)) };
    } catch { /* file vanished */ }
  }));
  return result;
}

export async function changedFiles(cwd: string, baseline?: Baseline): Promise<FileDelta[]> {
  if (!baseline) {
    const [result, untracked] = await Promise.all([git(cwd, ["diff", "--numstat", "HEAD"]), git(cwd, ["ls-files", "--others", "--exclude-standard"])]);
    const files = result.stdout.trim().split("\n").filter(Boolean).map(parseNumstat);
    for (const path of untracked.stdout.trim().split("\n").filter(Boolean)) {
      const current = await fingerprintFiles(cwd, [path]); files.push(lineDelta(path, [], current[path]?.lineHashes ?? []));
    }
    return files;
  }
  const current = await fingerprintFiles(cwd, await walk(cwd));
  return [...new Set([...Object.keys(baseline.files), ...Object.keys(current)])].filter((path) => baseline.files[path]?.hash !== current[path]?.hash).sort().map((path) => lineDelta(path, baseline.files[path]?.lineHashes ?? [], current[path]?.lineHashes ?? []));
}

function parseNumstat(line: string): FileDelta { const [added = "0", removed = "0", path = ""] = line.split("\t"); return { path, added: Number(added) || 0, removed: Number(removed) || 0 }; }
function lineDelta(path: string, before: string[], after: string[]): FileDelta {
  let prefix = 0; while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0; while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return { path, added: Math.max(0, after.length - prefix - suffix), removed: Math.max(0, before.length - prefix - suffix) };
}
