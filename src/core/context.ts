import type { TaskContract } from "./events.js";
import { selectContext, type ContextPacket } from "../repo/context.js";
import type { ConventionFact } from "../repo/conventions.js";
import type { RepoIndex } from "../repo/index.js";
import { MAX_CONTEXT_TOKENS } from "./policy.js";
import { loadLessons } from "../repo/lessons.js";
import type { ActiveExecutionContext } from "../execution-state/reconstruct.js";

export async function createContextPacket(cwd: string, contract: TaskContract, conventions: ConventionFact[] = [], index?: RepoIndex, execution?: ActiveExecutionContext): Promise<ContextPacket> {
  const packet = await selectContext(cwd, contract, /\b(?:readme|documentation|typo)\b/i.test(contract.intent) ? 4 : 12, conventions, index);
  if (execution) packet.execution = execution;
  let tokens = 0;
  packet.entries = packet.entries.filter((entry) => { const cost = Math.ceil((entry.path.length + entry.reason.length + 4) / 4); if (tokens + cost > MAX_CONTEXT_TOKENS) return false; tokens += cost; return true; });
  packet.lessons = await loadLessons(cwd, packet.entries.map((entry) => entry.path));
  return packet;
}

export function formatContext(packet: ContextPacket): string {
  const entries = packet.entries.map((entry) => `- ${entry.path} — ${entry.reason}`).join("\n");
  const conventions = packet.conventions.map((fact) => `- ${fact.id}: ${fact.value}${fact.representatives[0] ? ` (${fact.representatives[0]})` : ""}`).join("\n");
  const instructions = packet.instructions.map((value) => `---\n${value}`).join("\n");
  const lessons = packet.lessons.map((lesson) => `- ${lesson.fact} (${lesson.source})`).join("\n");
  const execution = packet.execution, state = execution ? ["Execution state:", `- Current: ${execution.current || "task started"}`, ...execution.validatedState.map((value) => `- Validated: ${value}`), execution.open.length ? `- Open: ${execution.open.join(", ")}` : "", execution.rejectedWarning ? `- ${execution.rejectedWarning}` : "", execution.evidenceRefs.length ? `- Evidence: ${execution.evidenceRefs.join(", ")}` : ""].filter(Boolean).join("\n") : "";
  const output = [state, `Relevant working set:`, entries || "- No high-confidence files identified.", conventions && "Repository conventions:", conventions, lessons && "Verified repository lessons:", lessons, instructions && "Applicable repository instructions (deeper files take precedence):", instructions, packet.excluded ? `- ${packet.excluded} lower-ranked candidates omitted.` : ""].filter(Boolean).join("\n");
  return output.length <= MAX_CONTEXT_TOKENS * 4 ? output : `${output.slice(0, MAX_CONTEXT_TOKENS * 4 - 24)}\n- Context budget reached.`;
}
