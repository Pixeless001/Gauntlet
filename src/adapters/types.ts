import type { GauntletEvent } from "../core/events.js";
import { z } from "zod";

export const harnessNameSchema = z.enum(["codex", "claude-code", "cursor"]);
export type HarnessName = z.infer<typeof harnessNameSchema>;
export interface HarnessAdapter { name: HarnessName; configurationPath: string; nativeEvents: string[]; translate(input: unknown): GauntletEvent }
