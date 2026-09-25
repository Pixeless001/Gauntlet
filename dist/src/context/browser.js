export function compactBrowserProof(proof, limit = 20) {
    return { text: unique(proof.text).slice(0, limit), controls: proof.controls.filter((item, index, values) => values.findIndex((value) => value.role === item.role && value.name === item.name) === index).slice(0, limit), ...(proof.screenshot ? { screenshot: proof.screenshot } : {}), failures: unique([...proof.consoleFailures, ...proof.networkFailures]).slice(0, limit) };
}
function unique(values) { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
