import { spawn, type ChildProcess } from "node:child_process";

export interface CommandResult { command: string; exitCode: number | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean }

// CreateProcess has no PATHEXT resolution and Node 24 blocks .cmd/.bat spawns outright; cmd.exe is the only way to reach package-manager shims.
const quoteForCmd = (token: string) => (/[ \t"]/.test(token) ? `"${token.replaceAll('"', '""')}"` : token);

type Launch = { child: ChildProcess } | { code: string; message: string };

function launch(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Launch {
  try {
    return { child: spawn(command, args, { cwd, shell: false, env }) };
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    return { code: errno.code ?? "UNKNOWN", message: errno.message };
  }
}

function observe(child: ChildProcess, label: string, timeoutMs: number, maxBytes: number, started: number): Promise<CommandResult | (Extract<Launch, { code: string }> & { stderr: string })> {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", timedOut = false;
    const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-maxBytes);
    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    let forceTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); forceTimer = setTimeout(() => child.kill("SIGKILL"), 2_000); }, timeoutMs);
    const finish = (result: CommandResult | { code: string; message: string; stderr: string }) => { clearTimeout(timer); if (forceTimer) clearTimeout(forceTimer); resolve(result); };
    child.once("error", (error: NodeJS.ErrnoException) => finish({ code: error.code ?? "UNKNOWN", message: error.message, stderr }));
    child.once("close", (exitCode) => finish({ command: label, exitCode, stdout, stderr, durationMs: performance.now() - started, timedOut }));
  });
}

const unavailable = (label: string, started: number, stderr: string): CommandResult => ({ command: label, exitCode: null, stdout: "", stderr, durationMs: performance.now() - started, timedOut: false });

export async function run(command: string, args: string[], cwd: string, timeoutMs = 60_000, maxBytes = 256_000): Promise<CommandResult> {
  const started = performance.now();
  const env = { ...process.env, CI: "1" };
  const label = [command, ...args].join(" ");
  const first = launch(command, args, cwd, env);
  const outcome = "child" in first
    ? await observe(first.child, label, timeoutMs, maxBytes, started)
    : { code: first.code, message: first.message, stderr: "" };
  if ("code" in outcome) {
    // Retry only when the direct spawn could not start at all; real executables never take this path.
    if (process.platform === "win32" && (outcome.code === "ENOENT" || outcome.code === "EINVAL")) {
      const line = [command, ...args].map(quoteForCmd).join(" ");
      const retry = launch(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", line], cwd, env);
      if ("child" in retry) {
        const result = await observe(retry.child, label, timeoutMs, maxBytes, started);
        if ("code" in result) return unavailable(label, started, result.message);
        return result;
      }
      return unavailable(label, started, retry.message);
    }
    return unavailable(label, started, outcome.message);
  }
  return outcome;
}
