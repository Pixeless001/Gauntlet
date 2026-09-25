export interface SearchObservation {
    query: string;
    scope: string;
    version: string;
    matches: string[];
}
export declare function normalizeSearch(command: string): {
    query: string;
    scope: string;
} | null;
export declare function repeatedSearch(observations: SearchObservation[], next: SearchObservation): boolean;
export declare function deduplicateInstructions(values: {
    source: "repository" | "convention" | "gauntlet";
    text: string;
}[]): string[];
