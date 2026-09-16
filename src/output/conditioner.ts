import type { CommandResult } from "../repo/process.js";

export interface ConditionedOutput {
  summary: string;
  rawBytes: number;
  retainedBytes: number;
  tokensRemoved: number;
  actionableFailures: number;
  truncated: boolean;
}
const actionable = /(?:error|fail|fatal|warn|timeout|expected|received|assert| at |:\d+:\d+)/i;

export function conditionOutput(result: CommandResult, limit = 8_000): ConditionedOutput {
  const raw = [result.stdout, result.stderr].filter(Boolean).join("\n"), lines = raw.split(/\r?\n/), seen = new Set<string>();
  const unique = lines.filter((line) => { const value = line.trim(); if (!value || seen.has(value)) return false; seen.add(value); return true; });
  const failureIndexes = unique.flatMap((line, index) => actionable.test(line) ? [index] : []), passing = result.exitCode === 0 && !result.timedOut;
  const selected = passing ? unique.slice(-20) : failureIndexes.length ? unique.filter((_, index) => failureIndexes.some((failure) => Math.abs(failure - index) <= 1)).slice(-40) : unique.slice(-40);
  const heading = `${result.command}: ${result.timedOut ? "timed out" : passing ? "passed" : `failed (${result.exitCode ?? "unavailable"})`}`;
  const text = [heading, ...selected].join("\n"), truncated = text.length > limit;
  const summary = truncated ? `${text.slice(0, limit - 23)}\n[summary truncated]` : text;
  const rawBytes = Buffer.byteLength(raw), retainedBytes = Buffer.byteLength(summary);
  return { summary, rawBytes, retainedBytes, tokensRemoved: Math.max(0, Math.ceil((rawBytes - retainedBytes) / 4)), actionableFailures: failureIndexes.length, truncated };
}
