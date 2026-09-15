import pc from "picocolors";
import type { TaskMeasurement } from "../core/measure.js";

export function formatSummary(value: TaskMeasurement, color = process.stdout.isTTY): string {
  const mark = (yes: boolean) => yes ? "✓" : "✗";
  const paint = (yes: boolean, text: string) => !color ? text : yes ? pc.green(text) : pc.red(text);
  const seconds = (value.durationMs / 1_000).toFixed(1);
  return [pc.bold("GAUNTLET"), paint(value.clean, `${mark(value.clean)} CLEAN`), paint(value.verified, `${mark(value.verified)} VERIFIED`), paint(value.firstPass, `${mark(value.firstPass)} FIRST PASS`), "", `Time       ${seconds}s`, `Attempts   ${value.attempts}`, `Files      ${value.files}`, `LoC        +${value.added}/-${value.removed}`, `Checks     ${value.checksRun}`].join("\n");
}
