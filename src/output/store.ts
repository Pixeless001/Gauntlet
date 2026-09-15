import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandResult } from "../repo/process.js";

export async function storeOutput(cwd: string, result: CommandResult, runId = "verification"): Promise<string> {
  const safeRun = /^[\w-]{1,128}$/.test(runId) ? runId : "verification", id = randomUUID(), relative = join(".gauntlet", "runs", safeRun, "outputs", `${id}.log`);
  const path = resolve(cwd, relative), root = resolve(cwd, ".gauntlet");
  if (!path.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Invalid output path");
  const directory = join(cwd, ".gauntlet", "runs", safeRun, "outputs"), temporary = `${path}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(temporary, `command: ${result.command}\nexit: ${result.exitCode ?? "unavailable"}\ntimedOut: ${result.timedOut}\n\nSTDOUT\n${result.stdout}\n\nSTDERR\n${result.stderr}`, { mode: 0o600 }); await rename(temporary, path);
  const current = `${id}.log`, logs = (await readdir(directory)).filter((name) => name.endsWith(".log") && name !== current).sort();
  await Promise.all(logs.slice(0, Math.max(0, logs.length - 99)).map((name) => rm(join(directory, name), { force: true })));
  return relative.replaceAll("\\", "/");
}
