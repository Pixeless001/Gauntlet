import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install } from "../adapters/install.js";
import { changedFiles } from "../repo/git.js";
import { run } from "../repo/process.js";
import { inspectSlopForDiff } from "../verify/slop.js";
import { getDriver, type BenchmarkHarness } from "./agents.js";
import { benchmarkTasks, scaffoldTask, type BenchmarkTask } from "./fixtures.js";

export interface BenchmarkOptions { harness: BenchmarkHarness; model?: string | undefined; endpoint?: string | undefined; apiKeyEnv?: string | undefined; tasks?: string[] | undefined; repeats: number; timeoutMs: number }

export interface ArmOutcome {
  task: string;
  arm: "baseline" | "treatment";
  repeat: number;
  agentExit: number | null;
  agentTimedOut: boolean;
  wallMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  locAdded: number;
  locRemoved: number;
  filesTouched: number;
  acceptance: boolean;
  preservation: boolean;
  firstCleanPass: boolean;
  slopFindings: { code: string; message: string; proof: string[] }[];
  slopFree: boolean;
}

export async function runBenchmark(options: BenchmarkOptions): Promise<ArmOutcome[]> {
  const driver = getDriver(options.harness);
  if (!(await driver.detect())) throw new Error(`Agent CLI for harness "${options.harness}" was not found on PATH. Run gauntlet benchmark --list-drivers to see what is installed.`);
  const selected = benchmarkTasks().filter((task) => !options.tasks?.length || options.tasks.includes(task.id));
  const missing = options.tasks?.filter((id) => !selected.some((task) => task.id === id)) ?? [];
  if (missing.length) throw new Error(`Unknown benchmark task id(s): ${missing.join(", ")}`);
  const outcomes: ArmOutcome[] = [];
  for (const task of selected) {
    for (let repeat = 1; repeat <= options.repeats; repeat++) {
      outcomes.push(await runArm(driver, task, "baseline", repeat, options));
      outcomes.push(await runArm(driver, task, "treatment", repeat, options));
    }
  }
  return outcomes;
}

async function runArm(driver: ReturnType<typeof getDriver>, task: BenchmarkTask, arm: "baseline" | "treatment", repeat: number, options: BenchmarkOptions): Promise<ArmOutcome> {
  const root = await mkdtemp(join(tmpdir(), "gauntlet-bench-"));
  try {
    const cwd = await scaffoldTask(root, task);
    if (arm === "treatment") await install(cwd, options.harness);
    const agent = await driver.run({ cwd, prompt: task.intent, model: options.model, endpoint: options.endpoint, apiKeyEnv: options.apiKeyEnv, timeoutMs: options.timeoutMs });
    const [changes, head] = await Promise.all([changedFiles(cwd), headCommit(cwd)]);
    const slop = head ? await inspectSlopForDiff(cwd, head, changes) : [];
    const [acceptance, preservation] = await Promise.all([nodeTest(cwd, "test/discriminating.test.js"), nodeTest(cwd, "test/preservation.test.js")]);
    return {
      task: task.id, arm, repeat,
      agentExit: agent.exitCode, agentTimedOut: agent.timedOut, wallMs: agent.wallMs, tokensIn: agent.tokensIn, tokensOut: agent.tokensOut,
      locAdded: changes.reduce((sum, change) => sum + change.added, 0), locRemoved: changes.reduce((sum, change) => sum + change.removed, 0), filesTouched: changes.length,
      acceptance, preservation, firstCleanPass: acceptance && preservation,
      slopFindings: slop.map((finding) => ({ code: finding.code, message: finding.message, proof: finding.proof })),
      slopFree: slop.length === 0,
    };
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function headCommit(cwd: string): Promise<string | null> {
  const result = await run("git", ["rev-parse", "HEAD"], cwd, 15_000, 1_000);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function nodeTest(cwd: string, file: string): Promise<boolean> {
  return (await run("node", ["--test", file], cwd, 60_000, 4_000_000)).exitCode === 0;
}
