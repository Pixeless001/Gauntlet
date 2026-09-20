import type { TaskState } from "../core/task-state.js";
import type { RuntimeDirective, BoundaryDecision, ControlDecision, DecisionPressure } from "./types.js";
import { planActivation, type ActivationPlan, type InterventionCandidate } from "./selector.js";
import { unresolved } from "./uncertainty.js";

export interface ControlInput {
  trigger: "task_start" | "activity" | "file_write" | "failure" | "lifecycle" | "before_stop" | string;
  candidates: InterventionCandidate[];
  supplied?: string[];
  falseActivationCost?: number;
  missedActivationCost?: number;
  stateChange?: string[];
  proofGain?: string[];
}

export interface RuntimeControlResult { plan: ActivationPlan; boundary: BoundaryDecision; decision: ControlDecision; directive: RuntimeDirective }

export function controlRuntime(state: TaskState, input: ControlInput): RuntimeControlResult {
  const control = state.control, event = state.activities.length;
  const plan = planActivation({ uncertainty: control.uncertainty, candidates: input.candidates, supplied: input.supplied ?? [], budget: control.budget, used: control.interventionsUsed, event, trigger: input.trigger });
  const pressure: DecisionPressure = { uncertainty: { ...control.uncertainty }, falseActivationCost: input.falseActivationCost ?? 1, missedActivationCost: input.missedActivationCost ?? 1, budgetRemaining: Math.max(0, control.budget.interventions - control.interventionsUsed), context: contextPressure(state) };
  const boundary = boundaryDecision(state, input.trigger, pressure.context);
  const decision: ControlDecision = { event, trigger: input.trigger, candidates: plan.trace.candidates, rejected: plan.trace.rejected, ...(plan.trace.selected[0] ? { selected: plan.trace.selected[0] } : {}), pressure, stateChange: input.stateChange ?? [], proofGain: input.proofGain ?? [] };
  control.traces = [...control.traces, plan.trace].slice(-64);
  control.decisions = [...control.decisions, decision].slice(-64);
  control.context.pressure = pressure.context;
  control.lifecycle = { ...control.lifecycle, boundary: boundary.strength, pressure: boundary.pressure, ...(boundary.stable ? { lastStableEvent: event } : {}) };
  control.hysteresis.stableEvents = boundary.stable ? control.hysteresis.stableEvents + 1 : 0;
  control.hysteresis.repeatedSignals = plan.trace.selected[0] === control.hysteresis.lastAction ? control.hysteresis.repeatedSignals + 1 : 0;
  if (plan.trace.selected[0]) control.hysteresis.lastAction = plan.trace.selected[0]; else delete control.hysteresis.lastAction;
  const directive: RuntimeDirective = boundary.stable && (pressure.context === "rising" || pressure.context === "high") ? { action: "compact", reason: "Stable lifecycle boundary under measured context pressure", artifactRefs: control.context.artifactRefs.slice(-3) } : unresolved(control.uncertainty).length && !plan.trace.selected.length ? { action: "inspect", reason: "Material uncertainty remains without an admitted action" } : { action: "continue", reason: plan.trace.selected.length ? "Selected the cheapest sufficient action" : "No control action is required" };
  return { plan, boundary, decision, directive };
}

export function boundaryDecision(state: TaskState, trigger: string, pressure = contextPressure(state)): BoundaryDecision {
  const latest = state.control.execution.checkpoints.find((item) => item.id === state.control.execution.activeCheckpointId);
  const strength = latest?.status === "validated" && ["understanding", "investigation", "decision", "implementation", "verification"].includes(latest.kind) ? "strong" : ["cause_validated", "implementation_selected", "before_stop", "lifecycle"].includes(trigger) ? "medium" : "weak";
  const stable = strength === "strong" || strength === "medium" && state.control.hysteresis.stableEvents > 0;
  return { strength, pressure, stable, reasons: [latest ? `${latest.kind}:${latest.status}` : "no active checkpoint", trigger] };
}

function contextPressure(state: TaskState): DecisionPressure["context"] {
  const bytes = state.activities.slice(-20).reduce((sum, item) => sum + item.outputBytes, 0);
  if (!state.activities.length) return "unknown";
  if (bytes > 500_000) return "high";
  if (bytes > 100_000 || state.control.repeatReadsDetected > 4 || state.control.repeatSearchesDetected > 2) return "rising";
  return "low";
}
