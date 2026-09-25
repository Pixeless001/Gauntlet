import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding } from "../core/events.js";
import { run } from "./process.js";

const forbids = /\b(?:never|do not|don't|must not)\b[^.\n]*\b(?:co-authored-by|signed-off-by|generated with|attribution)\b/i;
const attribution = /^(?:co-authored-by|signed-off-by|claude-session):|generated with/im;

/** Flags task commits whose messages carry attribution the repository's own instructions forbid. */
export async function inspectCommitRules(cwd: string, head: string | null): Promise<Finding[]> {
  if (!head) return [];
  const instructions = (await Promise.all(["AGENTS.md", "CLAUDE.md"].map((name) => readFile(join(cwd, name), "utf8").catch(() => "")))).join("\n");
  if (!forbids.test(instructions)) return [];
  const log = await run("git", ["log", "--format=%h%x00%B%x01", `${head}..HEAD`], cwd, 15_000, 8_000_000);
  if (log.exitCode !== 0) return [];
  const offending = log.stdout.split("\x01").map((entry) => entry.trim().split("\0")).filter(([, message = ""]) => attribution.test(message)).map(([sha = ""]) => sha);
  return offending.length ? [{ code: "commit-attribution", severity: "error", blocking: true, message: "Commit messages carry attribution that repository instructions forbid; rewording them rewrites history, so ask before amending.", proof: offending }] : [];
}
