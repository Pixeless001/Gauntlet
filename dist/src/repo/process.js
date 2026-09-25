import { spawn } from "node:child_process";
// CreateProcess has no PATHEXT resolution and Node 24 blocks .cmd/.bat spawns outright; cmd.exe is the only way to reach package-manager shims.
const quoteForCmd = (token) => (/[ \t"]/.test(token) ? `"${token.replaceAll('"', '""')}"` : token);
function launch(command, args, cwd, env) {
    try {
        return { child: spawn(command, args, { cwd, shell: false, env }) };
    }
    catch (error) {
        const errno = error;
        return { code: errno.code ?? "UNKNOWN", message: errno.message };
    }
}
function observe(child, label, timeoutMs, maxBytes, started) {
    return new Promise((resolve) => {
        child.stdin?.end();
        let stdout = "", stderr = "", timedOut = false;
        const append = (current, chunk) => (current + chunk.toString()).slice(-maxBytes);
        child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
        let forceTimer;
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); forceTimer = setTimeout(() => child.kill("SIGKILL"), 2_000); }, timeoutMs);
        const finish = (result) => { clearTimeout(timer); if (forceTimer)
            clearTimeout(forceTimer); resolve(result); };
        child.once("error", (error) => finish({ code: error.code ?? "UNKNOWN", message: error.message, stderr }));
        child.once("close", (exitCode) => finish({ command: label, exitCode, stdout, stderr, durationMs: performance.now() - started, timedOut }));
    });
}
const unavailable = (label, started, stderr) => ({ command: label, exitCode: null, stdout: "", stderr, durationMs: performance.now() - started, timedOut: false });
export async function run(command, args, cwd, timeoutMs = 60_000, maxBytes = 256_000, env) {
    const started = performance.now();
    // NODE_TEST_CONTEXT is node's internal test-runner protocol switch; an inherited value makes
    // spawned `node --test` children exit without running their tests.
    const environment = { ...process.env, CI: "1", ...env };
    delete environment.NODE_TEST_CONTEXT;
    for (const key of Object.keys(environment))
        if (environment[key] === undefined)
            delete environment[key];
    const label = [command, ...args].join(" ");
    const first = launch(command, args, cwd, environment);
    const outcome = "child" in first
        ? await observe(first.child, label, timeoutMs, maxBytes, started)
        : { code: first.code, message: first.message, stderr: "" };
    if ("code" in outcome) {
        // Retry only when the direct spawn could not start at all; real executables never take this path.
        if (process.platform === "win32" && (outcome.code === "ENOENT" || outcome.code === "EINVAL")) {
            const line = [command, ...args].map(quoteForCmd).join(" ");
            const retry = launch(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", line], cwd, environment);
            if ("child" in retry) {
                const result = await observe(retry.child, label, timeoutMs, maxBytes, started);
                if ("code" in result)
                    return unavailable(label, started, result.message);
                return result;
            }
            return unavailable(label, started, retry.message);
        }
        return unavailable(label, started, outcome.message);
    }
    return outcome;
}
