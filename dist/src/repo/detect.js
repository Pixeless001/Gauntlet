import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
async function exists(path) { try {
    await access(path);
    return true;
}
catch {
    return false;
} }
export async function detectDependencies(cwd) {
    try {
        const value = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
        return [...new Set([...Object.keys(value.dependencies ?? {}), ...Object.keys(value.optionalDependencies ?? {})])].sort();
    }
    catch {
        return [];
    }
}
export async function detectRepository(cwd) {
    const dependencies = await detectDependencies(cwd);
    const packageManager = await exists(join(cwd, "pnpm-lock.yaml")) ? "pnpm" : await exists(join(cwd, "yarn.lock")) ? "yarn" : await exists(join(cwd, "package-lock.json")) ? "npm" : await exists(join(cwd, "uv.lock")) ? "uv" : await exists(join(cwd, "poetry.lock")) ? "poetry" : await exists(join(cwd, "Cargo.lock")) ? "cargo" : null;
    const languages = [];
    if (await exists(join(cwd, "tsconfig.json")))
        languages.push("typescript");
    if (await exists(join(cwd, "Cargo.toml")))
        languages.push("rust");
    if (await exists(join(cwd, "pyproject.toml")))
        languages.push("python");
    const harnesses = (await Promise.all([["claude-code", ".claude"], ["cursor", ".cursor"], ["codex", ".codex"]].map(async ([name, path]) => await exists(join(cwd, path)) ? name : null))).filter((x) => Boolean(x));
    const commands = [];
    let testRunner;
    if (packageManager) {
        try {
            const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
            for (const name of ["typecheck", "lint", "test"])
                if (pkg.scripts?.[name])
                    commands.push({ name, command: packageManager, args: packageManager === "npm" ? ["run", name] : [name] });
            const test = pkg.scripts?.test ?? "";
            testRunner = /\bvitest\b/.test(test) ? "vitest" : /\bjest\b/.test(test) ? "jest" : /node\s+.*--test|node\s+--test/.test(test) ? "node" : undefined;
            if (!pkg.scripts?.typecheck && pkg.scripts?.check)
                commands.unshift({ name: "check", command: packageManager, args: packageManager === "npm" ? ["run", "check"] : ["check"] });
        }
        catch { /* no manifest */ }
    }
    if (languages.includes("rust"))
        commands.push({ name: "typecheck", command: "cargo", args: ["check"] }, { name: "lint", command: "cargo", args: ["clippy", "--", "-D", "warnings"] }, { name: "test", command: "cargo", args: ["test"] });
    if (languages.includes("python")) {
        const pyproject = await readFile(join(cwd, "pyproject.toml"), "utf8");
        const python = packageManager === "uv" ? { command: "uv", prefix: ["run"] } : packageManager === "poetry" ? { command: "poetry", prefix: ["run"] } : { command: "python", prefix: ["-m"] };
        if (/\b(?:pyright|mypy)\b/.test(pyproject)) {
            const tool = /\bpyright\b/.test(pyproject) ? "pyright" : "mypy";
            commands.push({ name: "typecheck", command: python.command, args: [...python.prefix, tool, "."] });
        }
        if (/\bpytest\b/.test(pyproject)) {
            commands.push({ name: "test", command: python.command, args: [...python.prefix, "pytest"] });
            testRunner = "pytest";
        }
    }
    if (await exists(join(cwd, "go.mod"))) {
        languages.push("go");
        commands.push({ name: "lint", command: "go", args: ["vet", "./..."] }, { name: "test", command: "go", args: ["test", "./..."] });
    }
    if (await exists(join(cwd, "Gemfile"))) {
        languages.push("ruby");
        commands.push({ name: "test", command: "bundle", args: ["exec", "rake", "test"] });
    }
    if (await exists(join(cwd, "gradlew"))) {
        languages.push("java");
        commands.push({ name: "test", command: join(cwd, "gradlew"), args: ["test"] });
    }
    if ((await readdir(cwd)).some((name) => /\.(?:sln|csproj)$/.test(name))) {
        languages.push("dotnet");
        commands.push({ name: "test", command: "dotnet", args: ["test"] });
    }
    return { packageManager, language: languages, dependencies, commands, harnesses, ...(testRunner ? { testRunner } : {}) };
}
