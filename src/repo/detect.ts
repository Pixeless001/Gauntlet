import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }

export interface ToolCommand { name: string; command: string; args: string[] }
export interface RepoProfile { packageManager: string | null; language: string[]; commands: ToolCommand[]; harnesses: string[] }

export async function detectDependencies(cwd: string): Promise<string[]> {
  try {
    const value = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    return [...new Set([...Object.keys(value.dependencies ?? {}), ...Object.keys(value.optionalDependencies ?? {})])].sort();
  } catch { return []; }
}

export async function detectRepository(cwd: string): Promise<RepoProfile> {
  const packageManager = await exists(join(cwd, "pnpm-lock.yaml")) ? "pnpm" : await exists(join(cwd, "yarn.lock")) ? "yarn" : await exists(join(cwd, "package-lock.json")) ? "npm" : await exists(join(cwd, "uv.lock")) ? "uv" : await exists(join(cwd, "poetry.lock")) ? "poetry" : await exists(join(cwd, "Cargo.lock")) ? "cargo" : null;
  const languages: string[] = [];
  if (await exists(join(cwd, "tsconfig.json"))) languages.push("typescript");
  if (await exists(join(cwd, "Cargo.toml"))) languages.push("rust");
  if (await exists(join(cwd, "pyproject.toml"))) languages.push("python");
  const harnesses = (await Promise.all([["claude-code", ".claude"], ["cursor", ".cursor"], ["codex", ".codex"]].map(async ([name, path]) => await exists(join(cwd, path!)) ? name! : null))).filter((x): x is string => Boolean(x));
  const commands: ToolCommand[] = [];
  if (packageManager) {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as { scripts?: Record<string, string> };
      for (const name of ["typecheck", "lint", "test"] as const) if (pkg.scripts?.[name]) commands.push({ name, command: packageManager, args: packageManager === "npm" ? ["run", name] : [name] });
    } catch { /* no manifest */ }
  }
  if (languages.includes("rust")) commands.push({ name: "typecheck", command: "cargo", args: ["check"] }, { name: "lint", command: "cargo", args: ["clippy", "--", "-D", "warnings"] }, { name: "test", command: "cargo", args: ["test"] });
  if (languages.includes("python")) {
    const pyproject = await readFile(join(cwd, "pyproject.toml"), "utf8");
    const python = packageManager === "uv" ? { command: "uv", prefix: ["run"] } : packageManager === "poetry" ? { command: "poetry", prefix: ["run"] } : { command: "python", prefix: ["-m"] };
    if (/\b(?:pyright|mypy)\b/.test(pyproject)) { const tool = /\bpyright\b/.test(pyproject) ? "pyright" : "mypy"; commands.push({ name: "typecheck", command: python.command, args: [...python.prefix, tool, "."] }); }
    if (/\bpytest\b/.test(pyproject)) commands.push({ name: "test", command: python.command, args: [...python.prefix, "pytest"] });
  }
  return { packageManager, language: languages, commands, harnesses };
}
