import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeFact } from "./resolver.js";

interface CacheFile { version: 1; facts: KnowledgeFact[] }
export class KnowledgeCache {
  private readonly path: string;
  constructor(cwd: string) { this.path = join(cwd, ".gauntlet", "knowledge.json"); }
  async get(name: string, version: string, query: string): Promise<KnowledgeFact | null> { return (await this.load()).facts.find((item) => item.package === name && item.version === version && item.query === query) ?? null; }
  async put(fact: KnowledgeFact): Promise<void> {
    const current = await this.load(), facts = [fact, ...current.facts.filter((item) => !(item.package === fact.package && item.version === fact.version && item.query === fact.query))].slice(0, 128);
    await mkdir(join(this.path, ".."), { recursive: true, mode: 0o700 }); const temporary = `${this.path}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify({ version: 1, facts }), { mode: 0o600 }); await rename(temporary, this.path);
  }
  private async load(): Promise<CacheFile> { try { const parsed = JSON.parse(await readFile(this.path, "utf8")) as CacheFile; return parsed.version === 1 && Array.isArray(parsed.facts) ? parsed : { version: 1, facts: [] }; } catch { return { version: 1, facts: [] }; } }
}
