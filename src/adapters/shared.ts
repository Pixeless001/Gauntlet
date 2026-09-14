import { createHash, randomUUID } from "node:crypto";
import { eventSchema, type GauntletEvent } from "../core/events.js";

type NativeEvent = Record<string, unknown>;

function taskId(input: NativeEvent, name: string): string {
  const candidate = input.session_id ?? input.conversation_id ?? process.env.GAUNTLET_TASK_ID;
  if (typeof candidate === "string" && /^native-[a-f0-9]{24}$/.test(candidate)) return candidate;
  if (candidate !== undefined) return `native-${createHash("sha256").update(String(candidate)).digest("hex").slice(0, 24)}`;
  if (name === "sessionStart") return `native-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  throw new Error("Native hook event is missing a stable session identifier");
}

export function translateNativeEvent(input: unknown, nativeEvents: string[], explicitName?: string): GauntletEvent {
  const value = input && typeof input === "object" ? input as NativeEvent : {};
  const name = explicitName ?? String(value.hook_event_name ?? process.env.CURSOR_HOOK_EVENT ?? "");
  if (!nativeEvents.includes(name)) throw new Error(`Unsupported native hook event: ${name || "<missing>"}`);
  const base = { version: 1 as const, taskId: taskId(value, name), repository: typeof value.cwd === "string" ? value.cwd : process.cwd(), timestamp: new Date().toISOString() };
  if (["UserPromptSubmit", "beforeSubmitPrompt", "sessionStart"].includes(name)) return eventSchema.parse({ ...base, type: "task_start", intent: typeof value.prompt === "string" ? value.prompt : "Coding session" });
  if (["PostToolUse", "postToolUse", "PostToolUseFailure", "postToolUseFailure"].includes(name)) {
    const failed = name.toLowerCase().includes("failure");
    return eventSchema.parse({ ...base, type: "task_activity", activity: { kind: "command", target: String(value.tool_name ?? value.command ?? "tool"), outcome: failed ? "fail" : "pass", outputBytes: JSON.stringify(value.tool_response ?? value.error_message ?? "").length } });
  }
  return eventSchema.parse({ ...base, type: "before_stop" });
}
