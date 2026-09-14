import type { RepoProfile } from "../repo/detect.js";
import type { FileDelta } from "../core/task-state.js";
import type { VerificationPlan } from "./types.js";
import { relatedTestCandidates } from "../repo/context.js";

export function selectVerification(profile: RepoProfile, changes: FileDelta[], files: string[] = []): VerificationPlan {
  const checks = profile.commands.filter((tool) => tool.name !== "test").map((tool) => ({ id: tool.name, reason: `${tool.name} is declared by the repository`, command: tool.command, args: tool.args }));
  const test = profile.commands.find((tool) => tool.name === "test");
  if (test && changes.length) {
    const changed = changes.map((item) => item.path), tests = [...new Set([...changed.filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path)), ...relatedTestCandidates(changed, files)])];
    const broad = changed.some((path) => /(?:^|\/)(?:package\.json|tsconfig\.json|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(path));
    if (profile.testRunner && tests.length && !broad) checks.push({ id: "impacted-tests", reason: `Selected ${tests.length} related test file${tests.length === 1 ? "" : "s"} using the ${profile.testRunner} runner`, command: test.command, args: [...test.args, ...(profile.packageManager ? ["--"] : []), ...tests] });
    else checks.push({ id: "repository-tests", reason: "Changed files require behavioral regression evidence; no safe impacted-test target was identified", command: test.command, args: test.args });
  }
  return { checks, rationale: checks.length ? ["Selected declared local checks from cheapest static evidence to behavioral evidence."] : ["No declared verification commands were detected."] };
}
