import { createHash, randomUUID } from "node:crypto";
import { relative } from "node:path";
import { eventSchema, type GauntletEvent } from "../core/events.js";
import type { HarnessCapabilities } from "./types.js";

export const hookCapabilities = (failure: boolean, replacement: HarnessCapabilities["output"]["replacement"]): HarnessCapabilities => ({
  skills: { supported: true, dynamicLoad: true }, lifecycle: { taskStart: true, toolActivity: true, failure, beforeStop: true },
  tools: { shell: true, mcp: false, browser: false }, delegation: { supported: false, callback: false, modelSelection: false },
  telemetry: { tokens: false, cost: false }, environment: { worktrees: false, sandbox: false },
  output: { replacement, preventsInitialContextCost: replacement === "general" || replacement === "mcp" }, compaction: { hooks: true },
});

type NativeEvent = Record<string, unknown>;

function record(value: unknown): NativeEvent { return value && typeof value === "object" ? value as NativeEvent : {}; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function activity(value: NativeEvent, repository: string, failed: boolean) {
  const name = String(value.tool_name ?? value.toolName ?? value.tool ?? value.name ?? "tool"), lower = name.toLowerCase();
  const input = { ...record(value.arguments), ...record(value.input), ...record(value.tool_input) };
  const rawPath = text(input.file_path) ?? text(input.filePath) ?? text(input.path) ?? text(input.notebook_path);
  const path = rawPath ? normalizePath(repository, rawPath) : undefined;
  const command = text(input.command) ?? text(value.command);
  const kind = /(?:read|view|cat|open_file)/.test(lower) ? "file_read" : /(?:edit|write|patch|notebook)/.test(lower) ? "file_write" : /(?:bash|shell|terminal|command|exec)/.test(lower) || command ? "command" : "message";
  const target = kind === "command" ? normalizeCommand(command ?? name) : path ?? name;
  const report = record(input.gauntlet_state ?? value.gauntlet_state);
  const output = JSON.stringify(value.tool_response ?? value.result ?? value.error_message ?? "");
  const processor = /test/.test(lower) ? "test" as const : /search|grep|find/.test(lower) ? "search" as const : /browser|screenshot/.test(lower) ? "browser" as const : /diff|patch/.test(lower) ? "diff" as const : /read|view|open_file/.test(lower) ? "code" as const : "log" as const;
  return { kind: Object.keys(report).length ? "decision_signal" as const : kind, target: target.slice(0, 500), outcome: failed ? "fail" as const : "pass" as const, outputBytes: Buffer.byteLength(output), toolPayload: { operation: name, target: target.slice(0, 1_000), input: JSON.stringify(input), output, status: failed ? "fail" as const : "pass" as const, paths: path ? [path] : [], symbols: [], processor }, ...(Object.keys(report).length ? { report } : {}) };
}

function normalizePath(repository: string, path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.startsWith("/")) return normalized.replace(/^\.\//, "");
  const scoped = relative(repository, path).replaceAll("\\", "/");
  return scoped.startsWith("../") ? normalized : scoped;
}

function normalizeCommand(command: string): string { return command.replace(/\s+/g, " ").trim(); }

function failedActivity(value: NativeEvent, name: string): boolean {
  const response = { ...record(value.result), ...record(value.tool_response) }, status = String(response.status ?? "").toLowerCase();
  return name.toLowerCase().includes("failure") || value.is_error === true || response.is_error === true || response.success === false || (typeof response.exit_code === "number" && response.exit_code !== 0) || ["error", "fail", "failed", "timeout"].includes(status);
}

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
    const failed = failedActivity(value, name);
    return eventSchema.parse({ ...base, type: "task_activity", activity: activity(value, base.repository, failed) });
  }
  if (["PreCompact", "preCompact"].includes(name)) return eventSchema.parse({ ...base, type: "lifecycle", phase: "pre_compact" });
  return eventSchema.parse({ ...base, type: "before_stop" });
}
