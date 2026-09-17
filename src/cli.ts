#!/usr/bin/env node
import pc from "picocolors";
import { detectRepository } from "./repo/detect.js";
import { install, installationStatus, uninstall } from "./adapters/install.js";
import { harnessNameSchema } from "./adapters/types.js";
import { GauntletEngine } from "./core/engine.js";
import { formatSummary } from "./reporting/summary.js";
import { activitySchema } from "./core/events.js";
import { runAutoHook, runHook } from "./hooks/dispatch.js";
import { runBuiltInEvals, saveEvalRun } from "./measure/eval-runner.js";
import { HANDOFF_AUDIT, summarizeHandoffAudit } from "./measure/handoff-audit.js";

const [command = "help", ...args] = process.argv.slice(2), cwd = process.cwd();
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const harness = harnessNameSchema.parse(option("--harness") ?? "codex");

async function main() {
  if (command === "init" || command === "install") console.log(`${args.includes("--dry-run") ? "Would install" : "Installed"} ${harness}: ${await install(cwd, harness, args.includes("--dry-run"))}`);
  else if (command === "uninstall") console.log(`${args.includes("--dry-run") ? "Would remove" : "Removed"} ${await uninstall(cwd, harness, args.includes("--dry-run"))}`);
  else if (command === "doctor") console.log(JSON.stringify({ repository: await detectRepository(cwd), adapters: await installationStatus(cwd) }, null, 2));
  else if (command === "eval") { const results = runBuiltInEvals(); await saveEvalRun(cwd, results); console.log(JSON.stringify({ passed: results.every((item) => item.passed), cases: results }, null, 2)); if (results.some((item) => !item.passed)) process.exitCode = 1; }
  else if (command === "audit") { const summary = summarizeHandoffAudit(); console.log(JSON.stringify({ summary, items: HANDOFF_AUDIT }, null, 2)); if (args.includes("--strict") && !summary.releaseReady) process.exitCode = 1; }
  else if (command === "start") { const intent = args.join(" "); if (!intent) throw new Error("Usage: gauntlet start <task intent>"); const result = await new GauntletEngine(cwd).start(intent); if (result.clarification) console.log(`CLARIFICATION REQUIRED\n${result.clarification}\n`); console.log(result.injection); console.log(`\nTask: ${result.state.id}`); }
  else if (command === "activity") { const id = args[0], json = args[1]; if (!id || !json) throw new Error("Usage: gauntlet activity <task-id> '<json>'"); const result = await new GauntletEngine(cwd).activity(id, activitySchema.parse(JSON.parse(json))); if (result.continuation) console.log(JSON.stringify({ type: "compaction", continuation: result.continuation }, null, 2)); }
  else if (command === "finish") { const id = args[0]; if (!id) throw new Error("Usage: gauntlet finish <task-id>"); console.log(formatSummary(await new GauntletEngine(cwd).finish(id))); }
  else if (command === "hook") { if (args[0] === "auto") await runAutoHook(args[1]); else await runHook(harnessNameSchema.parse(args[0]), args[1]); }
  else console.log(`Gauntlet\n\nCommands:\n  init|install [--harness codex|claude-code|cursor] [--dry-run]\n  uninstall [--harness ...] [--dry-run]\n  doctor\n  eval\n  audit [--strict]\n  start <intent>\n  activity <task-id> '<json>'\n  finish <task-id>`);
}

main().catch((error: unknown) => { console.error(pc.red(error instanceof Error ? error.message : String(error))); process.exitCode = 1; });
