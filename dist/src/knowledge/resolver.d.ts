export type KnowledgeSource = "repository_usage" | "installed_types" | "installed_source" | "package_metadata" | "local_docs" | "cache" | "external_docs";
export interface KnowledgeFact {
    package: string;
    version: string;
    query: string;
    source: KnowledgeSource;
    proof: string;
}
export interface KnowledgeProviders {
    repositoryUsage?: () => Promise<string | null>;
    externalDocs?: (name: string, version: string, query: string) => Promise<string | null>;
    cached?: (name: string, version: string, query: string) => Promise<string | null>;
}
export declare function resolvePackageKnowledge(cwd: string, name: string, query: string, providers?: KnowledgeProviders): Promise<KnowledgeFact | null>;
