import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export function routeSkills(contract, phase, risk, repeatedFailure = false) {
    if (phase === "before_stop")
        return ["verify"];
    if (repeatedFailure)
        return ["investigate"];
    if (/\b(?:optimi[sz]e|performance|latency|profil)\b/i.test(contract.intent))
        return ["optimize"];
    if (/\b(?:bug|failure|crash|race)\b/i.test(contract.intent))
        return ["investigate"];
    if (/\b(?:appropriate|somehow|either|whether)\b/i.test(contract.intent) && !contract.acceptanceCriteria.length)
        return ["understand"];
    if (/\b(?:rename|typo|spelling|format(?:ting)?|mechanical)\b/i.test(contract.intent) && !contract.acceptanceCriteria.length)
        return [];
    if (risk === "minimal")
        return [];
    return ["implement"];
}
export function skillCandidates(contract, phase, risk, repeatedFailure = false) {
    return routeSkills(contract, phase, risk, repeatedFailure).map((skill) => ({
        id: `skill:${skill}`, kind: "skill", skill, uncertainty: skillUncertainty(skill), resolves: [skillUncertainty(skill)],
        level: 3, cost: "low", authority: "local", source: `skills/${skill}/SKILL.md`, available: true,
        reason: skillReason(skill),
    }));
}
function skillUncertainty(skill) {
    const mapping = { understand: "intent", investigate: "cause", implement: "behavior", verify: "regression", review: "scope", optimize: "performance" };
    return mapping[skill];
}
function skillReason(skill) {
    return { understand: "Intent or acceptance remains unclear", investigate: "The cause remains uncertain", implement: "Behavioral work remains", verify: "Completion proof remains", review: "Change scope needs review", optimize: "Measured performance work remains" }[skill];
}
export async function loadSkill(name) {
    const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const roots = moduleRoot.endsWith(`${process.platform === "win32" ? "\\" : "/"}dist`) ? [join(moduleRoot, ".."), moduleRoot] : [moduleRoot];
    let failure;
    for (const root of roots)
        try {
            return await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
        }
        catch (error) {
            failure = error;
        }
    throw failure;
}
