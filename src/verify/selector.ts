import type { RepoProfile } from "../repo/detect.js";
import type { FileDelta } from "../core/task-state.js";
import type { VerificationPlan } from "./types.js";

export function selectVerification(profile: RepoProfile, changes: FileDelta[]): VerificationPlan {
  const checks = profile.commands.filter((tool) => tool.name !== "test").map((tool) => ({ id: tool.name, reason: `${tool.name} is declared by the repository`, command: tool.command, args: tool.args }));
  const test = profile.commands.find((tool) => tool.name === "test");
  if (test && changes.length) checks.push({ id: "repository-tests", reason: "Changed files require behavioral regression evidence; no runner-safe impacted-test filter was inferred", command: test.command, args: test.args });
  return { checks, rationale: checks.length ? ["Selected declared local checks from cheapest static evidence to behavioral evidence."] : ["No declared verification commands were detected."] };
}
