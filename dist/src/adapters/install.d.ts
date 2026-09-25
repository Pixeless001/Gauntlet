import type { HarnessAdapter, HarnessName } from "./types.js";
export declare function adapter(name: HarnessName): HarnessAdapter;
export declare function install(cwd: string, name: HarnessName, dryRun?: boolean): Promise<string>;
export declare function uninstall(cwd: string, name: HarnessName, dryRun?: boolean): Promise<string>;
export declare function installationStatus(cwd: string): Promise<Record<HarnessName, {
    path: string;
    installed: boolean;
}>>;
