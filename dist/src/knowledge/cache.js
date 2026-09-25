import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { migrateLegacyKeys } from "../state/v1-migration.js";
export class KnowledgeCache {
    path;
    constructor(cwd) { this.path = join(cwd, ".gauntlet", "knowledge.json"); }
    async get(name, version, query) { return (await this.load()).facts.find((item) => item.package === name && item.version === version && item.query === query) ?? null; }
    async put(fact) {
        const current = await this.load(), facts = [fact, ...current.facts.filter((item) => !(item.package === fact.package && item.version === fact.version && item.query === fact.query))].slice(0, 128);
        await mkdir(join(this.path, ".."), { recursive: true, mode: 0o700 });
        const temporary = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify({ version: 1, facts }), { mode: 0o600 });
        await rename(temporary, this.path);
    }
    async load() {
        try {
            const raw = JSON.parse(await readFile(this.path, "utf8")), parsed = migrateLegacyKeys(raw);
            if (parsed.version !== 1 || !Array.isArray(parsed.facts))
                return { version: 1, facts: [] };
            if (JSON.stringify(raw) !== JSON.stringify(parsed)) {
                await mkdir(join(this.path, ".."), { recursive: true, mode: 0o700 });
                const temporary = `${this.path}.${process.pid}.tmp`;
                await writeFile(temporary, JSON.stringify(parsed), { mode: 0o600 });
                await rename(temporary, this.path);
            }
            return parsed;
        }
        catch {
            return { version: 1, facts: [] };
        }
    }
}
