import type { TaskContract } from "../core/events.js";
import type { RepoProfile } from "../repo/detect.js";

export type Domain = "react" | "database" | "ui" | "web-discovery";
export interface DomainDecision { detected: Domain[]; active: Domain[] }

export function resolveDomains(profile: RepoProfile, contract: TaskContract): DomainDecision {
  const languages = profile.language.join(" ").toLowerCase(), intent = contract.intent.toLowerCase(), paths = contract.explicitPaths.join(" ").toLowerCase();
  const detected: Domain[] = [];
  if (/typescript|javascript/.test(languages)) detected.push("react", "ui");
  if (/sql|postgres/.test(languages) || /migration|schema|database/.test(paths)) detected.push("database");
  const active = detected.filter((domain) => domain === "react" ? /react|next|render|bundle|component/.test(intent) : domain === "ui" ? /ui|visual|layout|style|accessib|responsive/.test(intent) : /database|query|sql|migration|schema|transaction|permission/.test(intent));
  if (/seo|crawl|canonical|metadata|structured data/.test(intent)) active.push("web-discovery");
  return { detected: [...new Set(detected)], active: [...new Set(active)] };
}
