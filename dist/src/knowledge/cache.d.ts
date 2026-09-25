import type { KnowledgeFact } from "./resolver.js";
export declare class KnowledgeCache {
    private readonly path;
    constructor(cwd: string);
    get(name: string, version: string, query: string): Promise<KnowledgeFact | null>;
    put(fact: KnowledgeFact): Promise<void>;
    private load;
}
