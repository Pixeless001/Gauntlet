import type { TaskContract } from "./events.js";
import { type ContextPacket } from "../repo/context.js";
import type { ConventionFact } from "../repo/conventions.js";
import type { RepoIndex } from "../repo/index.js";
import type { ActiveExecutionContext } from "../execution-state/reconstruct.js";
export declare function createContextPacket(cwd: string, contract: TaskContract, conventions?: ConventionFact[], index?: RepoIndex, execution?: ActiveExecutionContext): Promise<ContextPacket>;
export declare function formatContext(packet: ContextPacket): string;
