import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import type { RepoIndex } from "../repo/index.js";

export interface StructuralFile {
  path: string; hash?: string; packageRoot?: string; imports: string[]; exports: string[]; symbols: string[]; tests: string[];
  calls?: string[]; references?: string[]; extends?: string[]; implements?: string[];
}
export interface StructuralIndex { version: 1; head: string | null; files: Record<string, StructuralFile>; dependents: Record<string, string[]> }

export async function buildStructuralIndex(cwd: string, repository: RepoIndex, targets: string[] = repository.files, maxFiles = 200, maxBytes = 512_000): Promise<StructuralIndex> {
  const known = new Set(repository.files), files: Record<string, StructuralFile> = {}, dependents: Record<string, string[]> = {}; let bytes = 0;
  for (const path of [...new Set(targets)].filter((item) => known.has(item)).slice(0, maxFiles)) {
    let source: string; try { const size = (await stat(join(cwd, path))).size; if (size > 128_000 || bytes + size > maxBytes) continue; source = await readFile(join(cwd, path), "utf8"); bytes += size; } catch { continue; }
    const imports = [...source.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)].map((match) => resolveImport(path, match[1]!, known)).filter((item): item is string => Boolean(item));
    const exports = [...source.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:class|function|interface|type|const|let|var)?\s*([A-Za-z_$][\w$]*)?/g)].map((match) => match[1] ?? "default");
    const symbols = [...source.matchAll(/\b(?:class|function|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!);
    const calls = [...source.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]!).filter((name) => !["if", "for", "while", "switch", "catch", "function"].includes(name));
    const heritage = [...source.matchAll(/\b(?:class|interface)\s+[A-Za-z_$][\w$]*(?:\s+extends\s+([A-Za-z_$][\w$]*))?(?:\s+implements\s+([^\{]+))?/g)];
    const extended = heritage.map((match) => match[1]).filter((item): item is string => Boolean(item));
    const implemented = heritage.flatMap((match) => (match[2] ?? "").split(",").map((item) => item.trim()).filter((item) => /^[A-Za-z_$][\w$]*$/.test(item)));
    const references = [...source.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map((match) => match[0]).filter((name) => !symbols.includes(name));
    files[path] = { path, hash: createHash("sha256").update(source).digest("hex"), packageRoot: packageRoot(path, known), imports: [...new Set(imports)], exports: [...new Set(exports)], symbols: [...new Set(symbols)], tests: [], calls: [...new Set(calls)], references: [...new Set(references)].slice(0, 256), extends: [...new Set(extended)], implements: [...new Set(implemented)] };
    for (const imported of imports) dependents[imported] = [...new Set([...(dependents[imported] ?? []), path])];
  }
  for (const test of repository.tests) for (const target of Object.keys(files)) if (relatedTest(test, target)) files[target]!.tests.push(test);
  return { version: 1, head: repository.head, files, dependents };
}

export async function updateStructuralIndex(cwd: string, repository: RepoIndex, previous: StructuralIndex, changed: string[], maxFiles = 200, maxBytes = 512_000): Promise<StructuralIndex> {
  const live = new Set(repository.files), retained = Object.fromEntries(Object.entries(previous.files).filter(([path]) => live.has(path) && !changed.includes(path)));
  const fresh = await buildStructuralIndex(cwd, repository, changed, maxFiles, maxBytes), files = { ...retained, ...fresh.files }, dependents: Record<string, string[]> = {};
  for (const file of Object.values(files)) for (const imported of file.imports) dependents[imported] = [...new Set([...(dependents[imported] ?? []), file.path])];
  for (const file of Object.values(files)) file.tests = [];
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

function packageRoot(path: string, known: Set<string>): string {
  const parts = dirname(path).split("/").filter(Boolean);
  while (parts.length) {
    const root = parts.join("/");
    if (known.has(`${root}/package.json`) || known.has(`${root}/Cargo.toml`) || known.has(`${root}/pyproject.toml`)) return root;
    parts.pop();
  }
  return ".";
}
