import type { StructuralIndex } from "./index.js";
export declare function loadStructuralIndex(cwd: string, expectedHead?: string | null): Promise<StructuralIndex | null>;
export declare function saveStructuralIndex(cwd: string, index: StructuralIndex): Promise<boolean>;
