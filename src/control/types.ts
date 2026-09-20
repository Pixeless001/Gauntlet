import type { UncertaintyKind, UncertaintyState } from "./uncertainty.js";
import type { CostClass, ProofAuthority, RejectionReason } from "./selector.js";

export type TaskSize = "tiny" | "local" | "distributed" | "systemic";
export type BoundaryStrength = "weak" | "medium" | "strong";
export type ContextPressure = "unknown" | "low" | "rising" | "high";

export interface CandidateAction {
  id: string;
  action: string;
  uncertainty: UncertaintyKind;
  authority: ProofAuthority;
  cost: CostClass;
  scope: TaskSize;
  directness: number;
  reversible: boolean;
  available: boolean;
  contributions: string[];
}

export interface DecisionPressure {
  uncertainty: UncertaintyState;
  falseActivationCost: number;
  missedActivationCost: number;
  budgetRemaining: number;
  context: ContextPressure;
}

export interface ControlDecision {
  event: number;
  trigger: string;
  candidates: string[];
  rejected: { id: string; reason: RejectionReason }[];
  selected?: string;
  pressure: DecisionPressure;
  stateChange: string[];
  proofGain: string[];
}

export interface BoundaryDecision {
  strength: BoundaryStrength;
  pressure: ContextPressure;
  stable: boolean;
  reasons: string[];
}

export interface RuntimeDirective {
  action: "continue" | "inspect" | "clarify" | "plan" | "validate" | "compact" | "complete" | "incomplete";
  reason: string;
  target?: string;
  artifactRefs?: string[];
}
