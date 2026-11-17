// Test runner: node tests/run.mjs   (no dependencies)
// Runs every case in tests/cases/*.json against the calc files and prints a table.
// Tolerance: relative difference of 0.2% on each expected number (hand-off Section 12).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const TOL = 0.002, EQ_TOL = 0.001;
const edition = (await import(pathToFileURL(join(root, 'js/codes/nscp2015.js')))).default;

const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const sig = (x) => (typeof x === 'number' ? (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(4) : String(Number(x.toPrecision(6)))) : String(x));
const pad = (s, n) => String(s).padEnd(n);

let total = 0, failed = 0, cases = 0, casesFailed = 0;
const lines = [];
const only = process.argv[2] || '';

for (const file of readdirSync(join(here, 'cases')).filter((f) => f.endsWith('.json')).sort()) {
  const suite = JSON.parse(readFileSync(join(here, 'cases', file), 'utf8'));
  if (only && !suite.module.includes(only)) continue;
  const calc = await import(pathToFileURL(join(root, suite.calc)));
  lines.push('', '== ' + suite.module + '  (' + suite.calc + ')');
  for (const c of suite.cases) {
    cases++;
    const ctx = { edition, method: c.method || null };
    const rows = [];
    let bad = 0;
    const add = (name, exp, got, ok) => { total++; if (!ok) { bad++; failed++; } rows.push('   ' + pad(name, 30) + pad(sig(exp), 16) + pad(sig(got), 16) + (ok ? 'ok' : 'FAIL')); };
    let vals = null, res = null;
    try { vals = calc.compute(c.input, ctx); res = calc.solve(c.input, ctx); }
    catch (e) { add('(threw) ' + e.message, 'no error', 'error', false); }
    if (res) {
      // result shape (hand-off Section 4.2)
      const keys = ['ok', 'errors', 'warnings', 'notes', 'verdict', 'checks', 'results', 'steps', 'diagram', 'send'];
      const shapeOk = keys.every((k) => k in res) && Object.keys(res).length === keys.length;
      add('result shape', 'exact', shapeOk ? 'exact' : 'differs', shapeOk);
      for (const [path, exp] of Object.entries(c.expect || {})) {
        const got = pick(vals, path);
        let ok;
        if (typeof exp === 'number') ok = typeof got === 'number' && (exp === 0 ? Math.abs(got) < 1e-9 : Math.abs(got - exp) / Math.abs(exp) <= TOL);
        else ok = got === exp;
        add(path, exp, got, ok);
      }
      if ('ok' in c) add('ok', c.ok, res.ok, res.ok === c.ok);
      if (c.errorIncludes) add('error text', c.errorIncludes, (res.errors[0] || '').slice(0, 14) + '…', res.errors.some((e) => e.includes(c.errorIncludes)));
      for (const [name, exp] of Object.entries(c.status || {})) {
        const ch = res.checks.find((x) => x.name === name);
        add('status: ' + name, exp, ch ? ch.status : 'missing', !!ch && ch.status === exp);
      }
      for (const [name, exp] of Object.entries(c.dc || {})) {
        const ch = res.checks.find((x) => x.name === name);
        add('D/C: ' + name, exp, ch ? ch.dc : NaN, !!ch && Math.abs(ch.dc - exp) / Math.abs(exp) <= TOL);
      }
      if ('pass' in c) { const got = res.verdict ? res.verdict.pass : null; add('verdict', c.pass ? 'ADEQUATE' : c.pass === false ? 'NOT ADEQUATE' : 'none', got ? 'ADEQUATE' : got === false ? 'NOT ADEQUATE' : 'none', got === c.pass); }
      if (c.governing) add('governing', c.governing, res.verdict && res.verdict.governing, !!res.verdict && res.verdict.governing === c.governing);
      if (c.equilibrium) {
        // total compression = total tension within 0.1% (hand-off Section 12.3)
        const C = vals.Ctotal, T = vals.Ttotal;
        add('equilibrium C = T', T, C, typeof C === 'number' && typeof T === 'number' && Math.abs(C - T) / Math.abs(T) <= EQ_TOL);
      }
      // every step must carry a clause key that exists in the edition
      const badClause = res.steps.concat(res.checks).find((x) => !x.clause || !edition.clauses[x.clause]);
      add('clause keys', 'all known', badClause ? 'unknown: ' + badClause.clause : 'all known', !badClause);
      const text = JSON.stringify(res, (k, val) => (typeof val === 'number' && !isFinite(val) && k !== 'dc' ? 'NONFINITE' : val));
      const leaks = res.ok && /"v":"NONFINITE"/.test(text);
      add('finite step values', 'yes', leaks ? 'no' : 'yes', !leaks);
    }
    if (bad) casesFailed++;
    lines.push(' ' + pad(c.id, 9) + pad(c.name || '', 62) + (bad ? 'FAIL' : 'pass'));
    lines.push('   ' + pad('value', 30) + pad('expected', 16) + pad('got', 16));
    rows.forEach((r) => lines.push(r));
  }
}
lines.push('', `${cases} cases, ${casesFailed} failed; ${total} comparisons, ${failed} failed. Tolerance ${TOL * 100}%.`);
console.log(lines.join('\n'));
process.exitCode = failed ? 1 : 0;
