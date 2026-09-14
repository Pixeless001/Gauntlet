import type { TaskContract } from "./events.js";

export function extractContract(intent: string): TaskContract {
  const paths = intent.match(/(?:[\w.-]+\/)+[\w.*-]+(?:\.[\w*]+)?/g) ?? [];
  const criteria = intent.split(/\n/).map((line) => line.trim()).filter((line) => /^(?:[-*]|\d+[.)])\s+/.test(line)).map((line) => line.replace(/^(?:[-*]|\d+[.)])\s+/, ""));
  const constraints = criteria.filter((line) => /\b(?:must|should|do not|don't|without|preserve|avoid|only)\b/i.test(line));
  return { intent: intent.trim(), acceptanceCriteria: criteria, explicitPaths: [...new Set(paths)], constraints };
}

export interface Ambiguity { costly: boolean; question?: string; alternatives: string[] }
export function detectAmbiguity(contract: TaskContract): Ambiguity {
  const vague = /\b(?:appropriate|proper|best|somehow|as needed)\b/i.test(contract.intent);
  const alternatives = [...contract.intent.matchAll(/(?:either|whether)\s+([^\n.]+)/gi)].map((match) => match[1] ?? "");
  if (alternatives.length || (vague && !contract.acceptanceCriteria.length)) return { costly: true, question: `What observable behavior should determine completion for: “${contract.intent.slice(0, 120)}”?`, alternatives };
  return { costly: false, alternatives: [] };
}
