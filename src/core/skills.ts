import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskContract } from "./events.js";
import type { TaskRisk } from "./risk.js";

export type SkillName = "understand" | "investigate" | "implement" | "verify" | "review" | "optimize";

export function routeSkills(contract: TaskContract, phase: "start" | "activity" | "before_stop", risk: TaskRisk, repeatedFailure = false): SkillName[] {
  if (phase === "before_stop") return risk === "elevated" ? ["review", "verify"] : ["verify"];
  if (repeatedFailure) return ["investigate"];
  if (/\b(?:optimi[sz]e|performance|latency|profil)\b/i.test(contract.intent)) return ["investigate", "optimize"];
  if (/\b(?:bug|failure|crash|race)\b/i.test(contract.intent)) return ["investigate"];
  if (/\b(?:appropriate|somehow|either|whether)\b/i.test(contract.intent) && !contract.acceptanceCriteria.length) return ["understand"];
  if (risk === "minimal") return [];
  return ["implement"];
}

export async function loadSkill(cwd: string, name: SkillName): Promise<string> {
  return readFile(join(cwd, "skills", name, "SKILL.md"), "utf8");
}
