import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepoProfile } from "./detect.js";

export interface RepositoryFact { key: string; value: string; evidence: string[]; fingerprint: string }

async function fingerprint(cwd: string, paths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of paths.sort()) { hash.update(path); try { hash.update(await readFile(join(cwd, path))); } catch { hash.update("missing"); } }
  return hash.digest("hex");
}

export async function deriveFacts(cwd: string, profile: RepoProfile): Promise<RepositoryFact[]> {
  const sources = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json"];
  const digest = await fingerprint(cwd, sources);
  const facts: RepositoryFact[] = [];
  if (profile.packageManager) facts.push({ key: "package-manager", value: profile.packageManager, evidence: sources.filter((path) => path.includes(profile.packageManager!) || path === "package.json"), fingerprint: digest });
  for (const command of profile.commands) facts.push({ key: `tool:${command.name}`, value: [command.command, ...command.args].join(" "), evidence: ["package.json"], fingerprint: digest });
  return facts;
}

export function validFact(fact: RepositoryFact, currentFingerprint: string): boolean { return fact.fingerprint === currentFingerprint; }
