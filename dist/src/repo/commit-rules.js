import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./process.js";
const negative = /^\s*(?:[-*]\s+|\d+\.\s+)?(?:never|do not|don't|must not)\b/i;
const quoted = /`([^`\n]{3,60})`|"([^"\n]{3,60})"/g;
/** Negative instructions about commits that name concrete terms, e.g. "Never add `X` to commits". */
export function commitRules(source, content) {
    return content.split("\n").filter((line) => negative.test(line) && /\bcommits?\b/i.test(line)).map((line) => ({ source, text: line.replace(/^\s*(?:[-*]\s+|\d+\.\s+)?/, "").trim(), terms: [...line.matchAll(quoted)].map((match) => (match[1] ?? match[2])) })).filter((rule) => rule.terms.length);
}
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Warns when task commits start a line with a term the repository's own instructions forbid in commits. */
export async function inspectCommitRules(cwd, head) {
    if (!head)
        return [];
    const rules = (await Promise.all(["AGENTS.md", "CLAUDE.md"].map(async (name) => commitRules(name, await readFile(join(cwd, name), "utf8").catch(() => ""))))).flat();
    if (!rules.length)
        return [];
    const log = await run("git", ["log", "--format=%h%x00%B%x01", `${head}..HEAD`], cwd, 15_000, 8_000_000);
    if (log.exitCode !== 0)
        return [];
    const commits = log.stdout.split("\x01").map((entry) => entry.trim().split("\0")).filter(([sha]) => sha);
    return rules.flatMap((rule) => {
        const violated = commits.filter(([, message = ""]) => rule.terms.some((term) => new RegExp(`^\\W*${escape(term)}`, "im").test(message))).map(([sha]) => sha);
        return violated.length ? [{ code: "convention-instruction", severity: "warning", blocking: false, message: `${rule.source}: "${rule.text.slice(0, 160)}" — not followed in ${violated.join(", ")}`, proof: violated }] : [];
    });
}
