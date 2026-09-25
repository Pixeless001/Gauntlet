import { conditionOutput } from "./conditioner.js";
export function processArtifact(payload, limit = 8_000) {
    if (payload.processor === "json")
        return boundedJson(payload.output, limit);
    if (payload.processor === "diff")
        return selectLines(payload.output, /^(?:diff |@@|[+-](?![+-]))/, limit);
    if (payload.processor === "search")
        return uniqueLines(payload.output, limit);
    if (payload.processor === "browser")
        return selectLines(payload.output, /(?:error|fail|console|network|button|link|heading|dialog)/i, limit);
    if (payload.processor === "code")
        return payload.output.slice(0, limit);
    return conditionOutput({ command: payload.operation, exitCode: payload.status === "pass" ? 0 : payload.status === "unavailable" ? null : 1, stdout: payload.output, stderr: "", durationMs: 0, timedOut: payload.status === "timeout" }, limit).summary;
}
function boundedJson(value, limit) {
    try {
        return JSON.stringify(JSON.parse(value), null, 2).slice(0, limit);
    }
    catch {
        return value.slice(0, limit);
    }
}
function uniqueLines(value, limit) {
    const seen = new Set(), selected = [];
    for (const line of value.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        selected.push(line);
    }
    return selected.join("\n").slice(0, limit);
}
function selectLines(value, important, limit) {
    const lines = value.split(/\r?\n/), indexes = lines.flatMap((line, index) => important.test(line) ? [index] : []);
    const selected = indexes.length ? lines.filter((_, index) => indexes.some((item) => Math.abs(item - index) <= 1)) : lines.slice(0, 80);
    return uniqueLines(selected.join("\n"), limit);
}
