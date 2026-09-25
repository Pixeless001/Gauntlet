export function compileRules(facts) {
    return facts.map((fact) => ({
        id: fact.id,
        instruction: fact.value,
        timing: fact.category === "architecture" || fact.category === "testing" ? "before_stop" : fact.category === "api" ? "edit" : "turn",
        enforcement: fact.category === "architecture" ? "structural" : fact.category === "tooling" || fact.category === "testing" ? "deterministic" : "instruction",
        sourceRefs: fact.sourceRefs.map((item) => `${item.path}#${item.fingerprint}`),
    }));
}
export function actionableRules(rules, timing) { return rules.filter((rule) => rule.timing === timing); }
