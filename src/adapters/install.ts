import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessAdapter, HarnessName } from "./types.js";
import { codexAdapter } from "./codex/index.js";
import { claudeCodeAdapter } from "./claude-code/index.js";
import { cursorAdapter } from "./cursor/index.js";
import { opencodeAdapter } from "./opencode/index.js";
import { opencodePluginSource } from "./opencode/plugin.js";

type JsonObject = Record<string, unknown>;
type Hook = Record<string, unknown> & { command?: string };
const adapters: Record<HarnessName, HarnessAdapter> = { codex: codexAdapter, "claude-code": claudeCodeAdapter, cursor: cursorAdapter, opencode: opencodeAdapter };
const marker = "--gauntlet-managed";

export function adapter(name: HarnessName) { return adapters[name]; }

function command(name: HarnessName, event: string): string {
  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  return `"${process.execPath}" "${cli}" hook ${name} ${event} ${marker}`;
}

function definitions(name: HarnessName): Record<string, Hook[]> {
  if (name === "cursor") return {
    sessionStart: [{ command: command(name, "sessionStart") }], beforeSubmitPrompt: [{ command: command(name, "beforeSubmitPrompt") }], postToolUse: [{ command: command(name, "postToolUse") }],
    postToolUseFailure: [{ command: command(name, "postToolUseFailure") }], stop: [{ command: command(name, "stop"), loop_limit: 1 }],
  };
  const common = {
    UserPromptSubmit: [{ hooks: [{ type: "command", command: command(name, "UserPromptSubmit"), timeout: 10 }] }],
    PostToolUse: [{ matcher: "Bash|apply_patch|Edit|Write", hooks: [{ type: "command", command: command(name, "PostToolUse"), timeout: 5 }] }],
    Stop: [{ hooks: [{ type: "command", command: command(name, "Stop"), timeout: 180 }] }],
  };
  return name === "claude-code" ? { ...common, PostToolUseFailure: [{ matcher: "Bash|apply_patch|Edit|Write", hooks: [{ type: "command", command: command(name, "PostToolUseFailure"), timeout: 5 }] }] } : common;
}

function merge(config: JsonObject, name: HarnessName): JsonObject {
  const hooks = typeof config.hooks === "object" && config.hooks ? config.hooks as Record<string, unknown> : {};
  for (const [event, additions] of Object.entries(definitions(name))) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] as Hook[] : [];
    hooks[event] = [...existing.filter((item) => !JSON.stringify(item).includes(marker)), ...additions];
  }
  return name === "cursor" ? { ...config, version: 1, hooks } : { ...config, hooks };
}

function removeDefinitions(config: JsonObject): JsonObject {
  if (typeof config.hooks !== "object" || !config.hooks) return config;
  const hooks = { ...(config.hooks as Record<string, unknown>) };
  for (const [event, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) continue;
    const remaining = (value as Hook[]).filter((item) => !JSON.stringify(item).includes(marker));
    if (remaining.length) hooks[event] = remaining; else delete hooks[event];
  }
  return { ...config, hooks };
}

async function readConfig(path: string): Promise<JsonObject> {
  try { return JSON.parse(await readFile(path, "utf8")) as JsonObject; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw new Error(`Cannot safely update invalid JSON configuration: ${path}`, { cause: error }); }
}

async function writeConfig(path: string, config: JsonObject): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, path);
}

export async function install(cwd: string, name: HarnessName, dryRun = false): Promise<string> {
  const target = join(cwd, adapters[name].configurationPath);
  if (name === "opencode") { if (!dryRun) { await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, opencodePluginSource(process.execPath, fileURLToPath(new URL("../cli.js", import.meta.url))), { mode: 0o600 }); } return target; }
  const config = merge(await readConfig(target), name);
  if (!dryRun) await writeConfig(target, config);
  return target;
}

export async function uninstall(cwd: string, name: HarnessName, dryRun = false): Promise<string> {
  const target = join(cwd, adapters[name].configurationPath);
  if (name === "opencode") { if (!dryRun) try { await rm(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } return target; }
  try {
    await access(target); const config = removeDefinitions(await readConfig(target));
    const hooks = config.hooks as Record<string, unknown> | undefined;
    if (!dryRun) { if (Object.keys(config).length === 1 && hooks && !Object.keys(hooks).length) await rm(target); else await writeConfig(target, config); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return target;
}

export async function installationStatus(cwd: string): Promise<Record<HarnessName, { path: string; installed: boolean }>> {
  return Object.fromEntries(await Promise.all(Object.entries(adapters).map(async ([name, value]) => {
    const path = join(cwd, value.configurationPath); let installed = false;
    try { installed = (await readFile(path, "utf8")).includes(marker); } catch { /* not installed */ }
    return [name, { path, installed }];
  }))) as Record<HarnessName, { path: string; installed: boolean }>;
}
