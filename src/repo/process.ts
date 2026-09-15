import { spawn } from "node:child_process";

export interface CommandResult { command: string; exitCode: number | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean }

export async function run(command: string, args: string[], cwd: string, timeoutMs = 60_000, maxBytes = 256_000): Promise<CommandResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, env: { ...process.env, CI: "1" } });
    let stdout = "", stderr = "", timedOut = false;
    const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-maxBytes);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    let forceTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); forceTimer = setTimeout(() => child.kill("SIGKILL"), 2_000); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); if (forceTimer) clearTimeout(forceTimer); resolve({ command: [command, ...args].join(" "), exitCode: null, stdout, stderr: error.message, durationMs: performance.now() - started, timedOut }); });
    child.on("close", (exitCode) => { clearTimeout(timer); if (forceTimer) clearTimeout(forceTimer); resolve({ command: [command, ...args].join(" "), exitCode, stdout, stderr, durationMs: performance.now() - started, timedOut }); });
  });
}
