import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StructuralIndex } from "./index.js";

const MAX_INDEX_BYTES = 1_048_576;

export async function loadStructuralIndex(cwd: string): Promise<StructuralIndex | null> {
  const path = indexPath(cwd);
  try {
    const content = await readFile(path, "utf8");
    if (Buffer.byteLength(content) > MAX_INDEX_BYTES) return null;
    const value = JSON.parse(content) as Partial<StructuralIndex>;
    if (value.version !== 1 || !value.files || typeof value.files !== "object" || !value.dependents || typeof value.dependents !== "object") return null;
    return value as StructuralIndex;
  } catch { return null; }
}

export async function saveStructuralIndex(cwd: string, index: StructuralIndex): Promise<boolean> {
  const directory = join(cwd, ".gauntlet", "index"), path = indexPath(cwd), temporary = `${path}.${process.pid}.tmp`, content = JSON.stringify(index);
  if (Buffer.byteLength(content) > MAX_INDEX_BYTES) return false;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path); return true; }
  finally { await rm(temporary, { force: true }); }
}

function indexPath(cwd: string): string { return join(cwd, ".gauntlet", "index", "structural-v1.json"); }
