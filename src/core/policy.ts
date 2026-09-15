export interface InterventionBudget {
  interventions: number;
  compactions: number;
  expensiveChecks: number;
  skillInvocations: number;
  extraLlmCalls: 0;
}

export const DEFAULT_INTERVENTION_BUDGET: InterventionBudget = {
  interventions: 2,
  compactions: 1,
  expensiveChecks: 1,
  skillInvocations: 1,
  extraLlmCalls: 0,
};

export const MAX_AUTOMATIC_CORRECTIONS = 1;
export const MAX_STATE_BYTES = 256_000;
export const MAX_CONTEXT_TOKENS = 1_200;
