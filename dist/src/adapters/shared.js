import { createHash, randomUUID } from "node:crypto";
import { relative } from "node:path";
import { eventSchema } from "../core/events.js";
import { repositoryRoot } from "../repo/root.js";
export const hookCapabilities = (failure, replacement) => ({
    skills: { supported: true, dynamicLoad: true }, lifecycle: { taskStart: true, toolActivity: true, failure, beforeStop: true },
    tools: { shell: true, mcp: false, browser: false }, delegation: { supported: false, callback: false, modelSelection: false },
    telemetry: { tokens: false, cost: false }, environment: { worktrees: false, sandbox: false },
    execution: { cancellation: false },
    output: { replacement, preventsInitialContextCost: replacement === "general" || replacement === "mcp" }, compaction: { hooks: true },
});
function record(value) { return value && typeof value === "object" ? value : {}; }
function text(value) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function activity(value, repository, failed) {
    const name = String(value.tool_name ?? value.toolName ?? value.tool ?? value.name ?? "tool"), lower = name.toLowerCase();
    const input = { ...record(value.arguments), ...record(value.input), ...record(value.tool_input), ...record(value.args) };
    const rawPath = text(input.file_path) ?? text(input.filePath) ?? text(input.path) ?? text(input.notebook_path);
    const path = rawPath ? normalizePath(repository, rawPath) : undefined;
    const command = text(input.command) ?? text(value.command);
    const kind = /(?:read|view|cat|open_file)/.test(lower) ? "file_read" : /(?:edit|write|patch|notebook)/.test(lower) ? "file_write" : /(?:bash|shell|terminal|command|exec)/.test(lower) || command ? "command" : "message";
    const target = kind === "command" ? normalizeCommand(command ?? name) : path ?? name;
    const report = record(input.gauntlet_state ?? value.gauntlet_state);
    const output = JSON.stringify(value.tool_response ?? value.result ?? value.error_message ?? "");
    const processor = /test/.test(lower) ? "test" : /search|grep|find/.test(lower) ? "search" : /browser|screenshot/.test(lower) ? "browser" : /diff|patch/.test(lower) ? "diff" : /read|view|open_file/.test(lower) ? "code" : "log";
    return { kind: Object.keys(report).length ? "decision_signal" : kind, target: target.slice(0, 500), outcome: failed ? "fail" : "pass", outputBytes: Buffer.byteLength(output), toolPayload: { operation: name, target: target.slice(0, 1_000), input: JSON.stringify(input), output, status: failed ? "fail" : "pass", paths: path ? [path] : [], symbols: [], processor }, ...(Object.keys(report).length ? { report } : {}) };
}
function normalizePath(repository, path) {
    const normalized = path.replaceAll("\\", "/");
    if (!normalized.startsWith("/"))
        return normalized.replace(/^\.\//, "");
    const scoped = relative(repository, path).replaceAll("\\", "/");
    return scoped.startsWith("../") ? normalized : scoped;
}
function normalizeCommand(command) { return command.replace(/\s+/g, " ").trim(); }
function failedActivity(value, name) {
    const response = { ...record(value.result), ...record(value.tool_response) }, status = String(response.status ?? "").toLowerCase();
    return name.toLowerCase().includes("failure") || value.is_error === true || response.is_error === true || response.success === false || (typeof response.exit_code === "number" && response.exit_code !== 0) || ["error", "fail", "failed", "timeout"].includes(status);
}
function taskId(input, name) {
    const candidate = input.session_id ?? input.sessionID ?? input.sessionId ?? input.conversation_id ?? process.env.GAUNTLET_TASK_ID;
    if (typeof candidate === "string" && /^native-[a-f0-9]{24}$/.test(candidate))
        return candidate;
    if (candidate !== undefined)
        return `native-${createHash("sha256").update(String(candidate)).digest("hex").slice(0, 24)}`;
    if (name === "sessionStart")
        return `native-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    throw new Error("Native hook event is missing a stable session identifier");
}
export function translateNativeEvent(input, nativeEvents, explicitName) {
    const value = input && typeof input === "object" ? input : {};
    const name = explicitName ?? String(value.hook_event_name ?? process.env.CURSOR_HOOK_EVENT ?? "");
    if (!nativeEvents.includes(name))
        throw new Error(`Unsupported native hook event: ${name || "<missing>"}`);
    const base = { version: 1, taskId: taskId(value, name), repository: repositoryRoot(typeof value.cwd === "string" ? value.cwd : process.cwd()), timestamp: new Date().toISOString() };
    if (["UserPromptSubmit", "beforeSubmitPrompt", "sessionStart", "session.created"].includes(name))
        return eventSchema.parse({ ...base, type: "task_start", intent: typeof value.prompt === "string" ? value.prompt : "Coding session" });
    if (["PostToolUse", "postToolUse", "PostToolUseFailure", "postToolUseFailure", "tool.execute.after", "tool.execute.error"].includes(name)) {
        const failed = failedActivity(value, name);
        return eventSchema.parse({ ...base, type: "task_activity", activity: activity(value, base.repository, failed) });
    }
    if (["PreCompact", "preCompact"].includes(name))
        return eventSchema.parse({ ...base, type: "lifecycle", phase: "pre_compact" });
    return eventSchema.parse({ ...base, type: "before_stop" });
}
