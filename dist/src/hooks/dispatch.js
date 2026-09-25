import { readFile } from "node:fs/promises";
import { adapter } from "../adapters/install.js";
import { GauntletEngine } from "../core/engine.js";
import { formatSummary } from "../reporting/summary.js";
import { correctionPacket } from "../verify/correction.js";
import { ArtifactStore } from "../output/store.js";
function eventName(input) { return String(input.hook_event_name ?? process.env.CURSOR_HOOK_EVENT ?? ""); }
async function stdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8").trim();
    return text ? JSON.parse(text) : {};
}
async function existsTask(engine, id) {
    try {
        await readFile(`${engine.cwd}/.gauntlet/tasks/${id}.json`);
        return true;
    }
    catch {
        return false;
    }
}
function startOutput(harness, name, id, injection, clarification) {
    const context = clarification ? `Clarification required before costly implementation: ${clarification}\n\n${injection}` : injection;
    if (harness === "cursor")
        return name === "sessionStart" ? { env: { GAUNTLET_TASK_ID: id }, additional_context: context } : { continue: true };
    return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } };
}
function stopOutput(harness, summary, acceptable, alreadyContinued) {
    if (!acceptable && !alreadyContinued)
        return harness === "cursor" ? { followup_message: `Gauntlet completion is not clean and verified. Address the findings or failing check, then finish again.\n\n${summary}` } : { decision: "block", reason: `Gauntlet completion is not clean and verified. Address the findings or failing check, then finish again.\n\n${summary}` };
    return {};
}
function lifecycleOutput(harness, continuation) {
    const context = JSON.stringify(continuation);
    return harness === "cursor" ? { additional_context: context } : { hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: context } };
}
async function activityOutput(harness, name, repository, state) {
    const latest = state.state.activities.at(-1), context = state.continuation ? JSON.stringify(state.continuation) : undefined;
    if (!latest?.artifactRef)
        return context ? harness === "cursor" ? { additional_context: context } : { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } } : {};
    const store = new ArtifactStore(repository), metadata = await store.metadata(latest.artifactRef), conditioned = await store.read(latest.artifactRef, { detail: "concise" });
    if (harness === "claude-code")
        return { hookSpecificOutput: { hookEventName: name, updatedToolOutput: conditioned, ...(context ? { additionalContext: context } : {}) } };
    if (harness === "cursor" && /mcp/i.test(metadata.operation))
        return { updated_mcp_tool_output: conditioned, ...(context ? { additional_context: context } : {}) };
    return context || harness === "codex" ? { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: [conditioned, context].filter(Boolean).join("\n\n") } } : {};
}
export async function dispatchHook(harness, input, nativeEvent) {
    const name = nativeEvent ?? eventName(input), event = adapter(harness).translate(input, name), engine = new GauntletEngine(event.repository, { harness }), id = event.taskId;
    if (event.type === "task_start") {
        const result = await engine.start(event.intent, id);
        return startOutput(harness, name, id, result.injection, result.clarification);
    }
    if (event.type === "task_activity") {
        if (!await existsTask(engine, id))
            return {};
        const activity = await engine.activity(id, event.activity);
        return activityOutput(harness, name, event.repository, activity);
    }
    if (event.type === "lifecycle") {
        if (!await existsTask(engine, id))
            return {};
        return lifecycleOutput(harness, (await engine.lifecycle(id, event.phase)).continuation);
    }
    if (event.type === "before_stop") {
        if (!await existsTask(engine, id))
            return {};
        const result = await engine.finish(id), state = await engine.state(id), correction = correctionPacket(state.findings, state.workingSet), summary = [formatSummary(result, false), correction ? `\nCorrection:\n${JSON.stringify(correction)}` : ""].join(""), acceptable = result.completion === "complete" || result.files === 0;
        const alreadyContinued = result.attempts > 1;
        if (!acceptable && !alreadyContinued)
            await engine.retry(id);
        else
            await engine.close(id);
        const output = stopOutput(harness, summary, acceptable, alreadyContinued), advisory = state.findings.filter((finding) => !finding.blocking && finding.code.startsWith("convention-")).map((finding) => finding.message).slice(0, 3);
        return harness === "claude-code" && !output.decision && advisory.length ? { ...output, systemMessage: `Gauntlet advisory:\n- ${advisory.join("\n- ")}` } : output;
    }
    return {};
}
export async function runHook(harness, nativeEvent) { process.stdout.write(`${JSON.stringify(await dispatchHook(harness, await stdin(), nativeEvent))}\n`); }
export function harnessForEvent(name) { return /^[a-z]/.test(name) ? "cursor" : "claude-code"; }
export async function runAutoHook(nativeEvent) {
    const input = await stdin(), name = nativeEvent ?? eventName(input);
    process.stdout.write(`${JSON.stringify(await dispatchHook(harnessForEvent(name), input, name))}\n`);
}
