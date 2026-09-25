import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
async function fingerprint(cwd, paths) {
    const hash = createHash("sha256");
    for (const path of paths.sort()) {
        hash.update(path);
        try {
            hash.update(await readFile(join(cwd, path)));
        }
        catch {
            hash.update("missing");
        }
    }
    return hash.digest("hex");
}
export async function deriveFacts(cwd, profile) {
    const sourceFiles = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json"];
    const digest = await fingerprint(cwd, sourceFiles);
    const facts = [];
    if (profile.packageManager)
        facts.push({ key: "package-manager", value: profile.packageManager, proof: sourceFiles.filter((path) => path.includes(profile.packageManager) || path === "package.json"), fingerprint: digest });
    for (const command of profile.commands)
        facts.push({ key: `tool:${command.name}`, value: [command.command, ...command.args].join(" "), proof: ["package.json"], fingerprint: digest });
    return facts;
}
export function validFact(fact, currentFingerprint) { return fact.fingerprint === currentFingerprint; }
