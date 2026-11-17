// Checks the 3D / stress / animation models: node tests/viz.mjs   (no dependencies)
// For every preset, builds the model and evaluates its stress field and displacements
// at every geometry corner over the animation; all values must be finite.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const edition = (await import(pathToFileURL(join(root, 'js/codes/nscp2015.js')))).default;
const { buildModel, hasViz } = await import(pathToFileURL(join(root, 'js/ui/viz/models.js')));
let n = 0, bad = 0, models = 0, fails = 0;
const problems = [];
for (const f of readdirSync(join(root, 'presets')).sort()) {
  const P = await import(pathToFileURL(join(root, 'presets', f)));
  if (!hasViz(P.meta.module)) continue;
  const calc = await import(pathToFileURL(join(root, P.meta.calc)));
  for (const p of P.default) {
    const input = Object.assign({}, p.inputs, { mode: p.mode });
    let r, model;
    try { r = calc.solve(input, { edition, method: p.method || null }); model = buildModel(P.meta.module, p.mode, input, r); }
    catch (e) { bad++; problems.push(P.meta.module + ' ' + p.id + ': threw ' + e.stack.split('\n').slice(0, 2).join(' ')); continue; }
    if (!model) continue;
    models++;
    if (model.fails) fails++;
    const check = (v, what) => { n++; if (!isFinite(v)) { bad++; if (problems.length < 40) problems.push(P.meta.module + ' ' + p.id + ': ' + what + ' = ' + v); } };
    check(model.lamEnd, 'lamEnd');
    model.bounds.flat().forEach((v) => check(v, 'bounds'));
    for (const part of model.parts) for (const g of part.geoms) {
      const pts = g.type === 'box' ? [g.min, g.max, [g.min[0], g.max[1], g.max[2]]] : [g.a, g.b];
      for (const q of pts) {
        if (model.stress && part.stress !== false) { check(model.stress.f(q[0], q[1], q[2], part, 1), 'stress'); check(model.stress.f(q[0], q[1], q[2], part, model.lamEnd), 'stress at failure'); }
        for (const [r, brk] of [[0.5, 0], [1, 0], [1, 0.5], [1, 1]]) model.disp(q[0], q[1], q[2], part, { lam: r * model.lamEnd, lamEnd: model.lamEnd, r, brk }).forEach((v) => check(v, 'disp'));
      }
    }
    for (const c of model.cracks || []) for (const q of c.pts) q.forEach((v) => check(v, 'crack point'));
  }
}
problems.forEach((x) => console.log('  ' + x));
console.log(models + ' models (' + fails + ' with a failure animation), ' + n + ' values checked, ' + bad + ' bad');
process.exit(bad ? 1 : 0);
