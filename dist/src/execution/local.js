import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { run } from "../repo/process.js";
export class LocalExecutionEnvironment {
    kind;
    root;
    id;
    constructor(root, kind = "local") {
        this.kind = kind;
        this.root = resolve(root);
        this.id = `${kind}:${createHash("sha256").update(this.root).digest("hex").slice(0, 16)}`;
    }
    run(command, args, options = {}) { return run(command, args, this.root, options.timeoutMs, options.maxBytes); }
}
export class ProviderExecutionEnvironment {
    root;
    id;
    execute;
    kind;
    constructor(root, id, execute, kind = "sandbox-provider") {
        this.root = root;
        this.id = id;
        this.execute = execute;
        this.kind = kind;
    }
    run(command, args, options) { return this.execute(command, args, options); }
}
