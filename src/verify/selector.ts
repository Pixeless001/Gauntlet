import type { RepoProfile } from "../repo/detect.js";
import type { FileDelta } from "../core/task-state.js";
import type { VerificationPlan } from "./types.js";
import { relatedTestCandidates } from "../repo/context.js";
import type { StructuralIndex } from "../intelligence/index.js";
import { impact } from "../intelligence/working-graph.js";
import type { UncertaintyState } from "../control/uncertainty.js";
import { planActivation, type InterventionCandidate } from "../control/selector.js";
import type { InterventionBudget } from "../core/policy.js";

export function selectVerification(profile: RepoProfile, changes: FileDelta[], files: string[] = [], structural?: StructuralIndex, control?: { uncertainty: UncertaintyState; budget: InterventionBudget; event: number }): VerificationPlan {
  if (changes.length > 0 && changes.every((change) => /(?:\.md|\.txt|\.rst)$/i.test(change.path))) return selected({ checks: [{ id: "diff-check", reason: "Documentation-only changes require only a cheap patch integrity check", command: "git", args: ["diff", "--check"] }], rationale: ["Skipped build and behavioral suites for documentation-only changes."] }, control);
  const checks = profile.commands.filter((tool) => tool.name !== "test").map((tool) => ({ id: tool.name, reason: `${tool.name} is declared by the repository`, command: tool.command, args: tool.args }));
  const test = profile.commands.find((tool) => tool.name === "test");
  if (test && changes.length) {
    const changed = changes.map((item) => item.path), changedTests = changed.filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
    const sourceFiles = changed.filter((path) => /\.[cm]?[jt]sx?$/.test(path) && !changedTests.includes(path)), related = sourceFiles.map((path) => [...new Set([...(structural ? impact(structural, path).affectedTests : []), ...relatedTestCandidates([path], files)])]);
    const tests = [...new Set([...changedTests, ...related.flat()])], fullyCovered = sourceFiles.length > 0 && related.every((items) => items.length > 0);
    const broad = changed.some((path) => /(?:^|\/)(?:package\.json|tsconfig\.json|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(path));
    if (profile.testRunner && tests.length && !broad && (changedTests.length === changed.length || fullyCovered)) checks.push({ id: "impacted-tests", reason: `Selected ${tests.length} related test file${tests.length === 1 ? "" : "s"} using the ${profile.testRunner} runner`, command: test.command, args: [...test.args, ...(profile.packageManager === "npm" ? ["--"] : []), ...tests] });
    else checks.push({ id: "repository-tests", reason: "Changed files require behavioral regression proof; no safe impacted-test target was identified", command: test.command, args: test.args });
  }
  return selected({ checks, rationale: checks.length ? ["Selected declared local checks from cheapest static proof to behavioral proof."] : ["No declared verification commands were detected."] }, control);
}

export function verificationCandidates(plan: VerificationPlan): InterventionCandidate[] {
  return plan.checks.map((check) => {
    const behavioral = check.id.includes("test");
    return { id: `proof:${check.id}`, kind: "proof", uncertainty: behavioral ? "regression" : "scope", resolves: behavioral ? ["behavior", "regression"] : ["scope", "repoFit"], level: behavioral ? 2 : 1, cost: behavioral ? "medium" : "tiny", authority: "local", source: check.id, reason: check.reason, available: true };
  });
}

function selected(plan: VerificationPlan, control?: { uncertainty: UncertaintyState; budget: InterventionBudget; event: number }): VerificationPlan {
  if (!control || !plan.checks.length) return plan;
  const candidates = verificationCandidates(plan), activation = planActivation({ uncertainty: control.uncertainty, candidates, supplied: [], budget: control.budget, used: 0, event: control.event, trigger: "before_stop" }), ids = new Set(activation.proof.map((item) => item.id.replace(/^proof:/, "")));
  return { ...plan, checks: plan.checks.filter((check) => ids.has(check.id)), selectionTrace: activation.trace };
}
