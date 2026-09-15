import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import type { RepoIndex } from "../repo/index.js";

export interface StructuralFile { path: string; imports: string[]; exports: string[]; symbols: string[]; tests: string[] }
export interface StructuralIndex { version: 1; head: string | null; files: Record<string, StructuralFile>; dependents: Record<string, string[]> }

export async function buildStructuralIndex(cwd: string, repository: RepoIndex, targets: string[] = repository.files, maxFiles = 200, maxBytes = 512_000): Promise<StructuralIndex> {
  const known = new Set(repository.files), files: Record<string, StructuralFile> = {}, dependents: Record<string, string[]> = {}; let bytes = 0;
  for (const path of [...new Set(targets)].filter((item) => known.has(item)).slice(0, maxFiles)) {
    let source: string; try { const size = (await stat(join(cwd, path))).size; if (size > 128_000 || bytes + size > maxBytes) continue; source = await readFile(join(cwd, path), "utf8"); bytes += size; } catch { continue; }
    const imports = [...source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)].map((match) => resolveImport(path, match[1]!, known)).filter((item): item is string => Boolean(item));
    const exports = [...source.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:class|function|interface|type|const|let|var)?\s*([A-Za-z_$][\w$]*)?/g)].map((match) => match[1] ?? "default");
    const symbols = [...source.matchAll(/\b(?:class|function|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!);
    files[path] = { path, imports: [...new Set(imports)], exports: [...new Set(exports)], symbols: [...new Set(symbols)], tests: [] };
    for (const imported of imports) dependents[imported] = [...new Set([...(dependents[imported] ?? []), path])];
  }
  for (const test of repository.tests) for (const target of Object.keys(files)) if (relatedTest(test, target)) files[target]!.tests.push(test);
  return { version: 1, head: repository.head, files, dependents };
}

function resolveImport(from: string, specifier: string, known: Set<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = normalize(join(dirname(from), specifier)).replaceAll("\\", "/").replace(/\.[cm]?js$/, "");
  return [base, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"].map((extension) => base + extension), ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${base}/index${extension}`)].find((item) => known.has(item)) ?? null;
}

function relatedTest(test: string, target: string): boolean {
  const stem = target.slice(0, -extname(target).length), name = stem.split("/").at(-1)!;
  return test.startsWith(`${stem}.test.`) || test.startsWith(`${stem}.spec.`) || test.includes(`/${name}.test.`) || test.includes(`/${name}.spec.`);
}
