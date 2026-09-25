import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskMeasurement } from "../core/measure.js";
import type { BenchmarkReport } from "../benchmark/report.js";

const pct = (n: number, d: number) => d ? `${Math.round(100 * n / d)}%` : "n/a";
const sum = (items: TaskMeasurement[], pick: (item: TaskMeasurement) => number) => items.reduce((total, item) => total + pick(item), 0);
const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)]! : 0;
const rate = (value: number) => `${Math.round(value * 100)}%`;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

async function readJson<T>(path: string): Promise<T | null> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch { return null; } }

/** finish can run twice per task (retry); the last entry per taskId wins. Read-only turns are excluded. */
export async function loadHistory(cwd: string): Promise<TaskMeasurement[]> {
  let raw = ""; try { raw = await readFile(join(cwd, ".gauntlet", "history.jsonl"), "utf8"); } catch { return []; }
  const latest = new Map<string, TaskMeasurement>();
  for (const line of raw.split("\n")) { try { const item = JSON.parse(line) as TaskMeasurement; if (typeof item.taskId === "string") latest.set(item.taskId, item); } catch { /* torn line */ } }
  return [...latest.values()].filter((item) => item.files > 0 || item.checksRun > 0);
}

export async function latestBenchmark(cwd: string): Promise<BenchmarkReport | null> {
  const root = join(cwd, ".gauntlet", "benchmark");
  try { const runs = (await readdir(root)).sort(); const last = runs.at(-1); return last ? await readJson<BenchmarkReport>(join(root, last, "report.json")) : null; } catch { return null; }
}

export function formatStats(history: TaskMeasurement[], benchmark: BenchmarkReport | null): string {
  const n = history.length, lines = ["GAUNTLET STATS", ""];
  if (!n) lines.push("No recorded tasks yet. History fills as turns that change files or run checks finish.");
  else {
    const added = sum(history, (h) => h.added), removed = sum(history, (h) => h.removed), ms = sum(history, (h) => h.durationMs);
    const raw = sum(history, (h) => h.output?.rawBytes ?? 0), shown = sum(history, (h) => h.output?.visibleBytes ?? 0);
    lines.push(
      `Tasks              ${n}`,
      `First pass         ${pct(history.filter((h) => h.firstPass).length, n)}`,
      `Verified           ${pct(history.filter((h) => h.verified).length, n)}`,
      `Clean              ${pct(history.filter((h) => h.clean).length, n)}`,
      `Corrected          ${history.filter((h) => h.attempts > 1).length} (needed a second attempt)`,
      `Findings caught    ${sum(history, (h) => h.findings.length)}`,
      `Checks run         ${sum(history, (h) => h.checksRun)}`,
      "",
      `LoC                +${added}/-${removed} (net ${added - removed >= 0 ? "+" : ""}${added - removed}, median +${median(history.map((h) => h.added))}/task)`,
      `Files touched      ${sum(history, (h) => h.files)}`,
      `Time               ${(ms / 60_000).toFixed(1)} min total, median ${(median(history.map((h) => h.durationMs)) / 1_000).toFixed(1)}s/task`,
      "",
      `Check output       ${kb(raw)} raw -> ${kb(shown)} shown${raw ? ` (${pct(Math.max(0, raw - shown), raw)} cut, ${sum(history, (h) => h.output?.tokensRemoved ?? 0)} tokens)` : ""}`,
      `Repeat work caught ${sum(history, (h) => (h.context?.repeatReadsDetected ?? 0) + (h.context?.repeatSearchesDetected ?? 0))} reads/searches`,
    );
  }
  if (benchmark) {
    const { baseline: b, treatment: t } = benchmark.summary;
    lines.push("", `Benchmark A/B (${benchmark.harness}${benchmark.model ? ` ${benchmark.model}` : ""}, ${benchmark.generatedAt.slice(0, 10)}, ${t.runs} runs/arm)`,
      `Accepted           ${rate(b.acceptanceRate)} -> ${rate(t.acceptanceRate)}`,
      `Slop-free          ${rate(b.slopFreeRate)} -> ${rate(t.slopFreeRate)}`,
      `Median LoC added   ${b.medianLocAdded} -> ${t.medianLocAdded}`,
      `Median wall time   ${(b.medianWallMs / 1_000).toFixed(1)}s -> ${(t.medianWallMs / 1_000).toFixed(1)}s`);
  } else lines.push("", "Benchmark A/B      none (run `gauntlet benchmark` for a baseline-vs-Gauntlet comparison; LoC and speed impact cannot be inferred from history alone)");
  return lines.join("\n");
}
