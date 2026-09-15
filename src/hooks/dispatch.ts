import { readFile } from "node:fs/promises";
import type { HarnessName } from "../adapters/types.js";
import { adapter } from "../adapters/install.js";
import { GauntletEngine } from "../core/engine.js";
import { formatSummary } from "../reporting/summary.js";
import { correctionPacket } from "../verify/correction.js";

type NativeEvent = Record<string, unknown>;

function eventName(input: NativeEvent): string { return String(input.hook_event_name ?? process.env.CURSOR_HOOK_EVENT ?? ""); }

async function stdin(): Promise<NativeEvent> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) as NativeEvent : {};
}

async function existsTask(engine: GauntletEngine, id: string): Promise<boolean> {
  try { await readFile(`${engine.cwd}/.gauntlet/tasks/${id}.json`); return true; } catch { return false; }
}

function startOutput(harness: HarnessName, name: string, id: string, injection: string, clarification: string | null): NativeEvent {
  const context = clarification ? `Clarification required before costly implementation: ${clarification}\n\n${injection}` : injection;
  if (harness === "cursor") return name === "sessionStart" ? { env: { GAUNTLET_TASK_ID: id }, additional_context: context } : { continue: true };
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } };
}

function stopOutput(harness: HarnessName, summary: string, acceptable: boolean, alreadyContinued: boolean): NativeEvent {
  if (!acceptable && !alreadyContinued) return harness === "cursor" ? { followup_message: `Gauntlet completion is not clean and verified. Address the findings or failing check, then finish again.\n\n${summary}` } : { decision: "block", reason: `Gauntlet completion is not clean and verified. Address the findings or failing check, then finish again.\n\n${summary}` };
  return harness === "cursor" ? {} : { systemMessage: summary };
}

export async function dispatchHook(harness: HarnessName, input: NativeEvent, nativeEvent?: string): Promise<NativeEvent> {
  const name = nativeEvent ?? eventName(input), event = adapter(harness).translate(input, name), engine = new GauntletEngine(event.repository), id = event.taskId;
  if (event.type === "task_start") {
    const result = await engine.start(event.intent, id);
    return startOutput(harness, name, id, result.injection, result.clarification);
  }
  if (event.type === "task_activity") {
    if (!await existsTask(engine, id)) return {};
    const activity = await engine.activity(id, event.activity);
    const additional = activity.continuation ? JSON.stringify(activity.continuation) : undefined;
    if (!additional) return {};
    return harness === "cursor" ? { additional_context: additional } : { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: additional } };
  }
  if (event.type === "before_stop") {
    if (!await existsTask(engine, id)) return {};
    const result = await engine.finish(id), state = await engine.state(id), correction = correctionPacket(state.findings, state.workingSet), summary = [formatSummary(result, false), correction ? `\nCorrection:\n${JSON.stringify(correction)}` : ""].join(""), acceptable = result.clean && result.verified;
    const alreadyContinued = result.attempts > 1;
    if (!acceptable && !alreadyContinued) await engine.retry(id);
    return stopOutput(harness, summary, acceptable, alreadyContinued);
  }
  return {};
}

export async function runHook(harness: HarnessName, nativeEvent?: string): Promise<void> { process.stdout.write(`${JSON.stringify(await dispatchHook(harness, await stdin(), nativeEvent))}\n`); }

export function harnessForEvent(name: string): HarnessName { return /^[a-z]/.test(name) ? "cursor" : "claude-code"; }
export async function runAutoHook(nativeEvent?: string): Promise<void> {
  const input = await stdin(), name = nativeEvent ?? eventName(input);
  process.stdout.write(`${JSON.stringify(await dispatchHook(harnessForEvent(name), input, name))}\n`);
}
