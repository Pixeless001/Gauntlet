import type { GauntletEvent } from "../core/events.js";
import { z } from "zod";

export const harnessNameSchema = z.enum(["codex", "claude-code", "cursor", "opencode"]);
export type HarnessName = z.infer<typeof harnessNameSchema>;
export interface HarnessCapabilities {
  skills: { supported: boolean; dynamicLoad: boolean };
  lifecycle: { taskStart: boolean; toolActivity: boolean; failure: boolean; beforeStop: boolean };
  tools: { shell: boolean; mcp: boolean; browser: boolean };
  delegation: { supported: boolean; callback: boolean; modelSelection: boolean };
  telemetry: { tokens: boolean; cost: boolean };
  environment: { worktrees: boolean; sandbox: boolean };
  execution: { cancellation: boolean };
  output: { replacement: "general" | "feedback" | "mcp" | "none"; preventsInitialContextCost: boolean };
  compaction: { hooks: boolean };
}
export interface HarnessAdapter { name: HarnessName; configurationPath: string; nativeEvents: string[]; capabilities: HarnessCapabilities; translate(input: unknown, nativeEvent?: string): GauntletEvent }
