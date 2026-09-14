import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { HarnessName } from "../adapters/types.js";
import { GauntletEngine } from "../core/engine.js";
import { formatSummary } from "../reporting/summary.js";

type NativeEvent = Record<string, unknown>;

function taskId(input: NativeEvent): string {
  const candidate = input.session_id ?? input.conversation_id ?? process.env.GAUNTLET_TASK_ID ?? "session";
  return `native-${createHash("sha256").update(String(candidate)).digest("hex").slice(0, 24)}`;
}

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

function stopOutput(harness: HarnessName, input: NativeEvent, summary: string, verified: boolean): NativeEvent {
  const alreadyContinued = input.stop_hook_active === true || Number(input.loop_count ?? 0) > 0;
  if (!verified && !alreadyContinued) return harness === "cursor" ? { followup_message: `Gauntlet verification is incomplete. Address the failing targeted check, then finish again.\n\n${summary}` } : { decision: "block", reason: `Gauntlet verification is incomplete. Address the failing targeted check, then finish again.\n\n${summary}` };
  return harness === "cursor" ? {} : { systemMessage: summary };
}

export async function dispatchHook(harness: HarnessName, input: NativeEvent, nativeEvent?: string): Promise<NativeEvent> {
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd(), engine = new GauntletEngine(cwd), id = taskId(input), name = nativeEvent ?? eventName(input);
  const isStart = name === "UserPromptSubmit" || name === "beforeSubmitPrompt" || name === "sessionStart";
  if (isStart) {
    const intent = typeof input.prompt === "string" ? input.prompt : "Coding session";
    const result = await engine.start(intent, id);
    return startOutput(harness, name, id, result.injection, result.clarification);
  }
  if (name === "PostToolUse" || name === "postToolUse" || name === "PostToolUseFailure" || name === "postToolUseFailure") {
    if (!await existsTask(engine, id)) return {};
    const failed = name.toLowerCase().includes("failure");
    const activity = await engine.activity(id, { kind: "command", target: String(input.tool_name ?? input.command ?? "tool"), outcome: failed ? "fail" : "pass", outputBytes: JSON.stringify(input.tool_response ?? input.error_message ?? "").length });
    const additional = activity.continuation ? JSON.stringify(activity.continuation) : undefined;
    if (!additional) return {};
    return harness === "cursor" ? { additional_context: additional } : { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: additional } };
  }
  if (name === "Stop" || name === "stop") {
    if (!await existsTask(engine, id)) return {};
    const result = await engine.finish(id), summary = formatSummary(result, false);
    return stopOutput(harness, input, summary, result.verified);
  }
  return {};
}

export async function runHook(harness: HarnessName, nativeEvent?: string): Promise<void> { process.stdout.write(`${JSON.stringify(await dispatchHook(harness, await stdin(), nativeEvent))}\n`); }
