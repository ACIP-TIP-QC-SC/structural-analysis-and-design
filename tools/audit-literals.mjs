// Usage: node tools/audit-literals.mjs [files...]
// Lists the numeric literals in the calculator files (js/modules/**/*.calc.js by default) other than
// 0, 1, 2, 3, 4, 0.5, 10, 100, 1000, 1e3, 1e6, 1e9, 3.6, Math constants and array indexes. Code factors belong in the
// edition files (js/codes/), so that a new edition is data entry only. The report never fails the run.
// Exports auditLiterals(files) -> [{ file, hits: [{ literal, line }] }].
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set(['0', '1', '2', '3', '4', '0.5', '10', '100', '1000', '1e3', '1e6', '1e9', '3.6']);

// Source with comments and string contents removed (template literals keep their ${...} expressions).
function strip(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); out += src.slice(i, e + 2).replace(/[^\n]/g, ' '); i = e + 2; continue; }
    if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') i++; i++; } i++; out += '""'; continue; }
    if (c === '`') {
      i++; out += '`';
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') {
          let d = 1, j = i + 2;
          while (d && j < src.length) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; }
          out += ' ' + strip(src.slice(i + 2, j - 1)) + ' '; i = j; continue;
        }
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i++; out += '`'; continue;
    }
    if (c === '/' && /[=(,:;!&|?{}[]\s*$/.test(out)) { i++; while (i < src.length && src[i] !== '/') { if (src[i] === '\\') i++; i++; } i++; out += '/re/'; continue; }
    out += c; i++;
  }
  return out;
}

export function auditFile(file) {
  const s = strip(readFileSync(file, 'utf8')), hits = [];
  const re = /(^|[^\w.$])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w.])/g;
  let m;
  while ((m = re.exec(s))) {
    const lit = m[2];
    if (ALLOWED.has(lit)) continue;
    if (/\[\s*$/.test(s.slice(0, m.index + m[1].length))) continue;   // array index
    hits.push({ literal: lit, line: s.slice(0, m.index).split('\n').length });
  }
  return hits;
}

export function calcFiles(dir = join(root, 'js', 'modules')) {
  const out = [];
  readdirSync(dir).forEach((f) => { const p = join(dir, f); if (statSync(p).isDirectory()) out.push(...calcFiles(p)); else if (f.endsWith('.calc.js')) out.push(p); });
  return out.sort();
}

export function auditLiterals(files = calcFiles()) { return files.map((file) => ({ file: relative(root, file), hits: auditFile(file) })); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const rep = auditLiterals(args.length ? args.map((a) => join(process.cwd(), a)) : undefined);
  let n = 0;
  rep.forEach((r) => { n += r.hits.length; console.log(r.file + ': ' + (r.hits.length ? r.hits.map((h) => h.literal + ' (line ' + h.line + ')').join(', ') : 'none')); });
  console.log('\n' + rep.length + ' files, ' + n + ' literals outside the allowed list (a report; it does not fail the run).');
}
