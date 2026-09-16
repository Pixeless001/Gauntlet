import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TaskContract } from "./events.js";
import type { TaskRisk } from "./risk.js";
import type { InterventionCandidate } from "../control/selector.js";

export type SkillName = "understand" | "investigate" | "implement" | "verify" | "review" | "optimize";

export function routeSkills(contract: TaskContract, phase: "start" | "activity" | "before_stop", risk: TaskRisk, repeatedFailure = false): SkillName[] {
  if (phase === "before_stop") return ["verify"];
  if (repeatedFailure) return ["investigate"];
  if (/\b(?:optimi[sz]e|performance|latency|profil)\b/i.test(contract.intent)) return ["optimize"];
  if (/\b(?:bug|failure|crash|race)\b/i.test(contract.intent)) return ["investigate"];
  if (/\b(?:appropriate|somehow|either|whether)\b/i.test(contract.intent) && !contract.acceptanceCriteria.length) return ["understand"];
  if (/\b(?:rename|typo|spelling|format(?:ting)?|mechanical)\b/i.test(contract.intent) && !contract.acceptanceCriteria.length) return [];
  if (risk === "minimal") return [];
  return ["implement"];
}

export function skillCandidates(contract: TaskContract, phase: "start" | "activity" | "before_stop", risk: TaskRisk, repeatedFailure = false): InterventionCandidate[] {
  return routeSkills(contract, phase, risk, repeatedFailure).map((skill) => ({
    id: `skill:${skill}`, kind: "skill", skill, uncertainty: skillUncertainty(skill), resolves: [skillUncertainty(skill)],
    level: 3, cost: "low", authority: "local", source: `skills/${skill}/SKILL.md`, available: true,
    reason: skillReason(skill),
  }));
}

function skillUncertainty(skill: SkillName): InterventionCandidate["uncertainty"] {
  const mapping: Record<SkillName, InterventionCandidate["uncertainty"]> = { understand: "intent", investigate: "cause", implement: "behavior", verify: "regression", review: "scope", optimize: "performance" };
  return mapping[skill];
}

function skillReason(skill: SkillName): string {
  return { understand: "Intent or acceptance remains unclear", investigate: "The cause remains uncertain", implement: "Behavioral work remains", verify: "Completion evidence remains", review: "Change scope needs review", optimize: "Measured performance work remains" }[skill];
}

export async function loadSkill(name: SkillName): Promise<string> {
  const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const roots = moduleRoot.endsWith(`${process.platform === "win32" ? "\\" : "/"}dist`) ? [join(moduleRoot, ".."), moduleRoot] : [moduleRoot];
  let failure: unknown;
  for (const root of roots) try { return await readFile(join(root, "skills", name, "SKILL.md"), "utf8"); } catch (error) { failure = error; }
  throw failure;
}
