import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandResult } from "../repo/process.js";

export async function storeOutput(cwd: string, result: CommandResult, runId = "verification"): Promise<string> {
  const safeRun = /^[\w-]{1,128}$/.test(runId) ? runId : "verification", id = randomUUID(), relative = join(".gauntlet", "runs", safeRun, "outputs", `${id}.log`);
  const path = resolve(cwd, relative), root = resolve(cwd, ".gauntlet");
  if (!path.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Invalid output path");
  await mkdir(join(cwd, ".gauntlet", "runs", safeRun, "outputs"), { recursive: true, mode: 0o700 });
  await writeFile(path, `command: ${result.command}\nexit: ${result.exitCode ?? "unavailable"}\ntimedOut: ${result.timedOut}\n\nSTDOUT\n${result.stdout}\n\nSTDERR\n${result.stderr}`, { mode: 0o600 });
  return relative.replaceAll("\\", "/");
}
