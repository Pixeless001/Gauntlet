import type { TaskContract } from "./events.js";

export interface ContractInspection { files?: string[]; dependencies?: string[] }

// Harness paste markers are transport wrapping, not part of the task: left in, they become the goal line.
const stripPasteMarkers = (text: string) => text.replace(/<\/?pasted_content[^>]*>/g, "");

export function extractContract(rawIntent: string, inspection: ContractInspection = {}): TaskContract {
  const intent = stripPasteMarkers(rawIntent);
  const paths = intent.match(/\b(?:[\w.-]+\/)*[\w*-]+\.[\w*]+\b/g) ?? [];
  const criteria = intent.split(/\n/).map((line) => line.trim()).filter((line) => /^(?:[-*]|\d+[.)])\s+/.test(line)).map((line) => line.replace(/^(?:[-*]|\d+[.)])\s+/, ""));
  const constraints = criteria.filter((line) => /\b(?:must|should|do not|don't|without|preserve|avoid|only)\b/i.test(line));
  const preservationRequirements = constraints.filter((line) => /\b(?:do not|don't|without|preserve|avoid)\b/i.test(line));
  const explicitPaths = [...new Set(paths)];
  const unknowns = materialUnknowns(intent, criteria);
  const requiredProof = criteria.filter((line) => /\b(?:test|typecheck|lint|build|verify|validation)\b/i.test(line));
  return {
    intent,
    goal: intent.trim().split("\n", 1)[0] || "Unspecified task",
    acceptanceCriteria: criteria,
    preservationRequirements,
    constraints,
    unknowns,
    explicitPaths,
    expectedFrontier: explicitPaths,
    requiredProof,
    size: taskSize(intent, explicitPaths, inspection),
  };
}

export interface Ambiguity { costly: boolean; question?: string; alternatives: string[] }
export function detectAmbiguity(contract: TaskContract): Ambiguity {
  const alternatives = [...contract.intent.matchAll(/(?:either|whether)\s+([^\n.]+)/gi)].map((match) => match[1] ?? "");
  if (contract.unknowns.length) return { costly: true, question: `What observable behavior should determine completion for: “${contract.goal.slice(0, 120)}”?`, alternatives };
  return { costly: false, alternatives: [] };
}

function materialUnknowns(intent: string, criteria: string[]): string[] {
  const alternatives = [...intent.matchAll(/(?:either|whether)\s+([^\n.]+)/gi)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
  const material = /\b(?:behavio(?:u)?r|output|response|public|api|security|auth|permission|data|schema|migration|cross-package|package boundary|repository-wide|distributed|systemic)\b/i.test(intent);
  if (alternatives.length && material) return alternatives;
  return material && /\b(?:appropriate|proper|best|somehow|as needed)\b/i.test(intent) && !criteria.length ? ["observable completion behavior"] : [];
}

function taskSize(intent: string, paths: string[], inspection: ContractInspection): TaskContract["size"] {
  if (/\b(?:repository-wide|architecture|migration|all packages|runtime policy|systemic)\b/i.test(intent)) return "systemic";
  const roots = new Set(paths.map((path) => path.split("/")[0]));
  if (roots.size > 1 || /\b(?:cross-package|multiple packages|distributed|integration)\b/i.test(intent)) return "distributed";
  if (paths.length <= 1 && /\b(?:typo|readme|comment|rename local|one-line)\b/i.test(intent) && (inspection.dependencies?.length ?? 0) >= 0) return "tiny";
  return "local";
}
