import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../repo/process.js";

export interface AgentInvocation { cwd: string; prompt: string; model?: string | undefined; endpoint?: string | undefined; apiKeyEnv?: string | undefined; timeoutMs: number }
export interface AgentRun { exitCode: number | null; wallMs: number; stdoutTail: string; stderrTail: string; timedOut: boolean; tokensIn: number | null; tokensOut: number | null }
export interface AgentDriver {
  name: BenchmarkHarness;
  detect(): Promise<boolean>;
  listModels(options: { endpoint?: string | undefined; apiKeyEnv?: string | undefined }): Promise<string[]>;
  run(invocation: AgentInvocation): Promise<AgentRun>;
}

export type BenchmarkHarness = "codex" | "claude-code" | "opencode";

export function getDriver(harness: BenchmarkHarness): AgentDriver {
  const drivers: Record<BenchmarkHarness, AgentDriver> = { codex: codexDriver, "claude-code": claudeDriver, opencode: opencodeDriver };
  return drivers[harness];
}

export async function detectDrivers(): Promise<Record<BenchmarkHarness, boolean>> {
  const binaries: Record<BenchmarkHarness, string> = { codex: "codex", "claude-code": "claude", opencode: "opencode" };
  return Object.fromEntries(await Promise.all((Object.keys(binaries) as BenchmarkHarness[]).map(async (name) => {
    const probe = await run(binaries[name], ["--version"], process.cwd(), 15_000, 64_000);
    return [name, probe.exitCode === 0];
  }))) as Record<BenchmarkHarness, boolean>;
}

const codexDriver: AgentDriver = {
  name: "codex",
  async detect() { return (await run("codex", ["--version"], process.cwd(), 15_000, 64_000)).exitCode === 0; },
  async listModels({ endpoint, apiKeyEnv }) { return endpoint ? fetchOpenAiCompatibleModels(endpoint, apiKeyEnv) : []; },
  async run({ cwd, prompt, model, endpoint, apiKeyEnv, timeoutMs }) {
    const home = endpoint ? await scopedCodexHome(endpoint, apiKeyEnv) : null;
    try {
      const result = await run("codex", ["exec", "--json", "--skip-git-repo-check", "-s", "workspace-write", ...numericModel(model), prompt], cwd, timeoutMs, 4_000_000, home?.env);
      return { exitCode: result.exitCode, wallMs: result.durationMs, stdoutTail: result.stdout.slice(-8000), stderrTail: result.stderr.slice(-2000), timedOut: result.timedOut, ...scanTokenUsage(result.stdout) };
    } finally { if (home) await rm(home.dir, { recursive: true, force: true }); }
  },
};

const claudeDriver: AgentDriver = {
  name: "claude-code",
  async detect() { return (await run("claude", ["--version"], process.cwd(), 15_000, 64_000)).exitCode === 0; },
  async listModels({ endpoint, apiKeyEnv }) { return endpoint ? fetchOpenAiCompatibleModels(endpoint, apiKeyEnv) : []; },
  async run({ cwd, prompt, model, endpoint, apiKeyEnv, timeoutMs }) {
    const env: NodeJS.ProcessEnv = {};
    if (endpoint) { env.ANTHROPIC_BASE_URL = endpoint; env.ANTHROPIC_AUTH_TOKEN = apiKeyEnv ? process.env[apiKeyEnv] ?? "" : ""; }
    const result = await run("claude", ["-p", prompt, "--output-format", "json", ...numericModel(model)], cwd, timeoutMs, 4_000_000, env);
    return { exitCode: result.exitCode, wallMs: result.durationMs, stdoutTail: result.stdout.slice(-8000), stderrTail: result.stderr.slice(-2000), timedOut: result.timedOut, ...scanTokenUsage(result.stdout) };
  },
};

const opencodeDriver: AgentDriver = {
  name: "opencode",
  async detect() { return (await run("opencode", ["--version"], process.cwd(), 15_000, 64_000)).exitCode === 0; },
  async listModels() {
    const result = await run("opencode", ["models"], process.cwd(), 30_000, 256_000);
    return result.exitCode === 0 ? result.stdout.split("\n").map((line) => line.trim().split(/\s+/)[0]).filter((id): id is string => !!id) : [];
  },
  // Endpoint override is not wired for opencode: auth flows through its own `opencode auth login`.
  async run({ cwd, prompt, model, timeoutMs }) {
    const result = await run("opencode", ["run", ...numericModel(model), prompt], cwd, timeoutMs, 4_000_000);
    return { exitCode: result.exitCode, wallMs: result.durationMs, stdoutTail: result.stdout.slice(-8000), stderrTail: result.stderr.slice(-2000), timedOut: result.timedOut, ...scanTokenUsage(result.stdout) };
  },
};

function numericModel(model?: string): string[] { return model ? ["--model", model] : []; }

async function scopedCodexHome(endpoint: string, apiKeyEnv?: string): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), "gauntlet-codex-home-"));
  const config = ["model_provider = \"benchmark\"", "", "[model_providers.benchmark]", "name = \"benchmark\"", `base_url = "${endpoint}"`, "env_key = \"BENCHMARK_API_KEY\"", "wire_api = \"chat\"", ""].join("\n");
  await writeFile(join(dir, "config.toml"), config);
  return { dir, env: { CODEX_HOME: dir, BENCHMARK_API_KEY: apiKeyEnv ? process.env[apiKeyEnv] ?? "" : "" } };
}

async function fetchOpenAiCompatibleModels(endpoint: string, apiKeyEnv?: string): Promise<string[]> {
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/models`, { headers: apiKeyEnv && process.env[apiKeyEnv] ? { Authorization: `Bearer ${process.env[apiKeyEnv]}` } : {} });
    if (!response.ok) return [];
    const body = await response.json() as { data?: { id?: string }[] };
    return (body.data ?? []).map((entry) => entry.id).filter((id): id is string => !!id);
  } catch { return []; }
}

// Defensive usage scan over JSONL or single-JSON agent output; null when the agent reports nothing.
export function scanTokenUsage(output: string): { tokensIn: number | null; tokensOut: number | null } {
  const documents: unknown[] = [];
  const whole = tryParse(output.trim());
  if (whole !== null) documents.push(whole);
  else for (const line of output.split("\n")) { const parsed = tryParse(line); if (parsed !== null) documents.push(parsed); }
  let tokensIn: number | null = null, tokensOut: number | null = null;
  for (const document of documents) {
    const usage = findUsage(document);
    if (!usage) continue;
    const input = numberField(usage, ["input_tokens", "inputTokens", "prompt_tokens"]);
    const outputTokens = numberField(usage, ["output_tokens", "outputTokens", "completion_tokens"]);
    if (input !== null) tokensIn = (tokensIn ?? 0) + input;
    if (outputTokens !== null) tokensOut = (tokensOut ?? 0) + outputTokens;
  }
  return { tokensIn, tokensOut };
}

function tryParse(text: string): unknown { if (!text) return null; try { return JSON.parse(text); } catch { return null; } }

function findUsage(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["usage", "token_count"]) if (typeof record[key] === "object" && record[key] !== null) return record[key] as Record<string, unknown>;
  for (const child of Object.values(record)) { const found = findUsage(child, depth + 1); if (found) return found; }
  return null;
}

function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) { const value = record[key]; if (typeof value === "number") return value; }
  return null;
}
