// Edition layer tests (hand-off Later 11, item 4): node tests/edition.mjs
// Also run by tests/run.mjs. Exports editionTests() -> [{ name, ok, detail }].
//   parity : every leaf path of NSCP 2015 (clause keys included) exists in NSCP 2025 with the same type;
//   ED-1   : an edition derived with concrete.phi.shear = 0.80 leaves Vc unchanged and scales phiVc by 0.80/0.75;
//   literals: the report of tools/audit-literals.mjs for the calculator files (information, never a failure).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(root, p)));

const typeOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);
// Leaf paths as arrays of keys; clause keys (which contain dots) stay one segment.
export function leaves(obj, path = [], out = []) {
  const t = typeOf(obj);
  if (t === 'object' && Object.keys(obj).length) Object.keys(obj).forEach((k) => leaves(obj[k], path.concat(k), out));
  else out.push({ path, type: t });
  return out;
}
const at = (obj, path) => path.reduce((o, k) => (o != null ? o[k] : undefined), obj);

export async function editionTests() {
  const { default: e15 } = await imp('js/codes/nscp2015.js');
  const { default: e25 } = await imp('js/codes/nscp2025.js');
  const { derive } = await imp('js/codes/derive.js');
  const { editions, getEdition } = await imp('js/codes/index.js');
  const out = [];
  const t = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail || '' });

  // parity
  const ls = leaves(e15), missing = [];
  ls.forEach((l) => { const got = typeOf(at(e25, l.path)); if (got !== l.type && !(l.type === 'object' && got === 'object')) missing.push(l.path.join(' > ') + ' (' + l.type + ' vs ' + got + ')'); });
  t('parity: NSCP 2015 leaf paths in NSCP 2025, same types', !missing.length, ls.length + ' paths' + (missing.length ? '; first difference: ' + missing[0] : ''));
  const ck = Object.keys(e15.clauses).filter((k) => !(k in e25.clauses));
  t('parity: NSCP 2015 clause keys in NSCP 2025', !ck.length, Object.keys(e15.clauses).length + ' clause keys');
  t('NSCP 2025: disabled draft, getEdition gives NSCP 2015', e25.status === 'draft' && e25.enabled === false && getEdition('nscp2025') === e15 && editions.includes(e25));
  t('NSCP 2025 is a deep copy (no shared objects)', e25.concrete !== e15.concrete && e25.clauses !== e15.clauses && e25.concrete.phi !== e15.concrete.phi);

  // ED-1
  const test = derive(e15, { 'concrete.phi.shear': 0.80 }, { id: 'test' });
  const presets = (await imp('presets/rc-shear-torsion.js')).default, meta = (await imp('presets/rc-shear-torsion.js')).meta;
  const calc = await imp(meta.calc), p = presets.find((x) => x.test);
  const input = Object.assign({ mode: p.mode }, p.inputs);
  const a = calc.compute(input, { edition: e15, method: p.method || null }), b = calc.compute(input, { edition: test, method: p.method || null });
  const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
  t('ED-1: Vc unchanged with phi.shear 0.80 (' + p.test + ')', rel(b.Vc, a.Vc) < 1e-12, 'Vc ' + a.Vc.toFixed(3) + ' and ' + b.Vc.toFixed(3) + ' kN');
  t('ED-1: phiVc ratio = 0.80 / 0.75 = 1.06667', rel(b.phiVc / a.phiVc, 0.80 / 0.75) < 2e-3, 'ratio ' + (b.phiVc / a.phiVc).toFixed(5));
  t('ED-1: the base edition is untouched', e15.concrete.phi.shear === 0.75 && test.concrete.phi.shear === 0.80 && test.id === 'test');
  // derive details
  const d2 = derive(e15, { concrete: { phi: { shear: 0.7 } }, 'clauses.steel.comp.Fcr': { nscp: 'X' }, 'wind.Kd': [1] });
  t('derive: nested, per-clause and array overrides',
    d2.concrete.phi.shear === 0.7 && d2.concrete.phi.tension === e15.concrete.phi.tension && typeof d2.concrete.phi.flexAxial === 'function' &&
    d2.clauses['steel.comp.Fcr'].nscp === 'X' && d2.clauses['steel.comp.Fcr'].src === e15.clauses['steel.comp.Fcr'].src && d2.clauses['steel.comp.slenderness'].nscp === e15.clauses['steel.comp.slenderness'].nscp &&
    Array.isArray(d2.wind.Kd) && d2.wind.Kd.length === 1);

  // literals (information)
  const { auditLiterals } = await imp('tools/audit-literals.mjs');
  const rep = auditLiterals(), NEW = ['shared/wind', 'shared/seismic', 'shared/load-combos', 'steel/composite', 'rc/prestressed', 'found/settlement'];
  const mine = rep.filter((r) => NEW.some((m) => r.file.replace(/\\/g, '/').endsWith(m + '.calc.js')));
  const all = rep.reduce((s, r) => s + r.hits.length, 0), newHits = mine.reduce((s, r) => s + r.hits.length, 0);
  t('literals (report only, never fails)', true, 'Later modules ' + newHits + ', all calc files ' + all + '; node tools/audit-literals.mjs');
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await editionTests();
  rows.forEach((r) => console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.name + (r.detail ? '  (' + r.detail + ')' : '')));
  const bad = rows.filter((r) => !r.ok).length;
  console.log('\n' + rows.length + ' edition checks, ' + bad + ' failed.');
  process.exitCode = bad ? 1 : 0;
}
