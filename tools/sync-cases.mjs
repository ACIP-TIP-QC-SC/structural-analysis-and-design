// Usage: node tools/sync-cases.mjs
// Writes tests/cases/<module>.json from the test presets in presets/*.js, so the test table
// and the "Test: ..." presets in the site can never disagree.
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of readdirSync(join(root, 'presets')).filter((f) => f.endsWith('.js')).sort()) {
  const mod = await import(pathToFileURL(join(root, 'presets', file)));
  const cases = mod.default.filter((p) => p.test).map((p) => {
    const c = { id: p.test, name: p.name, method: p.method || null, input: Object.assign({ mode: p.mode }, p.inputs) };
    ['expect', 'status', 'dc', 'pass', 'ok', 'errorIncludes', 'governing', 'equilibrium'].forEach((k) => { if (k in p) c[k] = p[k]; });
    return c;
  });
  const out = { module: mod.meta.module, calc: mod.meta.calc, cases };
  writeFileSync(join(root, 'tests', 'cases', file.replace(/\.js$/, '.json')), JSON.stringify(out, null, 1) + '\n');
  console.log(file, cases.length, 'cases');
}
