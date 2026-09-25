import { readFile } from "node:fs/promises";
import { captureAddedLines } from "../repo/diff-text.js";
import { run } from "../repo/process.js";
// Deterministic structural slop signals over added lines only (handoff doctrine §139).
const NARRATIONAL = /^\s*\/\/\s*(?:this (?:function|method|class|variable|section)|now (?:we )?(?:call|create|add|set|loop|iterate|return|check|update|initialize|define|import)|simple(?:y)? (?:loop|helper|wrapper|util(?:ity)?)|helper (?:function|method) to|setter for|getter for|use (?:this|the following) (?:to|for)|step \d+)/i;
const AI_PHRASING = /^\s*(?:\/\/|\/\*|\*)?\s*(?:it'?s worth noting that|as an ai(?: language model)?|delve(?:s|d)? into|in order to (?:ensure|achieve)|seamlessly|leverag(?:e|ing|es) the (?:power|capabilities)|comprehensive(?:ly)? (?:solution|handling|approach)|robust (?:solution|implementation|handling) (?:for|of))/i;
const EMPTY_CATCH = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/;
const DECORATED_LOG = /console\.(?:log|error|warn|info)\([^)]*(?:✅|❌|🎉|🚀|⚡|✨|🔍|📌|✔|→)/;
const EXPORTED = /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)/gm;
const BRANCHES = /\b(?:if|else|for|while|case|catch)\b|&&|\|\||\?\?/g;
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/i;
const TEST_FILE = /(?:^|[/\\.])(?:test|spec)\.[cm]?[jt]sx?$|[/\\](?:tests?|__tests__)[/\\]/i;
export function analyzeSlopLines(path, lines) {
    if (!CODE_FILE.test(path))
        return [];
    const signals = [], code = lines.filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line));
    const commentLines = lines.length - code.length;
    if (commentLines >= 5 && lines.length >= 10 && commentLines / lines.length >= 0.4)
        signals.push({ code: "slop-comment-density", message: `Heavy comment density in added lines (${commentLines}/${lines.length}).`, proof: [path] });
    lines.forEach((line, index) => {
        if (NARRATIONAL.test(line) || AI_PHRASING.test(line)) {
            signals.push({ code: "slop-narrational-comment", message: "Added comment narrates the implementation instead of stating a constraint.", proof: [`${path}:${index + 1}`, line.trim().slice(0, 120)] });
            return;
        }
        if (DECORATED_LOG.test(line))
            signals.push({ code: "slop-decorated-log", message: "Added console logging decorated with emoji/visual noise.", proof: [`${path}:${index + 1}`] });
    });
    if (EMPTY_CATCH.test(code.join("\n")))
        signals.push({ code: "slop-empty-catch", message: "Added an empty catch block that swallows failures.", proof: [path] });
    return signals;
}
export async function inspectSlop(cwd, state, changes) {
    const base = state.baseline.head;
    return base ? inspectSlopForDiff(cwd, base, changes) : [];
}
export async function inspectSlopForDiff(cwd, base, changes) {
    const addedByFile = await captureAddedLines(cwd, base);
    const findings = [];
    const changed = new Map(changes.filter((change) => change.added > 0).map((change) => [change.path, change]));
    for (const [path, lines] of Object.entries(addedByFile)) {
        if (!changed.has(path))
            continue;
        findings.push(...analyzeSlopLines(path, lines).map((signal) => ({ code: signal.code, severity: "warning", blocking: false, message: signal.message, proof: signal.proof })));
        if (TEST_FILE.test(path))
            continue;
        findings.push(...await deadExports(cwd, path, lines));
        findings.push(...await complexitySpike(cwd, base, path));
    }
    return deduplicate(findings);
}
async function deadExports(cwd, path, lines) {
    const names = [...lines.join("\n").matchAll(EXPORTED)].map((match) => match[1]).filter((name) => !!name);
    const found = [];
    for (const name of names) {
        const grep = await run("git", ["grep", "-l", "-F", name, "--", "*.ts", "*.js", "*.tsx", "*.jsx"], cwd, 15_000, 1_000_000);
        const files = grep.stdout.trim().split("\n").filter(Boolean);
        if (files.length === 1 && files[0] === path)
            found.push({ code: "slop-dead-export", severity: "warning", blocking: false, message: `Newly exported symbol ${name} has no references outside its defining file.`, proof: [path, name] });
    }
    return found;
}
async function complexitySpike(cwd, base, path) {
    if (!CODE_FILE.test(path))
        return [];
    let before = "";
    try {
        before = (await run("git", ["show", `${base}:${path}`], cwd, 15_000, 4_000_000)).stdout;
    }
    catch {
        return [];
    }
    const after = await (async () => { try {
        return await readFile(`${cwd}/${path}`, "utf8");
    }
    catch {
        return "";
    } })();
    if (!after)
        return [];
    const count = (text) => (text.match(BRANCHES) ?? []).length;
    const [b, a] = [count(before), count(after)];
    if (b >= 8 && a >= b * 2 && a - b >= 15)
        return [{ code: "slop-complexity-spike", severity: "warning", blocking: false, message: `Branch-keyword count in ${path} grew from ${b} to ${a}.`, proof: [path, `${b}->${a}`] }];
    return [];
}
function deduplicate(findings) { const seen = new Set(); return findings.filter((finding) => { const key = `${finding.code}:${finding.proof.join(":")}`; if (seen.has(key))
    return false; seen.add(key); return true; }); }
