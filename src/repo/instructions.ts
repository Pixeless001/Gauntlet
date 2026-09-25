const changing = /\b(?:add|fix|implement|refactor|change|update|remove|strip|write|build|create|port|migrate|rename|make|complete|commit|push|ship)\w*\b/i;
const git = /\b(?:git|commit|push|branch|pull request|merge|stag)\w*/i;

/** Picks the sections of an instruction file that bear on this task instead of a blind prefix, so rules late in the file (git, commits) still arrive. */
export function selectInstructionSections(content: string, intent: string, limit = 2_000): string {
  const sections = content.split(/^(?=#{1,3} )/m).map(compact).filter(Boolean), terms = [...new Set(intent.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [])], editing = changing.test(intent);
  const ranked = sections.map((text, index) => ({ text, index, score: terms.filter((term) => text.toLowerCase().includes(term)).length + (editing && git.test(text.split("\n", 1)[0]!) ? 4 : 0) })).sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = new Map<number, string>(); let used = 0;
  for (const { text, index } of ranked) {
    const room = limit - used; if (room < 120) break;
    const part = (text.length <= room ? text : rulesOnly(text)).slice(0, room); chosen.set(index, part); used += part.length + 2;
  }
  return sections.flatMap((_, index) => chosen.get(index) ?? []).join("\n\n");
}

// A section that does not fit keeps its heading and imperative rule lines, which is where the enforceable statements are.
const rulesOnly = (section: string) => section.split("\n").filter((line, index) => index === 0 || /\b(?:never|do not|don't|must|always|only|avoid)\b/i.test(line)).join("\n");

// Drops blank lines and indented examples; the rules themselves are the bullets and prose.
const compact = (section: string) => section.split("\n").filter((line) => line.trim() && !/^(?: {4}|\t)/.test(line)).join("\n").trim();
