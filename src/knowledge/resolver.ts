import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type KnowledgeSource = "repository_usage" | "installed_types" | "installed_source" | "package_metadata" | "cache" | "external_docs";
export interface KnowledgeFact { package: string; version: string; query: string; source: KnowledgeSource; evidence: string }
export interface KnowledgeProviders { repositoryUsage?: () => Promise<string | null>; externalDocs?: (name: string, version: string, query: string) => Promise<string | null>; cached?: (name: string, version: string, query: string) => Promise<string | null> }

export async function resolvePackageKnowledge(cwd: string, name: string, query: string, providers: KnowledgeProviders = {}): Promise<KnowledgeFact | null> {
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error("Invalid package name");
  const root = join(cwd, "node_modules", name), metadata = await json(join(root, "package.json"));
  const version = typeof metadata?.version === "string" ? metadata.version : "unknown";
  const usage = await providers.repositoryUsage?.(); if (usage) return { package: name, version, query, source: "repository_usage", evidence: usage };
  for (const [field, source] of [["types", "installed_types"], ["typings", "installed_types"], ["main", "installed_source"]] as const) {
    const path = metadata?.[field]; if (typeof path !== "string") continue;
    try { const content = await readFile(join(root, path), "utf8"); if (matches(content, query)) return { package: name, version, query, source, evidence: `${name}/${path}` }; } catch { /* unavailable local evidence */ }
  }
  if (metadata && matches(JSON.stringify(metadata), query)) return { package: name, version, query, source: "package_metadata", evidence: `${name}/package.json` };
  const cached = await providers.cached?.(name, version, query); if (cached) return { package: name, version, query, source: "cache", evidence: cached };
  const external = await providers.externalDocs?.(name, version, query); return external ? { package: name, version, query, source: "external_docs", evidence: external } : null;
}

function matches(content: string, query: string): boolean { return query.toLowerCase().split(/\W+/).filter(Boolean).every((term) => content.toLowerCase().includes(term)); }
async function json(path: string): Promise<Record<string, unknown> | null> { try { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; } catch { return null; } }
