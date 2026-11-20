// Load combinations of the governing code. Pure calculation.
// The combinations themselves are data in the edition file; this file only evaluates them.
import { S, v, u, recorder, blank, fail, res, finite } from '../../core/steps.js';

const LETTERS = 'abcdefgh';

// Expand "or" terms into separate alternatives (the last "or" varies fastest).
function alternatives(node) {
  if (typeof node === 'string') return [node];
  if (node.or) return node.or.flatMap(alternatives);
  if (node.sum) return node.sum.reduce((acc, child) => acc.flatMap((done) => alternatives(child).map((c) => done.concat([c]))), [[]]).map((list) => ({ sum: list }));
  return alternatives(node.x).map((x) => Object.assign({}, node, { x }));
}
function symbolsOf(node, out = []) {
  if (typeof node === 'string') { if (!out.includes(node)) out.push(node); } else if (node.sum) node.sum.forEach((c) => symbolsOf(c, out)); else symbolsOf(node.x, out);
  return out;
}
const coef = (c, f1) => (c === 'f1' ? f1 : c);
function evaluate(node, val, f1) {
  if (typeof node === 'string') return val[node] || 0;
  if (node.sum) return node.sum.reduce((t, c) => t + evaluate(c, val, f1), 0);
  if ('mul' in node) return coef(node.mul, f1) * evaluate(node.x, val, f1);
  return evaluate(node.x, val, f1) / node.div;
}
// Token list of the expression, with symbols (val = null) or with numbers.
function show(node, val, f1, q, top) {
  if (typeof node === 'string') return val ? (val[node] < 0 ? ['(', v(val[node], q), ')'] : [v(val[node], q)]) : [node];
  if (node.sum) {
    const inner = node.sum.flatMap((c, i) => (i ? [' + '] : []).concat(show(c, val, f1, q, false)));
    return top ? inner : ['('].concat(inner, [')']);
  }
  const x = show(node.x, val, f1, q, false);
  if ('div' in node) return x.concat([' / ', v(node.div)]);
  const c = node.mul === 'f1' ? (val ? [v(f1)] : ['f1']) : [v(node.mul)];
  if (node.mul === 1 && !val) return x;
  return c.concat([typeof node.x === 'string' && val ? ' · ' : ' '], x);
}

// All rows of one combination set. loadsIn: { D, L, ... }.
export function evaluateSet(set, loadsIn, f1, reversible, q = 'ratio') {
  const rows = [];
  set.forEach((combo) => {
    const alts = alternatives(combo.expr);
    alts.forEach((alt, i) => {
      const id = combo.eq + (alts.length > 1 ? LETTERS[i] : '');
      const rev = symbolsOf(alt).filter((sym) => reversible.includes(sym) && loadsIn[sym] !== 0);
      const signs = rev.length ? [1, -1] : [1];
      signs.forEach((sg) => {
        const val = Object.assign({}, loadsIn);
        rev.forEach((sym) => { val[sym] = sg * loadsIn[sym]; });
        rows.push({ id: id + (sg < 0 ? '(-' + rev.join(',') + ')' : ''), eq: combo.eq, label: 'Eq. ' + id + (sg < 0 ? ' with −' + rev.join(', −') : ''),
          formula: show(alt, null, f1, q, true), substitution: show(alt, val, f1, q, true), value: evaluate(alt, val, f1) });
      });
    });
  });
  return rows;
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, LD = ed.loads, mode = input.mode || 'strength', q = input.quantity || 'force';
  // Special seismic (203.5): D, L and Em only; Em acts in either direction like W and E.
  const special = mode === 'special';
  const names = special ? ['D', 'L', 'Em'] : LD.symbols.map((x) => x[0]);
  if (!finite(input, names) || !(input.f1 > 0)) return { vals: { error: true }, result: fail(['Every load needs a number. Use 0 for a load that does not act.']) };
  const loadsIn = {};
  names.forEach((k) => { loadsIn[k] = input[k]; });
  const set = special ? LD.special : mode === 'basic' ? LD.basic : mode === 'alternate' ? LD.alternate : LD.strength;
  const clause = special ? 'loads.special' : mode === 'basic' ? 'loads.allowable' : mode === 'alternate' ? 'loads.alternate' : 'loads.strength';
  const rows = evaluateSet(set, loadsIn, input.f1, special ? LD.reversible.concat(['Em']) : LD.reversible, q);
  const out = blank(), rec = recorder(), vals = { rows: {} };
  let max = rows[0], min = rows[0];
  rows.forEach((r) => { vals.rows[r.id] = r.value; if (r.value > max.value) max = r; if (r.value < min.value) min = r; });
  const specialNote = special ? 'Use these only where 203.5 or the material chapters require Em (for example elements supporting discontinuous systems). ' : '';
  rows.forEach((r) => rec.add(r.label, ['U = '].concat(r.formula), ['U = '].concat(r.substitution), S`U = ${u(r.value, q)}`, clause,
    specialNote + (r === max ? 'Governing (maximum).' : r === min ? 'Governing (minimum), for uplift and overturning checks.' : '')));
  vals.max = max.value; vals.min = min.value; vals.maxId = max.id; vals.minId = min.id;
  out.steps = rec.steps;
  out.results = [res('Governing maximum (' + max.label + ')', max.value, q), res('Governing minimum (' + min.label + ')', min.value, q), res('f1', input.f1)];
  out.notes.push(special ? 'Em acts in either direction, so each combination is evaluated with +Em and −Em. Use these only where 203.5 or the material chapters require Em (for example elements supporting discontinuous systems).'
    : 'W and E act in either direction, so every combination that contains them is evaluated with both signs.');
  if (mode === 'basic') out.notes.push('No stress increase is allowed with the basic allowable combinations (' + ed.clauses['loads.allowable'].nscp + ').');
  out.diagram = {
    rows: rows.map((r) => ({ id: r.id, label: r.label, value: r.value, max: r === max, min: r === min })), q,
    chips: [[special ? 'Special seismic (203.5)' : mode === 'strength' ? 'Strength design or LRFD' : mode === 'basic' ? 'Allowable, basic' : 'Allowable, alternate basic'], S`f1 = ${input.f1}`],
    tables: [{
      title: 'Load combinations', head: ['Eq.', 'Combination', 'With numbers', 'Result', ''],
      rows: rows.map((r) => ({ hl: r === max || r === min, cells: [r.label.replace('Eq. ', ''), r.formula, r.substitution, u(r.value, q), r === max ? 'Governing (maximum)' : r === min ? 'Governing (minimum)' : ''] })),
      note: mode === 'basic' ? LD.basicNote : mode === 'alternate' ? LD.alternateNote : ''
    }]
  };
  if (mode === 'strength' && max.value > 0) {
    if (q === 'moment') out.send.push({ to: 'rc/beam-flexure', mode: 'singly', label: 'Use the governing moment as Mu in Beam flexure', values: { Mu: max.value } });
    if (q === 'force') {
      out.send.push({ to: 'rc/shear-torsion', mode: 'shear', label: 'Use the governing force as Vu in Shear and torsion', values: { Vu: max.value } });
      out.send.push({ to: 'found/isolated', mode: 'design', label: 'Use the governing force as Pu in Isolated footings', values: { PD: loadsIn.D, PL: loadsIn.L, Pu: max.value } });
    }
  }
  return { vals, result: out };
}
