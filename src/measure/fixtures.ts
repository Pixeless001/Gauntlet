import type { SkillName } from "../core/skills.js";

export interface ArchitectureFixture {
  id: string;
  intent: string;
  acceptance: string[];
  preservation: string[];
  expectedSkills: SkillName[];
  forbiddenActivations: ("browser" | "delegation" | "external-docs" | "graph-expansion")[];
  maximumEscalation: 0 | 1 | 2 | 3 | 4 | 5;
  contextBudget: number;
  sufficientProof: string[];
  stopCondition: string;
}

/** Deterministic architecture cases. Repository-backed variants can supply files around the same contracts. */
export const ARCHITECTURE_FIXTURES: readonly ArchitectureFixture[] = [
  fixture("readme-typo", "Fix README typo", [], 1, ["diff"], "The requested text is corrected"),
  fixture("local-rename", "Rename a local variable", [], 1, ["static-check"], "References are consistently renamed"),
  fixture("obvious-diagnostic", "Fix the missing import reported by the compiler", ["implement"], 2, ["static-check"], "The targeted diagnostic is gone"),
  fixture("repeated-failure", "Investigate intermittent test failure", ["investigate"], 3, ["targeted-test"], "The cause is validated and the test passes"),
  fixture("local-package-api", "Fix package API usage using installed types", ["implement"], 3, ["installed-types", "targeted-test"], "Local authoritative API proof resolves the question"),
  fixture("failed-branch", "Fix race after rejecting a stale-cache approach", ["investigate"], 3, ["active-path", "targeted-test"], "Completion does not repeat the rejected direction"),
  fixture("public-api", "Change the public API exports", ["implement"], 4, ["public-surface", "affected-tests"], "Changed behavior and dependents are verified"),
  fixture("duplicate-helper", "Add retry behavior by reusing the existing repository helper", ["implement"], 3, ["capability-owner", "targeted-test"], "No duplicate primitive is introduced"),
  fixture("visual-feature", "Implement a responsive visual component", ["implement"], 4, ["browser", "affected-tests"], "Rendered behavior matches acceptance"),
  fixture("database-boundary", "Change database transaction behavior", ["implement"], 4, ["repository-rule", "integration-test"], "Transaction invariants are preserved"),
  fixture("authorization-boundary", "Fix authorization permission checks", ["implement"], 4, ["repository-rule", "negative-test"], "Unauthorized access remains denied"),
  fixture("performance", "Optimize request latency using a measured profile", ["optimize"], 4, ["benchmark", "regression-test"], "The measured objective improves without regression"),
  fixture("component-reuse", "Implement a component using the configured design system", ["implement"], 3, ["component-owner", "affected-tests"], "Existing primitives are reused"),
  fixture("unsupported-host", "Implement backend behavior without browser support", ["implement"], 3, ["targeted-test"], "Unavailable unrelated capabilities do not block completion"),
  fixture("complementary-proof", "Fix a request race using execution state and one affected test", ["investigate"], 3, ["active-path", "affected-test", "code-owner"], "The smallest complementary proof set resolves cause and behavior"),
  fixture("long-bug-revision", "Investigate a crash after one wrong implementation attempt", ["investigate"], 4, ["active-path", "targeted-test", "preservation-test"], "The revised active branch passes sufficient proof"),
];

function fixture(id: string, intent: string, expectedSkills: SkillName[], maximumEscalation: ArchitectureFixture["maximumEscalation"], sufficientProof: string[], stopCondition: string): ArchitectureFixture {
  const silence = expectedSkills.length === 0;
  return { id, intent, acceptance: [stopCondition], preservation: ["Existing relevant behavior remains intact"], expectedSkills, forbiddenActivations: silence ? ["browser", "delegation", "external-docs", "graph-expansion"] : [], maximumEscalation, contextBudget: silence ? 4 : 12, sufficientProof, stopCondition };
}
