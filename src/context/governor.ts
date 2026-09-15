export interface SearchObservation { query: string; scope: string; version: string; matches: string[] }

export function normalizeSearch(command: string): { query: string; scope: string } | null {
  const match = command.match(/(?:^|\s)(?:rg|git\s+grep)\s+(?:-[^\s]+\s+)*(?:--\s+)?(["']?)([^"'\s]+)\1(?:\s+([^|;&]+))?/i);
  if (!match?.[2]) return null;
  return { query: match[2].toLowerCase(), scope: (match[3] ?? ".").trim().replace(/^\.\//, "") || "." };
}

export function repeatedSearch(observations: SearchObservation[], next: SearchObservation): boolean {
  return observations.some((item) => item.query === next.query && item.scope === next.scope && item.version === next.version);
}

export function deduplicateInstructions(values: { source: "repository" | "convention" | "gauntlet"; text: string }[]): string[] {
  const rank = { repository: 0, convention: 1, gauntlet: 2 }, concepts = new Set<string>();
  return [...values].sort((a, b) => rank[a.source] - rank[b.source]).filter((item) => {
    const concept = item.text.toLowerCase().replace(/\b(?:must|should|prefer|use|the|a|an|existing|project)\b/g, "").replace(/\W+/g, " ").trim();
    if ([...concepts].some((known) => known.includes(concept) || concept.includes(known))) return false;
    concepts.add(concept); return true;
  }).map((item) => item.text);
}
