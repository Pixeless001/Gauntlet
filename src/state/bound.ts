import type { TaskState } from "../core/task-state.js";

const RECENT_ACTIVITIES = 64, ACTIVITY_FACTS = 24, MAX_ACTIVITIES = 600, KEEP_ACTIVITIES = 300;

/** Per-tool-call history is what grows task state; keep full detail for a recent window (and failures, which loop detection needs) so long tasks stay under the size cap. */
export function boundState(state: TaskState): TaskState {
  if (state.activities.length > MAX_ACTIVITIES) dropOldestActivities(state, state.activities.length - KEEP_ACTIVITIES);
  const cutoff = state.activities.length - RECENT_ACTIVITIES;
  state.activities = state.activities.map((item, index) => index >= cutoff || item.outcome === "fail" ? item : { kind: item.kind, outputBytes: item.outputBytes, ...(item.outcome ? { outcome: item.outcome } : {}) });
  const stale = Object.keys(state.world.facts).filter((key) => key.startsWith("activity:")).slice(0, -ACTIVITY_FACTS);
  if (stale.length) { const facts = { ...state.world.facts }; for (const key of stale) delete facts[key]; state.world = { ...state.world, facts }; }
  return state;
}

// Activity indices are positions in `activities`, so every stored index moves with the drop.
function dropOldestActivities(state: TaskState, dropped: number) {
  const shift = (index: number) => Math.max(0, index - dropped), control = state.control;
  state.activities = state.activities.slice(dropped);
  control.lastCompactedActivity = shift(control.lastCompactedActivity);
  control.lifecycle = { ...control.lifecycle, lastStableEvent: shift(control.lifecycle.lastStableEvent) };
  control.observations = control.observations.map((item) => ({ ...item, lastObserved: shift(item.lastObserved) }));
  control.context = { ...control.context, recentCompletedTurns: control.context.recentCompletedTurns.filter((index) => index >= dropped).map((index) => index - dropped) };
}
