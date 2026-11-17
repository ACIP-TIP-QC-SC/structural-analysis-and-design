// Usage: node tools/build-shapes.mjs data/steel-shapes.csv > data/steel-shapes.json
// Keeps the units of the CSV. Blank cells become null. Unknown columns are carried through.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node tools/build-shapes.mjs data/steel-shapes.csv > data/steel-shapes.json'); process.exit(2); }
const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
const head = lines[0].split(',').map((s) => s.trim());
const TEXT = new Set(['designation', 'type', 'us_name']);
const rows = lines.slice(1).map((line) => {
  const cells = line.split(',');
  const o = {};
  head.forEach((k, i) => {
    const c = (cells[i] ?? '').trim();
    if (c === '') o[k] = null;
    else if (TEXT.has(k)) o[k] = c;
    else { const n = Number(c); o[k] = Number.isFinite(n) ? n : c; }
  });
  return o;
});
process.stdout.write('[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
