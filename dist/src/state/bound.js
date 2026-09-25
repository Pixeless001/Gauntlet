import { MAX_STATE_BYTES } from "../core/policy.js";
const MAX_ACTIVITIES = 600, KEEP_ACTIVITIES = 300, BUDGET = MAX_STATE_BYTES * 0.8;
// Each tier keeps less detail than the last; a later tier only applies if the state is still over budget.
const TIERS = [
    { recent: 64, failures: 24, activityFacts: 24, fileFacts: 48, findings: 60, decisions: 64, events: 128 },
    { recent: 32, failures: 12, activityFacts: 12, fileFacts: 24, findings: 30, decisions: 24, events: 64 },
    { recent: 12, failures: 4, activityFacts: 4, fileFacts: 8, findings: 10, decisions: 8, events: 24 },
];
/** Per-tool-call history is what grows task state; keep detail for a recent window and shed the rest in tiers, so no run of tool calls can reach the size cap. */
export function boundState(state) {
    if (state.activities.length > MAX_ACTIVITIES)
        dropOldestActivities(state, state.activities.length - KEEP_ACTIVITIES);
    for (const tier of TIERS) {
        limit(state, tier);
        if (persistedSize(state) <= BUDGET)
            break;
    }
    return state;
}
// The repo-sized baseline (files, tests, index) is stored in a sidecar, so it does not count against the task file.
const persistedSize = (state) => { const { files: _files, tests: _tests, index: _index, ...baseline } = state.baseline; return JSON.stringify({ ...state, baseline }).length; };
function limit(state, tier) {
    const cutoff = state.activities.length - tier.recent, failed = state.activities.flatMap((item, index) => index < cutoff && item.outcome === "fail" ? [index] : []), keep = new Set(failed.slice(-tier.failures));
    state.activities = state.activities.map((item, index) => index >= cutoff || keep.has(index) ? item : { kind: item.kind, outputBytes: item.outputBytes, ...(item.outcome ? { outcome: item.outcome } : {}) });
    const newest = (prefix, count) => new Set(Object.keys(state.world.facts).filter((key) => key.startsWith(prefix)).slice(-count));
    const [activity, file] = [newest("activity:", tier.activityFacts), newest("file:", tier.fileFacts)];
    const facts = Object.fromEntries(Object.entries(state.world.facts).filter(([key]) => !(key.startsWith("activity:") && !activity.has(key)) && !(key.startsWith("file:") && !file.has(key))));
    if (Object.keys(facts).length !== Object.keys(state.world.facts).length)
        state.world = { ...state.world, facts };
    state.findings = state.findings.slice(-tier.findings);
    state.control.decisions = state.control.decisions.slice(-tier.decisions);
    state.control.traces = state.control.traces.slice(-tier.decisions);
    state.control.execution.events = state.control.execution.events.slice(-tier.events);
}
// Activity indices are positions in `activities`, so every stored index moves with the drop.
function dropOldestActivities(state, dropped) {
    const shift = (index) => Math.max(0, index - dropped), control = state.control;
    state.activities = state.activities.slice(dropped);
    control.lastCompactedActivity = shift(control.lastCompactedActivity);
    control.lifecycle = { ...control.lifecycle, lastStableEvent: shift(control.lifecycle.lastStableEvent) };
    control.observations = control.observations.map((item) => ({ ...item, lastObserved: shift(item.lastObserved) }));
    control.context = { ...control.context, recentCompletedTurns: control.context.recentCompletedTurns.filter((index) => index >= dropped).map((index) => index - dropped) };
}
