import pc from "picocolors";
import type { TaskMeasurement } from "../core/measure.js";

export function formatSummary(value: TaskMeasurement, color = process.stdout.isTTY): string {
  const mark = (yes: boolean) => yes ? "✓" : "✗";
  const paint = (yes: boolean, text: string) => !color ? text : yes ? pc.green(text) : pc.red(text);
  const seconds = (value.durationMs / 1_000).toFixed(1);
  const findings = value.findings.map((finding) => `- ${finding}`), failures = (value.proof ?? []).filter((item) => item.status !== "pass").flatMap((item) => [`- ${item.id}: ${item.status}`, ...(item.summary ? item.summary.split("\n").slice(0, 8).map((line) => `  ${line}`) : []), ...(item.reference ? [`  Full result: ${item.reference}`] : [])]);
  const status = value.completion === "complete" ? "✓ COMPLETE" : value.completion === "semantic-verification-required" ? "? SEMANTIC VERIFICATION REQUIRED" : "✗ INCOMPLETE";
  return [pc.bold("GAUNTLET"), paint(value.completion === "complete", status), paint(value.clean, `${mark(value.clean)} CLEAN`), paint(value.verified, `${mark(value.verified)} VERIFIED`), paint(value.firstPass, `${mark(value.firstPass)} FIRST PASS`), "", `Time       ${seconds}s`, `Attempts   ${value.attempts}`, `Files      ${value.files}`, `LoC        +${value.added}/-${value.removed}`, `Checks     ${value.checksRun}`, ...(findings.length ? ["", "Findings:", ...findings] : []), ...(failures.length ? ["", "Failed proof:", ...failures] : [])].join("\n");
}
