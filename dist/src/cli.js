#!/usr/bin/env node
import pc from "picocolors";
import { detectRepository } from "./repo/detect.js";
import { install, installationStatus, uninstall } from "./adapters/install.js";
import { harnessNameSchema } from "./adapters/types.js";
import { adapter } from "./adapters/install.js";
import { GauntletEngine } from "./core/engine.js";
import { formatSummary } from "./reporting/summary.js";
import { formatStats, latestBenchmark, loadHistory } from "./reporting/stats.js";
import { activitySchema } from "./core/events.js";
import { runAutoHook, runHook } from "./hooks/dispatch.js";
import { evalSuites, runEvalSuite, saveEvalRun } from "./measure/eval-runner.js";
import { runEvolution } from "./knowledge/evolution.js";
import { ARCHITECTURE_AUDIT, summarizeArchitectureAudit, validateAuditProof } from "./measure/architecture-audit.js";
import { ArtifactStore, parseArtifactHandle } from "./output/store.js";
import { detectDrivers, getDriver } from "./benchmark/agents.js";
import { runBenchmark } from "./benchmark/runner.js";
import { buildReport, formatReport, saveReport } from "./benchmark/report.js";
import { repositoryRoot } from "./repo/root.js";
const [command = "help", ...args] = process.argv.slice(2), cwd = repositoryRoot(process.cwd());
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const harness = harnessNameSchema.parse(option("--harness") ?? "codex");
async function main() {
    if (command === "init" || command === "install")
        console.log(`${args.includes("--dry-run") ? "Would install" : "Installed"} ${harness}: ${await install(cwd, harness, args.includes("--dry-run"))}`);
    else if (command === "uninstall")
        console.log(`${args.includes("--dry-run") ? "Would remove" : "Removed"} ${await uninstall(cwd, harness, args.includes("--dry-run"))}`);
    else if (command === "doctor") {
        const adapters = await installationStatus(cwd);
        console.log(JSON.stringify({ repository: await detectRepository(cwd), state: { root: ".gauntlet", persistence: "jsonl-checkpoint", engine: "native" }, engine: { name: "native", methods: ["runReady", "cancel", "checkpoint", "resume"], remoteDecisionService: false, langgraphRuntime: false }, adapters: Object.fromEntries(harnessNameSchema.options.map((name) => [name, { ...adapters[name], capabilities: adapter(name).capabilities }])) }, null, 2));
    }
    else if (command === "eval") {
        const requested = option("--suite");
        if (requested && !evalSuites.includes(requested))
            throw new Error(`Invalid evaluation suite: ${requested}`);
        const suites = requested ? [requested] : [...evalSuites], results = (await Promise.all(suites.map(runEvalSuite))).flat();
        await saveEvalRun(cwd, results);
        console.log(JSON.stringify({ passed: results.every((item) => item.passed), suites, cases: results }, null, 2));
        if (results.some((item) => !item.passed))
            process.exitCode = 1;
    }
    else if (command === "evolve")
        console.log(JSON.stringify(await runEvolution(cwd, args.includes("--dry-run")), null, 2));
    else if (command === "audit") {
        const summary = summarizeArchitectureAudit(), proofIssues = await validateAuditProof(cwd);
        console.log(JSON.stringify({ summary, proofIssues, items: ARCHITECTURE_AUDIT }, null, 2));
        if (args.includes("--strict") && (!summary.releaseReady || proofIssues.length))
            process.exitCode = 1;
    }
    else if (command === "artifact") {
        const taskId = args[0], handle = args[1];
        if (!taskId || !handle)
            throw new Error("Usage: gauntlet artifact <task-id> <handle> [--detail reference|concise|detailed|raw] [--lines start:end]");
        if (parseArtifactHandle(handle).taskId !== taskId)
            throw new Error("Artifact handle does not belong to the requested task");
        const detail = option("--detail") ?? "concise";
        if (!["reference", "concise", "detailed", "raw"].includes(detail))
            throw new Error("Invalid artifact detail");
        const range = option("--lines"), match = range?.match(/^(\d+):(\d+)$/);
        if (range && !match)
            throw new Error("Invalid artifact line range");
        console.log(await new ArtifactStore(cwd).read(handle, { detail: detail, ...(match ? { lines: { start: Number(match[1]), end: Number(match[2]) } } : {}) }));
    }
    else if (command === "start") {
        const intent = args.join(" ");
        if (!intent)
            throw new Error("Usage: gauntlet start <task intent>");
        const result = await new GauntletEngine(cwd).start(intent);
        if (result.clarification)
            console.log(`CLARIFICATION REQUIRED\n${result.clarification}\n`);
        console.log(result.injection);
        console.log(`\nTask: ${result.state.id}`);
    }
    else if (command === "activity") {
        const id = args[0], json = args[1];
        if (!id || !json)
            throw new Error("Usage: gauntlet activity <task-id> '<json>'");
        const result = await new GauntletEngine(cwd).activity(id, activitySchema.parse(JSON.parse(json)));
        if (result.continuation)
            console.log(JSON.stringify({ type: "compaction", continuation: result.continuation }, null, 2));
    }
    else if (command === "finish") {
        const id = args[0];
        if (!id)
            throw new Error("Usage: gauntlet finish <task-id>");
        console.log(formatSummary(await new GauntletEngine(cwd).finish(id)));
    }
    else if (command === "stats")
        console.log(formatStats(await loadHistory(cwd), await latestBenchmark(cwd)));
    else if (command === "hook") {
        if (args[0] === "auto")
            await runAutoHook(args[1]);
        else
            await runHook(harnessNameSchema.parse(args[0]), args[1]);
    }
    else if (command === "benchmark") {
        const benchmarkHarnesses = ["codex", "claude-code", "opencode"];
        const requestedHarness = option("--harness"), usage = `Usage: gauntlet benchmark --harness <codex|claude-code|opencode> --model <id> [--endpoint url] [--api-key-env VAR] [--task id] [--repeats N] [--timeout-ms ms]\n       gauntlet benchmark --list-drivers\n       gauntlet benchmark --list-models --harness <h> [--endpoint url] [--api-key-env VAR]`;
        if (args.includes("--list-drivers")) {
            console.log(JSON.stringify(await detectDrivers(), null, 2));
        }
        else if (args.includes("--list-models")) {
            if (!requestedHarness || !benchmarkHarnesses.includes(requestedHarness))
                throw new Error(usage);
            const models = await getDriver(requestedHarness).listModels({ endpoint: option("--endpoint"), apiKeyEnv: option("--api-key-env") });
            if (!models.length)
                throw new Error("No models reported. For codex/claude-code pass --endpoint (any OpenAI-compatible base URL); for opencode run `opencode auth login` first.");
            console.log(models.join("\n"));
        }
        else {
            if (!requestedHarness || !benchmarkHarnesses.includes(requestedHarness) || !option("--model"))
                throw new Error(usage);
            const tasks = args.filter((_, index) => index > 0 && args[index - 1] === "--task");
            const outcomes = await runBenchmark({ harness: requestedHarness, model: option("--model"), endpoint: option("--endpoint"), apiKeyEnv: option("--api-key-env"), tasks, repeats: Number(option("--repeats") ?? 1), timeoutMs: Number(option("--timeout-ms") ?? 600_000) });
            const report = buildReport(outcomes, { harness: requestedHarness, model: option("--model"), endpoint: option("--endpoint") });
            console.log(formatReport(report));
            console.log(`\nReport: ${await saveReport(cwd, report)}`);
            if (report.summary.treatment.acceptanceRate < report.summary.baseline.acceptanceRate)
                process.exitCode = 1;
        }
    }
    else
        console.log(`Gauntlet\n\nCommands:\n  init|install [--harness codex|claude-code|cursor|opencode] [--dry-run]\n  uninstall [--harness ...] [--dry-run]\n  doctor\n  eval [--suite ${evalSuites.join("|")}]\n  evolve [--dry-run]\n  audit [--strict]\n  artifact <task-id> <handle> [--detail ...] [--lines start:end]\n  start <intent>\n  activity <task-id> '<json>'\n  finish <task-id>\n  stats\n  benchmark --harness <codex|claude-code|opencode> --model <id> [--endpoint url] [--api-key-env VAR] [--task id] [--repeats N]\n  benchmark --list-drivers | --list-models --harness <h> [--endpoint url] [--api-key-env VAR]`);
}
main().catch((error) => { console.error(pc.red(error instanceof Error ? error.message : String(error))); process.exitCode = 1; });
