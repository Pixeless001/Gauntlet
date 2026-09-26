import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { walk } from "./tests.js";
import { findRelationships } from "./relationships.js";
import { selectInstructionSections } from "./instructions.js";
import { buildStructuralIndex } from "../intelligence/index.js";
import { workingGraph } from "../intelligence/working-graph.js";
import { selectMarginal } from "../context/marginality.js";
// Build output, IDE state and archived reference trees are never task context (and their nested
// AGENTS.md/CLAUDE.md are another project's rules) unless the task names a path inside them.
const GENERATED_ROOTS = new Set(["archive", "archive-refs", "build", "out", "target", ".gradle", ".idea", ".kotlin", ".venv", "venv", "__pycache__", "coverage", "vendor"]);
const isGenerated = (path) => GENERATED_ROOTS.has(path.split("/")[0] ?? "");
export async function selectContext(cwd, contract, limit = 12, conventions = [], index) {
    const all = index?.files ?? await walk(cwd);
    const named = (path) => contract.explicitPaths.some((item) => path.toLowerCase().includes(item.replaceAll("*", "").toLowerCase()));
    const files = all.filter((path) => !isGenerated(path) || named(path));
    const explicit = contract.explicitPaths.filter((path) => files.includes(path));
    const relationships = await findRelationships(cwd, explicit, files), related = new Map(relationships.map((item) => [item.path, item]));
    const structural = index && explicit.length ? await buildStructuralIndex(cwd, index, [...explicit, ...relationships.map((item) => item.path)], 80) : null;
    const graph = structural ? new Map(workingGraph(structural, explicit).map((item) => [item.path, item])) : new Map();
    const terms = contract.intent.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g)?.filter((term) => !["the", "and", "with", "from", "this", "that", "add", "fix"].includes(term)) ?? [];
    const scored = files.map((path) => {
        const lower = path.toLowerCase();
        let score = contract.explicitPaths.some((item) => lower.includes(item.replaceAll("*", "").toLowerCase())) ? 20 : 0;
        score += related.get(path)?.score ?? 0;
        score += graph.has(path) ? Math.max(4, 12 - graph.get(path).depth * 3) : 0;
        score += terms.filter((term) => lower.includes(term)).length * 3;
        if (/(?:test|spec)\.[cm]?[jt]sx?$/.test(path))
            score += 2;
        if (["package.json", "tsconfig.json", "cargo.toml", "pyproject.toml"].includes(basename(lower)))
            score += 1;
        return { path, score, reason: contract.explicitPaths.some((item) => lower.includes(item.replaceAll("*", "").toLowerCase())) ? "explicit task scope" : graph.get(path)?.reason ?? related.get(path)?.reason ?? (/test|spec/.test(lower) ? "related test candidate" : "task term match") };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    const marginal = selectMarginal(scored.map((entry) => ({ value: entry, cost: 1, contributions: contributions(entry) })), limit), selected = marginal.selected;
    const targets = [...contract.explicitPaths, ...selected.map((entry) => entry.path)];
    const instructionFiles = files.filter((path) => ["AGENTS.md", "CLAUDE.md"].includes(basename(path))).filter((path) => {
        const scope = dirname(path);
        return scope === "." || targets.some((target) => target === scope || target.startsWith(`${scope}/`));
    }).sort((a, b) => dirname(a).split("/").length - dirname(b).split("/").length || a.localeCompare(b));
    const instructions = [];
    for (const path of instructionFiles.slice(-4))
        instructions.push(`${path}: ${selectInstructionSections(await readFile(join(cwd, path), "utf8"), contract.intent)}`);
    return { entries: selected, instructions, conventions: conventions.slice(0, 3), lessons: [], excluded: marginal.rejected.length };
}
function contributions(entry) {
    if (entry.reason === "explicit task scope")
        return [`owner:${entry.path}`];
    if (entry.reason.startsWith("depends on") || entry.reason.startsWith("references"))
        return [`caller:${entry.path}`];
    if (entry.reason.startsWith("imported by"))
        return [`dependency:${entry.path}`];
    if (/test|spec/.test(entry.path))
        return [`acceptance:${entry.path}`];
    return [`proof:${entry.path}`];
}
export function relatedTestCandidates(changed, files) {
    const stems = changed.map((file) => basename(file, extname(file)).replace(/\.(?:test|spec)$/, ""));
    return files.filter((file) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(file) && stems.includes(basename(file, extname(file)).replace(/\.(?:test|spec)$/, "")));
}
