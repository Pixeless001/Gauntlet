import type { CommandResult } from "../repo/process.js";

export interface ConditionedOutput { summary: string; rawBytes: number; retainedBytes: number }
const actionable = /(?:error|fail|fatal|warn|timeout|expected|received|assert| at |:\d+:\d+)/i;

export function conditionOutput(result: CommandResult, limit = 8_000): ConditionedOutput {
  const raw = [result.stdout, result.stderr].filter(Boolean).join("\n"), lines = raw.split(/\r?\n/), seen = new Set<string>();
  const unique = lines.filter((line) => { const value = line.trim(); if (!value || seen.has(value)) return false; seen.add(value); return true; });
  const failures = unique.filter((line) => actionable.test(line)), passing = result.exitCode === 0 && !result.timedOut;
  const selected = passing ? unique.slice(-20) : (failures.length ? failures : unique.slice(-40));
  const heading = `${result.command}: ${result.timedOut ? "timed out" : passing ? "passed" : `failed (${result.exitCode ?? "unavailable"})`}`;
  const text = [heading, ...selected].join("\n"), summary = text.length <= limit ? text : `${text.slice(0, limit - 23)}\n[summary truncated]`;
  return { summary, rawBytes: Buffer.byteLength(raw), retainedBytes: Buffer.byteLength(summary) };
}
