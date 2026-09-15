import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { run } from "../repo/process.js";
import type { ExecutionEnvironment, ExecutionKind, ExecutionOptions } from "./types.js";

export class LocalExecutionEnvironment implements ExecutionEnvironment {
  readonly root: string;
  readonly id: string;
  constructor(root: string, readonly kind: ExecutionKind = "local") {
    this.root = resolve(root);
    this.id = `${kind}:${createHash("sha256").update(this.root).digest("hex").slice(0, 16)}`;
  }
  run(command: string, args: string[], options: ExecutionOptions = {}) { return run(command, args, this.root, options.timeoutMs, options.maxBytes); }
}

export class ProviderExecutionEnvironment implements ExecutionEnvironment {
  constructor(readonly root: string, readonly id: string, private readonly execute: ExecutionEnvironment["run"], readonly kind = "sandbox-provider" as const) {}
  run(command: string, args: string[], options?: ExecutionOptions) { return this.execute(command, args, options); }
}
