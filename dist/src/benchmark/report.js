import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
export function buildReport(outcomes, meta) {
    const arms = ["baseline", "treatment"];
    const tasks = [...new Set(outcomes.map((outcome) => outcome.task))].sort().map((task) => {
        const forTask = (arm) => outcomes.filter((outcome) => outcome.task === task && outcome.arm === arm);
        const rates = (arm, key) => rate(forTask(arm).map((outcome) => outcome[key]));
        return {
            task,
            repeats: forTask("baseline").length,
            acceptance: { baseline: rates("baseline", "acceptance"), treatment: rates("treatment", "acceptance") },
            preservation: { baseline: rates("baseline", "preservation"), treatment: rates("treatment", "preservation") },
            slopFree: { baseline: rates("baseline", "slopFree"), treatment: rates("treatment", "slopFree") },
            slopCodes: { baseline: codes(forTask("baseline")), treatment: codes(forTask("treatment")) },
            medianWallMs: { baseline: median(forTask("baseline").map((outcome) => outcome.wallMs)), treatment: median(forTask("treatment").map((outcome) => outcome.wallMs)) },
            medianLocAdded: { baseline: median(forTask("baseline").map((outcome) => outcome.locAdded)), treatment: median(forTask("treatment").map((outcome) => outcome.locAdded)) },
        };
    });
    const summarize = (arm) => {
        const forArm = outcomes.filter((outcome) => outcome.arm === arm);
        const tokenRuns = forArm.filter((outcome) => outcome.tokensIn !== null || outcome.tokensOut !== null);
        return {
            arm, runs: forArm.length,
            acceptanceRate: rate(forArm.map((outcome) => outcome.acceptance)),
            preservationRate: rate(forArm.map((outcome) => outcome.preservation)),
            slopFreeRate: rate(forArm.map((outcome) => outcome.slopFree)),
            firstCleanPassRate: rate(forArm.map((outcome) => outcome.firstCleanPass)),
            medianWallMs: median(forArm.map((outcome) => outcome.wallMs)),
            medianLocAdded: median(forArm.map((outcome) => outcome.locAdded)),
            tokensReported: tokenRuns.length,
        };
    };
    return { generatedAt: new Date().toISOString(), ...meta, summary: { baseline: summarize("baseline"), treatment: summarize("treatment") }, tasks, outcomes };
}
export function formatReport(report) {
    const lines = [];
    lines.push(`Gauntlet A/B benchmark — ${report.generatedAt} — harness=${report.harness}${report.model ? ` model=${report.model}` : ""}`);
    lines.push("");
    for (const arm of ["baseline", "treatment"]) {
        const summary = report.summary[arm];
        lines.push(`${arm.padEnd(10)} acceptance ${(summary.acceptanceRate * 100).toFixed(0)}%  preservation ${(summary.preservationRate * 100).toFixed(0)}%  slop-free ${(summary.slopFreeRate * 100).toFixed(0)}%  first-clean ${(summary.firstCleanPassRate * 100).toFixed(0)}%  wall-median ${Math.round(summary.medianWallMs)}ms  loc-median ${summary.medianLocAdded}  tokens-reported ${summary.tokensReported}/${summary.runs}`);
    }
    lines.push("");
    for (const task of report.tasks) {
        const acceptanceMark = task.acceptance.treatment > task.acceptance.baseline ? "+" : task.acceptance.treatment < task.acceptance.baseline ? "-" : "=";
        const slopMark = task.slopFree.treatment > task.slopFree.baseline ? "+" : task.slopFree.treatment < task.slopFree.baseline ? "-" : "=";
        lines.push(`${task.task.padEnd(24)} acceptance ${acceptanceMark} (${task.acceptance.baseline}->${task.acceptance.treatment})  slop-free ${slopMark} (${task.slopFree.baseline}->${task.slopFree.treatment})  wall ${Math.round(task.medianWallMs.baseline)}->${Math.round(task.medianWallMs.treatment)}ms  loc ${task.medianLocAdded.baseline}->${task.medianLocAdded.treatment}`);
        if (task.slopCodes.treatment.length)
            lines.push(`  treatment slop: ${[...new Set(task.slopCodes.treatment)].join(", ")}`);
        if (task.slopCodes.baseline.length)
            lines.push(`  baseline slop: ${[...new Set(task.slopCodes.baseline)].join(", ")}`);
    }
    return lines.join("\n");
}
export async function saveReport(cwd, report) {
    const dir = join(cwd, ".gauntlet", "benchmark", report.generatedAt.replaceAll(":", "-"));
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "report.json");
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return path;
}
function rate(flags) { return flags.length ? flags.filter(Boolean).length / flags.length : 0; }
function codes(outcomes) { return outcomes.flatMap((outcome) => outcome.slopFindings.map((finding) => finding.code)); }
function median(values) { if (!values.length)
    return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0; }
