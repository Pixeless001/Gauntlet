import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile), root = resolve(import.meta.dirname, ".."), workspace = await mkdtemp(join(tmpdir(), "gauntlet-install-")), consumer = join(workspace, "consumer"), npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this smoke check through npm");
const npm = (args, cwd) => execute(process.execPath, [npmCli, ...args], { cwd });

try {
  const packed = await npm(["pack", "--json", "--pack-destination", workspace], root), report = JSON.parse(packed.stdout), archive = (Array.isArray(report) ? report[0] : Object.values(report)[0])?.filename;
  if (!archive) throw new Error("Package archive was not created");
  await mkdir(consumer); await writeFile(join(workspace, "package.json"), JSON.stringify({ private: true })); await npm(["install", join(workspace, archive), "--ignore-scripts"], workspace);
  const cli = join(workspace, "node_modules", "gauntlet-agent", "dist", "src", "cli.js"), help = await execute(process.execPath, [cli, "help"], { cwd: consumer });
  if (!help.stdout.includes("Gauntlet")) throw new Error("Installed command did not start");
  await execute(process.execPath, [cli, "install", "--harness", "codex"], { cwd: consumer });
  if (!(await readFile(join(consumer, ".codex", "hooks.json"), "utf8")).includes("--gauntlet-managed")) throw new Error("Installed command did not configure hooks");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
