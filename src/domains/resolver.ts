import type { TaskContract } from "../core/events.js";
import type { RepoProfile } from "../repo/detect.js";

export type Domain = "react" | "database" | "ui" | "web-discovery";
export interface DomainDecision { detected: Domain[]; active: Domain[] }

export function resolveDomains(profile: RepoProfile, contract: TaskContract): DomainDecision {
  const dependencies = (profile.dependencies ?? []).join(" ").toLowerCase(), intent = contract.intent.toLowerCase(), paths = contract.explicitPaths.join(" ").toLowerCase();
  const detected: Domain[] = [];
  if (/(?:^|\s)(?:react|next)(?:\s|$)/.test(dependencies)) detected.push("react", "ui");
  if (/postgres|pg|supabase|prisma|typeorm|sequelize/.test(dependencies) || /migration|schema|database/.test(paths)) detected.push("database");
  const active = detected.filter((domain) => domain === "react" ? /react|next|render|bundle|component/.test(intent) : domain === "ui" ? /ui|visual|layout|style|accessib|responsive/.test(intent) : /database|query|sql|migration|schema|transaction|permission/.test(intent));
  if (/seo|crawl|canonical|metadata|structured data/.test(intent)) active.push("web-discovery");
  return { detected: [...new Set(detected)], active: [...new Set(active)] };
}
