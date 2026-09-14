import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Finding } from "../core/events.js";
import type { FileDelta, TaskState } from "../core/task-state.js";
import { dependencyCapability, isSharedPrimitive, testPlacementConflict } from "../repo/conventions.js";
import { detectDependencies } from "../repo/detect.js";

const packageCapability = (name: string) => dependencyCapability(name);

export async function inspectConventionDrift(cwd: string, state: TaskState, changes: FileDelta[]): Promise<Finding[]> {
  const findings: Finding[] = [], strong = (state.conventions ?? []).filter((fact) => fact.strength === "strong");
  const added = (await detectDependencies(cwd)).filter((name) => !state.baseline.dependencies.includes(name));
  for (const name of added) {
    const capability = packageCapability(name), established = strong.find((fact) => fact.id === `primitive.${capability}` && fact.value !== name);
    if (capability && established) findings.push({ code: "convention-dependency-conflict", severity: "warning", message: `New ${capability} dependency ${name} conflicts with the established ${established.value} convention.`, evidence: [name, ...established.representatives.slice(0, 1)] });
  }
  for (const change of changes) {
    const placement = strong.find((fact) => testPlacementConflict(fact, change.path));
    if (placement && change.added > 0) findings.push({ code: "convention-test-placement", severity: "warning", message: "New test placement conflicts with the repository's colocated-test convention.", evidence: [change.path] });
    if (change.removed === 0 && isSharedPrimitive(change.path)) {
      const capability = strong.find((fact) => fact.category === "primitive" && fact.representatives.some((path) => path !== change.path && path.toLowerCase().split(/[/.\-_]/).some((token) => token.length > 3 && change.path.toLowerCase().includes(token))));
      if (capability) findings.push({ code: "convention-duplicate-primitive", severity: "warning", message: "A new shared helper overlaps an established local primitive; reuse it if possible.", evidence: [change.path, ...capability.representatives.slice(0, 1)] });
    }
    if (/(?:^|\/)(?:routes?|controllers?)\//.test(change.path)) {
      try { const content = await readFile(join(cwd, change.path), "utf8"); if (/from\s+["'][^"']*(?:db|database|prisma|sequelize)[^"']*["']/.test(content) && strong.some((fact) => fact.id === "architecture.db-access")) findings.push({ code: "convention-architecture-bypass", severity: "warning", message: "A route imports database infrastructure directly despite the repository-layer convention.", evidence: [change.path] }); } catch { /* deleted file */ }
    }
  }
  if (state.conventionMetrics) {
    state.conventionMetrics.dependencyConflicts += findings.filter((item) => item.code === "convention-dependency-conflict").length;
    state.conventionMetrics.duplicates += findings.filter((item) => item.code === "convention-duplicate-primitive").length;
    state.conventionMetrics.architectureBypasses += findings.filter((item) => item.code === "convention-architecture-bypass").length;
    state.conventionMetrics.interventions += findings.length;
  }
  return deduplicate(findings);
}

function deduplicate(findings: Finding[]) { const seen = new Set<string>(); return findings.filter((finding) => { const key = `${finding.code}:${finding.evidence.join(":")}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
