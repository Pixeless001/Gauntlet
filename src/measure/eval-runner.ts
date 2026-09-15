import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractContract } from "../core/intent.js";
import { assessRisk } from "../core/risk.js";
import { routeSkills } from "../core/skills.js";
import type { EvalResult } from "./evals.js";

const cases = [
  { id: "silence-readme", intent: "Fix README typo", expected: [] },
  { id: "ordinary-change", intent: "Rename a local variable", expected: ["implement"] },
  { id: "route-failure", intent: "Investigate intermittent crash", expected: ["investigate"] },
  { id: "route-performance", intent: "Optimize request latency", expected: ["optimize"] },
] as const;

export function runBuiltInEvals(): EvalResult[] {
  return cases.map((item) => {
    const started = performance.now(), contract = extractContract(item.intent), actual = routeSkills(contract, "start", assessRisk(contract).level), passed = actual.join() === item.expected.join();
    return { category: item.id.startsWith("silence") ? "overhead" : "routing", caseId: item.id, passed, durationMs: performance.now() - started, interventions: actual.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, evidence: [`expected: ${item.expected.join() || "none"}`, `actual: ${actual.join() || "none"}`] };
  });
}

export async function saveEvalRun(cwd: string, results: EvalResult[]): Promise<string> {
  const directory = join(cwd, ".gauntlet", "evals", "results"), name = `${new Date().toISOString().replaceAll(":", "-")}.json`, path = join(directory, name), temporary = `${path}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(temporary, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, path); return path;
}
