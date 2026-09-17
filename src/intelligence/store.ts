import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { StructuralIndex } from "./index.js";

const MAX_INDEX_BYTES = 1_048_576;

export async function loadStructuralIndex(cwd: string, expectedHead?: string | null): Promise<StructuralIndex | null> {
  const path = indexPath(cwd);
  try {
    const content = await readFile(path, "utf8");
    if (Buffer.byteLength(content) > MAX_INDEX_BYTES) return null;
    const value = JSON.parse(content) as Partial<StructuralIndex> & { repository?: string };
    if (value.repository !== repositoryId(cwd) || value.version !== 1 || expectedHead !== undefined && value.head !== expectedHead || !value.files || typeof value.files !== "object" || !value.dependents || typeof value.dependents !== "object") return null;
    const { repository: _repository, ...index } = value;
    return await validFingerprints(cwd, index as StructuralIndex) ? index as StructuralIndex : null;
  } catch { return null; }
}

export async function saveStructuralIndex(cwd: string, index: StructuralIndex): Promise<boolean> {
  const directory = join(cwd, ".gauntlet", "index"), path = indexPath(cwd), temporary = `${path}.${process.pid}.tmp`, content = JSON.stringify({ ...index, repository: repositoryId(cwd) });
  if (Buffer.byteLength(content) > MAX_INDEX_BYTES) return false;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path); return true; }
  finally { await rm(temporary, { force: true }); }
}

function indexPath(cwd: string): string { return join(cwd, ".gauntlet", "index", "structural-v1.json"); }
function repositoryId(cwd: string): string { return createHash("sha256").update(resolve(cwd)).digest("hex"); }
async function validFingerprints(cwd: string, index: StructuralIndex): Promise<boolean> {
  const root = resolve(cwd);
  for (const file of Object.values(index.files)) {
    const path = resolve(root, file.path);
    if (path === root || !path.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`) || !file.hash) return false;
    try { if (createHash("sha256").update(await readFile(path)).digest("hex") !== file.hash) return false; }
    catch { return false; }
  }
  return true;
}
