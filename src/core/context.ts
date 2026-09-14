import type { TaskContract } from "./events.js";
import { selectContext, type ContextPacket } from "../repo/context.js";
import type { ConventionFact } from "../repo/conventions.js";

export async function createContextPacket(cwd: string, contract: TaskContract, conventions: ConventionFact[] = []): Promise<ContextPacket> { return selectContext(cwd, contract, 12, conventions); }

export function formatContext(packet: ContextPacket): string {
  const entries = packet.entries.map((entry) => `- ${entry.path} — ${entry.reason}`).join("\n");
  const conventions = packet.conventions.map((fact) => `- ${fact.id}: ${fact.value}${fact.representatives[0] ? ` (${fact.representatives[0]})` : ""}`).join("\n");
  const instructions = packet.instructions.map((value) => `---\n${value}`).join("\n");
  return [`Relevant working set:`, entries || "- No high-confidence files identified.", conventions && "Repository conventions:", conventions, instructions && "Applicable repository instructions (deeper files take precedence):", instructions, packet.excluded ? `- ${packet.excluded} lower-ranked candidates omitted.` : ""].filter(Boolean).join("\n");
}
