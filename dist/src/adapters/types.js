import { z } from "zod";
export const harnessNameSchema = z.enum(["codex", "claude-code", "cursor", "opencode"]);
