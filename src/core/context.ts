import type { TaskContract } from "./events.js";
import { selectContext, type ContextPacket } from "../repo/context.js";
import type { ConventionFact } from "../repo/conventions.js";
import type { RepoIndex } from "../repo/index.js";
import { MAX_CONTEXT_TOKENS } from "./policy.js";

export async function createContextPacket(cwd: string, contract: TaskContract, conventions: ConventionFact[] = [], index?: RepoIndex): Promise<ContextPacket> {
  const packet = await selectContext(cwd, contract, /\b(?:readme|documentation|typo)\b/i.test(contract.intent) ? 4 : 12, conventions, index);
  let tokens = 0;
  packet.entries = packet.entries.filter((entry) => { const cost = Math.ceil((entry.path.length + entry.reason.length + 4) / 4); if (tokens + cost > MAX_CONTEXT_TOKENS) return false; tokens += cost; return true; });
  return packet;
}

export function formatContext(packet: ContextPacket): string {
  const entries = packet.entries.map((entry) => `- ${entry.path} — ${entry.reason}`).join("\n");
  const conventions = packet.conventions.map((fact) => `- ${fact.id}: ${fact.value}${fact.representatives[0] ? ` (${fact.representatives[0]})` : ""}`).join("\n");
  const instructions = packet.instructions.map((value) => `---\n${value}`).join("\n");
  const output = [`Relevant working set:`, entries || "- No high-confidence files identified.", conventions && "Repository conventions:", conventions, instructions && "Applicable repository instructions (deeper files take precedence):", instructions, packet.excluded ? `- ${packet.excluded} lower-ranked candidates omitted.` : ""].filter(Boolean).join("\n");
  return output.length <= MAX_CONTEXT_TOKENS * 4 ? output : `${output.slice(0, MAX_CONTEXT_TOKENS * 4 - 24)}\n- Context budget reached.`;
}
