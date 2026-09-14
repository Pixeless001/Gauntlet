import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileFingerprint } from "../core/task-state.js";
import { run } from "./process.js";
import { walk } from "./tests.js";

export interface RepoIndex {
  mode: "git" | "filesystem";
  head: string | null;
  files: string[];
  tests: string[];
  configs: string[];
  dirty: string[];
  fingerprints: Record<string, FileFingerprint>;
}

const testPattern = /(?:test|spec)\.[cm]?[jt]sx?$/;
const configs = new Set(["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json", "pyproject.toml", "Cargo.toml", "Cargo.lock", "go.mod", "Gemfile"]);
const git = (cwd: string, args: string[]) => run("git", args, cwd, 15_000);
const fields = (value: string) => value.split("\0").filter(Boolean);
const external = (path: string) => path !== ".gauntlet" && !path.startsWith(".gauntlet/");

export async function fingerprintFiles(cwd: string, paths: string[]): Promise<Record<string, FileFingerprint>> {
  const result: Record<string, FileFingerprint> = {};
  await Promise.all(paths.map(async (path) => {
    try {
      const content = await readFile(join(cwd, path));
      const lines = content.byteLength <= 2_000_000 && !content.includes(0) ? content.toString("utf8").split("\n") : [];
      result[path] = { hash: createHash("sha256").update(content).digest("hex"), lineHashes: lines.map((line) => createHash("sha256").update(line).digest("base64url").slice(0, 12)) };
    } catch { /* file vanished */ }
  }));
  return result;
}

export function parseStatus(output: string): string[] {
  const entries = fields(output), paths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    if ((entry[0] === "R" || entry[0] === "C" || entry[1] === "R" || entry[1] === "C") && entries[index + 1]) paths.push(entries[++index]!);
  }
  return [...new Set(paths)].filter(external).sort();
}

export async function createRepoIndex(cwd: string): Promise<RepoIndex> {
  const head = await git(cwd, ["rev-parse", "HEAD"]);
  if (head.exitCode === 0) {
    const [tracked, untracked, status] = await Promise.all([
      git(cwd, ["ls-files", "-z"]),
      git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
      git(cwd, ["status", "--porcelain=v1", "-z"]),
    ]);
    const files = [...new Set([...fields(tracked.stdout), ...fields(untracked.stdout)])].filter(external).sort();
    const dirty = parseStatus(status.stdout);
    return classify({ mode: "git", head: head.stdout.trim(), files, dirty, fingerprints: await fingerprintFiles(cwd, dirty) });
  }
  const files = (await walk(cwd)).sort();
  return classify({ mode: "filesystem", head: null, files, dirty: files, fingerprints: await fingerprintFiles(cwd, files) });
}

function classify(index: Omit<RepoIndex, "tests" | "configs">): RepoIndex {
  return { ...index, tests: index.files.filter((path) => testPattern.test(path)), configs: index.files.filter((path) => configs.has(path) || configs.has(path.split("/").at(-1)!)) };
}
