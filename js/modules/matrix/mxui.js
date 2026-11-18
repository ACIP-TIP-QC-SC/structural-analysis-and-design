// UI shared by the Matrix Analysis calculators: the units choice, conversion to the calc's units,
// fixed-decimal formatting with direction marks, the Signs card, result tables, the Matrices card and
// the report sections (hand-off 5.2, 7.4 and 7.6).
import { h } from '../../ui/dom.js';
import { QUANTITIES, fromSI, unitLabel } from '../../core/units.js';
import { fmt } from '../../core/format.js';
import { fail } from '../../core/steps.js';
import { matrixBlock, matrixTable, matrixStrips, partitionLegend, fmtMx } from './matrixTable.js';
import { SUPPORT_LABELS, dofType } from './analysis.js';
import { findShape } from '../../ui/shapepicker.js';
import { shapeValue } from '../../core/shapes.js';
import * as store from '../../core/storage.js';

// ---------------------------------------------------------------- units
export const unitsField = () => ({
  key: 'units', type: 'select', step: 'Setup', label: 'Units', wide: true, default: 'site',
  options: [{ value: 'site', label: 'SI or English, as chosen in the top bar' }, { value: 'consistent', label: 'Consistent units (any one force unit and one length unit)' }],
  hint: 'Consistent units: numbers are used exactly as typed (E in force/length², A in length², I in length⁴), for book problems given with E = A = 1 or EI constant.'
});
export const unitsOf = (vals) => (vals && vals.units === 'consistent' ? 'consistent' : 'site');
export const modeUnits = (input, sys) => (input.units === 'consistent' ? 'consistent' : sys === 'US' ? 'US' : 'SI');
// Column quantity: none in Consistent units.
export const qf = (vals) => (q) => (unitsOf(vals) === 'consistent' ? 'ratio' : q);

// SI display units (what siInput hands over) -> the calc's kN and m.
// Lengths, forces, moments and line loads are already kN and m; E, A, I and movements are converted.
const TO_CALC = { E: 1000, A: 1e-6, I: 1e-12, settleX: 1e-3, settleY: 1e-3, settle: 1e-3, d: 1e-3 };
export function toCalc(input, units) {
  if (units === 'consistent') return Object.assign({}, input, { units });
  const conv = (rows) => rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const o = Object.assign({}, r);
    Object.keys(TO_CALC).forEach((k) => { if (typeof o[k] === 'number' && isFinite(o[k])) o[k] = o[k] * TO_CALC[k]; });
    return o;
  });
  const out = Object.assign({}, input, { units });
  Object.keys(out).forEach((k) => { if (Array.isArray(out[k])) out[k] = conv(out[k]); });
  return out;
}

// Solve through the calc, then write the key results with fixed decimals and direction marks.
export function solveWith(calcSolve, input, ctx) {
  const sys = ctx && ctx.sys === 'US' ? 'US' : 'SI';
  const units = modeUnits(input, sys);
  let r;
  try { r = calcSolve(toCalc(input, units)); } catch (e) { return fail(['The model could not be analysed (' + e.message + ').']); }
  r.diagram.sys = sys;
  if (r.ok) r.results = r.results.map((x) => Object.assign({}, x, { value: keyText(x, sys, units), q: 'text' }));
  return r;
}

// ---------------------------------------------------------------- formatting
const fixed = (x, d) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : x.toFixed(d)).replace('-', '−');
// kind: F force, M moment, d displacement, r rotation, L length; values in calc units (kN, m).
export function fmtVal(x, kind, sys, units, withUnit = true) {
  if (typeof x !== 'number' || !isFinite(x)) return '–';
  const cons = units === 'consistent';
  let val = x, dec = 4, un = '';
  if (kind === 'F') { if (!cons) { val = fromSI(x, 'force', sys); un = unitLabel('force', sys); } }
  else if (kind === 'M') { if (!cons) { val = fromSI(x, 'moment', sys); un = unitLabel('moment', sys); } }
  else if (kind === 'r') { dec = 6; un = cons ? '' : 'rad'; }
  else if (kind === 'd') { if (cons) dec = 6; else { val = fromSI(x * 1000, 'disp', sys); un = unitLabel('disp', sys); } }
  else if (kind === 'dm') { dec = 6; if (!cons) { val = fromSI(x, 'length_m', sys); un = unitLabel('length_m', sys); } }
  else if (kind === 'L') { dec = 3; if (!cons) { val = fromSI(x, 'length_m', sys); un = unitLabel('length_m', sys); } }
  else if (kind === 'S') { if (!cons) { val = fromSI(x / 1000, 'stress', sys); un = unitLabel('stress', sys); } }   // kPa -> MPa
  const s = fixed(val, dec);
  return withUnit && un ? s + ' ' + un : s;
}
// Direction mark of a named value: → ← for horizontal, ↑ ↓ for vertical, ccw / cw for rotations and moments.
export function mark(name, x) {
  if (!x) return '';
  if (/^(Uh|Fh|FX|U|F)\d/.test(name)) return x > 0 ? ' →' : ' ←';
  if (/^(Uv|Fv|FY)\d/.test(name)) return x > 0 ? ' ↑' : ' ↓';
  if (/^(D|M)\d/.test(name)) return x > 0 ? ' ccw' : ' cw';
  return '';
}
const kindOfName = (nm) => (/^M\d/.test(nm) ? 'M' : /^D\d/.test(nm) ? 'r' : /^F/.test(nm) ? 'F' : 'd');
function keyText(x, sys, units) {
  const s = x.symbol || '';
  if (s === 'Nmax') return fmtVal(x.value, 'F', sys, units) + (x.value > 0 ? ' (T)' : x.value < 0 ? ' (C)' : '');
  if (s === 'Vmax') return fmtVal(x.value, 'F', sys, units);
  if (s === 'Mmax') return fmtVal(x.value, 'M', sys, units);
  if (s === 'Dmax') return fmtVal(x.value, 'd', sys, units);
  if (s === 'Lmax') return fmtVal(x.value, 'L', sys, units);
  if (s === 'Smax') return fmtVal(x.value, 'S', sys, units) + (x.value > 0 ? ' (T)' : x.value < 0 ? ' (C)' : '');
  return fmtVal(x.value, kindOfName(s), sys, units) + mark(s, x.value);
}

// Matrix and vector entries in the calc set: kN and m (SI), kip and ft (English), as typed (Consistent).
const fF = QUANTITIES.force.f, fL = QUANTITIES.length_m.f, fM = QUANTITIES.moment.f;
export function mxScale(sys, units) {
  if (units === 'consistent' || sys !== 'US') return { K: () => 1, P: () => 1, U: () => 1, label: units === 'consistent' ? 'consistent units' : 'kN and m, rotations in rad' };
  const force = (t) => (t === 'r' ? 1 / fM : 1 / fF), disp = (t) => (t === 'r' ? 1 : 1 / fL);
  return { K: (rn, cn) => force(dofType(rn)) / disp(dofType(cn)), P: (nm) => force(dofType(nm)), U: (nm) => disp(dofType(nm)), label: 'kip and ft, rotations in rad' };
}
const scaleM = (M, rows, cols, f) => M.map((row, i) => Array.from(row).map((x, j) => x * f(rows[i], cols[j])));

// ---------------------------------------------------------------- cards
export const SIGNS = {
  truss: 'Global X right, Y up. Uh, Fh, FX + to the right; Uv, Fv, FY + up. Axial force + tension (T), − compression (C).',
  beam: 'Forces, loads, Uv + up; moments, rotations D + counterclockwise. The first joint of an element is its left end. Member end forces Q = [V1, M1, V2, M2] up / ccw +. Diagrams: V + when the left face is pushed up, M + sagging. A downward 20 kN/m load is typed −20.',
  frame: 'Global X right, Y up; joint loads, reactions, displacements + along +X, +Y, moments + ccw. Local x runs from joint b to joint e, local y is x turned 90° ccw. Member end forces Q = [Q1 … Q6] = local x, y, ccw moment at b, then at e. N + tension, V = Q2 at b, M sagging +. Local member loads keep the book\'s signs: perpendicular load + toward −y, axial load + toward −x, couple + clockwise. Global loads use joint-load signs (gravity negative, global couple ccw +).',
  bar: 'Displacements, forces and loads + to the right; the first node of an element is its left end; tension +.'
};
export function signsCard(kind, extra) {
  return h('section', { class: 'card o-res mx-signs', 'aria-label': 'Signs' }, h('h3', { class: 'h3' }, 'Signs'), h('p', { class: 'small', style: 'margin:0' }, SIGNS[kind]), extra ? h('p', { class: 'muted small', style: 'margin:6px 0 0' }, extra) : null);
}

function table(title, head, rows, note) {
  return h('section', { class: 'card', 'aria-label': title }, h('h3', { class: 'h3' }, title),
    h('div', { class: 'tblwrap scrollx' }, h('table', { class: 'tbl mx-tbl' }, h('thead', null, h('tr', null, head.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', { class: r.hl ? 'hl' : null }, r.cells.map((c) => h('td', null, c))))))),
    note ? h('p', { class: 'tblnote' }, note) : null);
}

// Joint displacements, reactions and member results as [title, head, rows, note] (screen and report).
export function resultTables(r, sys) {
  const D = r.diagram, kind = D.kind, units = D.units, out = [];
  if (!r.ok || !D.res) return out;
  const nd = { truss: 2, beam: 2, frame: 3, bar: 1 }[kind];
  const supLabel = SUPPORT_LABELS[kind];
  const jById = new Map(D.joints.map((j) => [j.id, j]));
  const dispHead = { truss: ['Uh', 'Uv'], beam: ['Uv', 'D'], frame: ['Uh', 'Uv', 'D'], bar: ['U'] }[kind];
  const dunit = units === 'consistent' ? '' : ' (' + unitLabel('disp', sys) + (kind === 'beam' || kind === 'frame' ? ', rad' : '') + ')';
  const jw = kind === 'bar' ? 'Node' : 'Joint';
  out.push([jw + ' displacements' + dunit, [jw, 'Support'].concat(dispHead), D.ids.map((id) => {
    const j = jById.get(id);
    const cells = [String(id), supLabel[j.support] + (j.support === 'inclined' ? ' (' + fmt(j.angle) + '°)' : '')];
    for (let d = 0; d < nd; d++) {
      const q = D.dofNames.findIndex((nm, k) => D.dofJoint[k] === id && nm.startsWith(dispHead[d]));
      const nm = D.dofNames[q], x = D.U[q];
      if (D.clamps.includes(id) && dispHead[d] === 'D') cells.push('n/a (hinge)');
      else cells.push(fmtVal(x, dispHead[d] === 'D' ? 'r' : 'd', sys, units, false) + mark(nm, x));
    }
    return { cells };
  }), 'Held DOFs show their prescribed value (0 unless a settlement or rotation is given).']);
  out.push(['Support reactions', ['Reaction', jw, 'Value'], D.reactions.map((x) => ({
    cells: [x.name + (x.clamp ? ' (imaginary clamp at the hinge), must be 0' : x.normal ? ' (normal to the incline)' : ''), String(x.joint), fmtVal(x.value, /^M/.test(x.name) ? 'M' : 'F', sys, units) + mark(x.name, x.value)]
  }))]);
  if (kind === 'bar') {
    const dl = units === 'consistent' ? '' : ' (' + unitLabel('disp', sys) + ')';
    const nMax = Math.max(1e-300, ...D.res.flatMap((m) => [Math.abs(m.Q6[0]), Math.abs(m.Q6[3])]));
    const tc = (x) => (Math.abs(x) <= 1e-6 * nMax ? 'Zero' : x > 0 ? 'T' : 'C');
    out.push(['Element forces and stresses', ['Element', 'Nodes', 'u at 1st' + dl, 'u at 2nd' + dl, 'N at 1st', 'N at 2nd', 'Stress at 1st', 'Stress at 2nd', 'State'],
      D.res.map((m) => {
        const n1 = -m.Q6[0], n2 = m.Q6[3], s1 = tc(n1), s2 = tc(n2);
        return { cells: [String(m.id), m.i + ' → ' + m.j, fmtVal(m.v[0], 'd', sys, units, false), fmtVal(m.v[1], 'd', sys, units, false), fmtVal(n1, 'F', sys, units), fmtVal(n2, 'F', sys, units),
          fmtVal(n1 / m.A, 'S', sys, units) + (s1 === 'Zero' ? '' : ' (' + s1 + ')'), fmtVal(n2 / m.A, 'S', sys, units) + (s2 === 'Zero' ? '' : ' (' + s2 + ')'), s1 === s2 ? s1 : s1 + ' / ' + s2] };
      }), 'N at the 1st node = k(u2 − u1) − Pf1, at the 2nd node = k(u2 − u1) + Pf2; tension +. σ = N/A' + (units === 'consistent' ? '.' : ' in ' + unitLabel('stress', sys) + '.')]);
  } else if (kind === 'truss') {
    const nMax = Math.max(...D.res.map((m) => Math.abs(m.N)));
    const dl = units === 'consistent' ? '' : ' (' + unitLabel('disp', sys) + ')';
    out.push(['Member forces', kind === 'truss' ? ['Member', 'Joints', 'u at b' + dl, 'v at b' + dl, 'u at e' + dl, 'v at e' + dl, 'Axial force N', 'State'] : ['Element', 'Nodes', 'u at 1' + dl, 'u at 2' + dl, 'Axial force N', 'State'],
      D.res.map((m) => {
        const st = Math.abs(m.N) < 1e-6 * nMax || m.N === 0 ? 'Zero' : m.N > 0 ? '(T)' : '(C)';
        return { cells: [String(m.id), m.i + ' → ' + m.j].concat(m.v.map((x) => fmtVal(x, 'd', sys, units, false)), [fmtVal(m.N, 'F', sys, units), st]) };
      }), 'End displacements in global axes. N = Q3 = −Q1 (Kassimali truss member end forces), tension +.']);
  } else {
    const isB = kind === 'beam';
    const qh = isB ? ['V1', 'M1', 'V2', 'M2'] : ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
    const qk = (a) => (isB ? (a % 2 ? 'M' : 'F') : (a % 3 === 2 ? 'M' : 'F'));
    out.push(['Member end forces Q (local axes)', [isB ? 'Element' : 'Member', 'Joints'].concat(qh), D.res.map((m) => ({ cells: [String(m.id), m.i + ' → ' + m.j].concat(m.Q.map((x, a) => fmtVal(x, qk(a), sys, units, false))) })),
      isB ? 'Q = [V1, M1, V2, M2], up and counterclockwise positive.' : 'Q = [Q1 … Q6]: local x, y and ccw moment at b, then at e (Kassimali).']);
    out.push([isB ? 'Shear and moment at the element ends (beam convention)' : 'N, V and M at the member ends', [isB ? 'Element' : 'Member'].concat(isB ? [] : ['N at b', 'N at e'], ['V at ' + (isB ? 'left' : 'b'), 'V at ' + (isB ? 'right' : 'e'), 'M at ' + (isB ? 'left' : 'b'), 'M at ' + (isB ? 'right' : 'e')]),
      D.res.map((m) => { const s = m.st, n = s.x.length - 1; return { cells: [String(m.id)].concat(isB ? [] : [fmtVal(s.N[0], 'F', sys, units, false), fmtVal(s.N[n], 'F', sys, units, false)], [fmtVal(s.V[0], 'F', sys, units, false), fmtVal(s.V[n], 'F', sys, units, false), fmtVal(s.M[0], 'M', sys, units, false), fmtVal(s.M[n], 'M', sys, units, false)]) }; }),
      isB ? 'V left = V1, V right = −V2, M left = −M1, M right = M2; M sagging +.' : 'N tension +, V = Q2 at b (beam convention), M sagging +.']);
    out.push(['Member extremes', [isB ? 'Element' : 'Member'].concat(isB ? [] : ['+N (x)', '−N (x)'], ['|V| max (x)', '+M (x)', '−M (x)', 'Largest movement (x)']), D.res.map((m) => {
      const e = m.st.ext, at = (o, k) => fmtVal(o.v, k, sys, units, false) + ' (' + fmtVal(o.x, 'L', sys, units, false) + ')';
      return { cells: [String(m.id)].concat(isB ? [] : [at(e.Nmax, 'F'), at(e.Nmin, 'F')], [at(e.Vabs, 'F'), at(e.Mmax, 'M'), at(e.Mmin, 'M'), at(e.D, 'd')]) };
    }), 'x measured from the ' + (isB ? '1st joint' : 'b end') + (units === 'consistent' ? '.' : ' in ' + unitLabel('length_m', sys) + '. Peak moments are exact (at V = 0).')]);
  }
  return out;
}

// The Matrices card: member matrices, K, the partitioned K, Kpp⁻¹ and the vectors.
export function matricesCard(r, sys) {
  const D = r.diagram, units = D.units, sc = mxScale(sys, units);
  const card = h('section', { class: 'card', 'aria-label': 'Matrices' }, h('h3', { class: 'h3' }, 'Matrices'),
    h('p', { class: 'muted small', style: 'margin:0 0 10px' }, 'Entries in ' + sc.label + '. Rows and columns carry the DOF names.' + (D.rotated ? ' Inclined roller joints use Ut# and Un#: along and normal to the incline.' : '')));
  const det = (title, open, ...kids) => h('details', { class: 'mx-det', open: open ? true : null }, h('summary', null, title), kids);
  const mem = D.res.map((m) => {
    const loc = localNames(D.kind, m);
    const kids = [
      matrixBlock({ title: 'k (local)' + (m.release !== 'none' ? ', modified for the release (MT = ' + m.MT + ')' : ''), rows: loc, cols: loc, data: scaleM(m.k, m.names, m.names, sc.K), label: 'Member ' + m.id + ' k' }),
      D.kind === 'beam' || D.kind === 'bar' ? null : matrixBlock({ title: 'T', rows: loc, cols: loc, data: m.T, label: 'Member ' + m.id + ' T' }),
      matrixBlock({ title: 'K = Tᵀ k T (global)', rows: m.names, cols: m.names, data: scaleM(m.K, m.names, m.names, sc.K), label: 'Member ' + m.id + ' K' })
    ];
    if (m.items.length) kids.push(matrixBlock({ title: 'Qf and Ff = Tᵀ Qf', rows: m.names, cols: ['Qf', 'Ff'], data: m.names.map((nm, a) => [m.Qf[a] * sc.P(nm), m.Ff[a] * sc.P(nm)]), label: 'Member ' + m.id + ' fixed-end forces' }));
    return det((D.kind === 'beam' ? 'Element ' : 'Member ') + m.id + ' (' + m.i + ' → ' + m.j + ')', false, kids);
  });
  card.appendChild(det('Member matrices', false, mem));
  const names = D.dofNames;
  card.appendChild(det('Structure stiffness matrix K (' + names.length + ' × ' + names.length + ')', false,
    matrixBlock({ rows: names, cols: names, data: scaleM(D.K, names, names, sc.K), label: 'Structure stiffness matrix' }),
    matrixBlock({ title: 'Joint loads F, equivalent joint loads Feq and prescribed displacements Us', rows: names, cols: ['F', 'Feq', 'Us'], data: names.map((nm, q) => [D.F[q] * sc.P(nm), D.Feq[q] * sc.P(nm), D.held[q] ? D.Us[q] * sc.U(nm) : '–']), label: 'Load vectors' })));
  const ord = D.order;
  card.appendChild(det('Partitioned K: free (p) then supported (s)', true,
    matrixBlock({ rows: ord, cols: ord, data: scaleM(D.Kpart, ord, ord, sc.K), nFree: D.nFree, label: 'Partitioned stiffness matrix', note: 'Partition order: ' + ord.join(', ') + '.' })));
  const fn = ord.slice(0, D.nFree), sn = ord.slice(D.nFree), rn = D.orderIdx.slice(D.nFree).map((q) => D.rnames[q]);
  const sol = [];
  if (D.KppInv) sol.push(matrixBlock({ title: 'Kpp⁻¹', rows: fn, cols: fn, data: D.KppInv.map((row, i) => row.map((x, j) => x / sc.K(fn[j], fn[i]))), label: 'Inverse of Kpp' }));
  if (fn.length) sol.push(matrixBlock({ title: 'Up = Kpp⁻¹ (Fp + Feq,p − Kps Us)', rows: fn, cols: ['Fp + Feq,p − Kps Us', 'Up'], data: fn.map((nm, a) => [D.rhs[a] * sc.P(nm), D.Up[a] * sc.U(nm)]), label: 'Free displacements' }));
  sol.push(matrixBlock({ title: 'Fs = Ksp Up + Kss Us − Feq,s', rows: rn, cols: ['Us', 'Fs'], data: rn.map((nm, a) => [D.Usp[a] * sc.U(sn[a]), D.Fs[a] * sc.P(sn[a])]), label: 'Reactions' }));
  card.appendChild(det('Solution: Kpp⁻¹, Up and Fs', false, sol));
  return card;
}

function localNames(kind, m) {
  if (kind === 'truss') return ['u_b', 'v_b', 'u_e', 'v_e'];
  if (kind === 'beam') return ['v1', 'θ1', 'v2', 'θ2'];
  if (kind === 'bar') return ['u1', 'u2'];
  return ['u_b', 'v_b', 'θ_b', 'u_e', 'v_e', 'θ_e'];
}

export function resultCards(r, ctx, kind) {
  const sys = ctx.sys;
  const top = [signsCard(kind)];
  if (!r.ok) return { top, bottom: [] };
  const bottom = resultTables(r, sys).map(([t, hd, rows, note]) => table(t, hd, rows, note));
  bottom.push(matricesCard(r, sys));
  return { top, bottom };
}


// ---------------------------------------------------------------- section helper (hand-off 6.1)
// "Fill A and I from…": a steel shape from the site's shape list (A and Ix or Iy), or a rectangle
// b × h (A = bh, I = bh³/12) in steel (E = 200 000 MPa from the edition) or concrete (E = 4700√f′c from
// the edition). Values are written into the chosen rows of the member list (SI display units).
// opts: { listKey, needA, needI, rowWord, keyE }
export function sectionHelper(val, ed, opts) {
  if (val.units === 'consistent') return [];
  const step = opts.step || 'Members', on = !!val.shOpen;
  const f = [{ key: 'shOpen', type: 'check', step, label: 'Fill ' + (opts.needA && opts.needI ? 'A and I' : opts.needA ? 'A' : 'I') + ' from a steel shape or a rectangle', default: false }];
  if (!on) return f.map((x) => Object.assign(x, { noReport: true }));
  f.push({ key: 'shSource', type: 'select', step, label: 'Section', wide: true, default: 'shape', options: [
    { value: 'shape', label: 'Steel shape from the shape list (E = ' + ed.steel.E + ' MPa)' },
    { value: 'rect', label: 'Steel rectangle b × h (E = ' + ed.steel.E + ' MPa)' },
    { value: 'conc', label: 'Concrete rectangle b × h (E = 4700√f′c)' }] });
  f.push({ key: 'shRow', step, label: opts.rowWord + ' (blank = every row)', quantity: 'ratio', optional: true, hint: 'The row number in the table above.' });
  if ((val.shSource || 'shape') === 'shape') {
    f.push({ type: 'shape', key: 'shShape', label: 'Steel shape', step, default: 'W250x73', types: ['W', 'S', 'C', 'L'], props: [
      { key: 'shA', label: 'area', symbol: 'A', quantity: 'area', col: 'A', optional: true },
      { key: 'shIx', label: 'moment of inertia, strong axis', symbol: 'Ix', quantity: 'inertia', col: 'Ix', optional: true },
      { key: 'shIy', label: 'moment of inertia, weak axis', symbol: 'Iy', quantity: 'inertia', col: 'Iy', optional: true }] });
    if (opts.needI) f.push({ key: 'shAxis', type: 'select', step, label: 'Bending about', default: 'x', options: [{ value: 'x', label: 'the strong axis (Ix)' }, { value: 'y', label: 'the weak axis (Iy)' }] });
  } else {
    // optional, so a blank helper never blocks the analysis; Fill checks them
    f.push({ key: 'shB', step, label: 'width b', symbol: 'b', quantity: 'length_mm', optional: true }, { key: 'shH', step, label: 'depth h', symbol: 'h', quantity: 'length_mm', optional: true });
    if (val.shSource === 'conc') f.push({ key: 'shFc', step, label: 'concrete strength', symbol: 'f′c', quantity: 'stress', optional: true, min: 17, max: 70 });
  }
  f.push({ key: 'shFill', noReport: true, type: 'action', step, label: 'Fill ' + (opts.needA && opts.needI ? 'A, I' : opts.needA ? 'A' : 'I') + ' and E', run: (input, ctx) => fillSection(input, ctx, opts) });
  return f.map((x) => Object.assign(x, { noReport: true }, x.props ? { props: x.props.map((pp) => Object.assign({ noReport: true }, pp)) } : {}));
}

function fillSection(input, ctx, opts) {
  const ed = ctx.edition, src = input.shSource || 'shape';
  let A, I, E;
  if (src === 'shape') {
    const custom = input.shShape === 'custom', shape = custom ? null : findShape(input.shShape);
    if (!custom && !shape) { if (typeof window !== 'undefined') window.alert('Pick a steel shape first (the shape list may still be loading).'); return null; }
    A = custom ? input.shA : shapeValue(shape, 'A');
    I = custom ? (input.shAxis === 'y' ? input.shIy : input.shIx) : shapeValue(shape, input.shAxis === 'y' ? 'Iy' : 'Ix');
    E = ed.steel.E;
  } else {
    const b = input.shB, hh = input.shH;
    if (!(b > 0 && hh > 0) || (src === 'conc' && !(input.shFc > 0))) { if (typeof window !== 'undefined') window.alert('Enter b and h' + (src === 'conc' ? ' and f′c' : '') + ' first.'); return null; }
    A = b * hh; I = b * hh * hh * hh / 12;
    E = src === 'conc' ? ed.concrete.Ec(input.shFc) : ed.steel.E;
  }
  if ((opts.needA && !(A > 0)) || (opts.needI && !(I > 0)) || !(E > 0)) { if (typeof window !== 'undefined') window.alert('The section has no usable ' + (opts.needA && !(A > 0) ? 'area' : 'moment of inertia') + '.'); return null; }
  const rows = (input[opts.listKey] || []).map((r) => Object.assign({}, r));
  const only = typeof input.shRow === 'number' && isFinite(input.shRow) ? input.shRow : null;
  rows.forEach((r, k) => {
    if (only != null && k + 1 !== only) return;
    r.E = E;
    if (opts.needA) { r.A = A; if ('d' in r) r.d = ''; }
    if (opts.needI) r.I = I;
  });
  return { [opts.listKey]: rows };
}


// ---------------------------------------------------------------- save, export and import (hand-off 6.1)
// The workspace keeps the inputs in the browser as they are typed (storage.js). A problem can also be
// exported as a small JSON file: the input schema of hand-off 5.1 in the site's SI input units (m, mm,
// mm², mm⁴, MPa, kN, kN·m, kN/m) or as typed in Consistent units, plus { module, mode, units, version: 1 }.
const DATA_KEYS = {
  joints: ['joints', 'members', 'memberLoads'],
  nodes: ['joints', 'members', 'memberLoads'],
  spans: ['leftX', 'rightX', 'spanSupports', 'hinges', 'stretches', 'spanLoads', 'addAtLoads']
};
const clean = (x) => (Array.isArray(x) ? x.map((r) => { const o = {}; Object.keys(r || {}).forEach((k) => { if (r[k] !== '' && r[k] != null) o[k] = r[k]; }); return o; }) : x);
export function problemJSON(moduleId, input) {
  const mode = input.mode || 'joints', out = { module: moduleId, mode, units: input.units === 'consistent' ? 'consistent' : 'SI', version: 1 };
  (DATA_KEYS[mode] || DATA_KEYS.joints).forEach((k) => { if (input[k] !== undefined) out[k] = clean(input[k]); });
  return out;
}
export function readProblem(moduleId, text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { error: 'The file is not a JSON problem file.' }; }
  if (!obj || typeof obj !== 'object') return { error: 'The file is not a JSON problem file.' };
  if (obj.module !== moduleId) return { error: 'This file is for ' + (obj.module || 'another calculator') + ', not ' + moduleId + '.' };
  if (obj.version !== 1) return { error: 'Unknown problem file version (' + obj.version + ').' };
  const mode = obj.mode || 'joints', values = { units: obj.units === 'consistent' ? 'consistent' : 'site' };
  (DATA_KEYS[mode] || DATA_KEYS.joints).forEach((k) => { if (obj[k] !== undefined) values[k] = obj[k]; });
  return { mode, values };
}
export function saveCard(moduleId, ctx) {
  const msg = h('span', { class: 'muted small', role: 'status' });
  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'hide', 'aria-label': 'Problem file to import' });
  const doExport = () => ctx.runAction({ run: (input) => {
    const blob = new Blob([JSON.stringify(problemJSON(moduleId, input), null, 1) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = moduleId.replace('/', '-') + '-' + (input.mode || 'joints') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg.textContent = 'Exported ' + a.download + '.';
    return null;
  } });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => ctx.runAction({ run: (input) => {
      const got = readProblem(moduleId, String(rd.result));
      if (got.error) { msg.textContent = got.error; return null; }
      if (got.mode !== (input.mode || 'joints')) {
        store.set('send.' + moduleId, { mode: got.mode, from: f.name, values: got.values });
        location.hash = '#' + moduleId + '/' + got.mode;
        return null;
      }
      return got.values;
    } });
    rd.readAsText(f);
    file.value = '';
  });
  return h('section', { class: 'card mx-save', style: 'margin-top:12px', 'aria-label': 'Save, load and share' }, h('h3', { class: 'h3' }, 'Save, load and share'),
    h('p', { class: 'muted small', style: 'margin:0 0 8px' }, 'Your inputs are kept in this browser as you type. Export the problem as a JSON file to keep it or send it to someone; Import loads one. Share link (above) puts the inputs in a link.'),
    h('div', { class: 'row', style: 'gap:8px' }, h('button', { type: 'button', class: 'btn', onClick: doExport }, 'Export problem (JSON)'), h('button', { type: 'button', class: 'btn', onClick: () => file.click() }, 'Import problem (JSON)'), file, msg));
}

// ---------------------------------------------------------------- report (hand-off 7.6)
// The input tables (used rows only) from the module's list fields, in the display units.
export function listTables(fieldDefs, vals, sys) {
  const seen = new Set(), out = [];
  fieldDefs.filter((f) => f.type === 'list').forEach((f) => {
    if (seen.has(f.key)) return;
    seen.add(f.key);
    const rows = Array.isArray(vals[f.key]) ? vals[f.key] : [];
    if (!rows.length) return;
    const cols = f.columns.filter((c) => !c.readonly);
    const head = [f.indexLabel || '#'].concat(cols.map((c) => { const un = typeof c.quantity === 'function' ? (c.unitHint ? c.unitHint(sys) : '') : unitLabel(c.quantity, sys); return c.label + (un ? ' (' + un + ')' : ''); }));
    out.push([f.label, head, rows.map((r, i) => [f.rowLabel ? f.rowLabel(r, i) : String(i + 1)].concat(cols.map((c) => {
      if (c.type === 'select') { const o = c.options.find((x) => String(x.value) === String(r[c.key])); return o ? o.label : ''; }
      if (c.enabledIf && !c.enabledIf(r)) return '';
      return typeof r[c.key] === 'number' && isFinite(r[c.key]) ? fmt(r[c.key]) : '';
    })))]);
  });
  return out;
}
export function reportSections(r, ctx, inputTables) {
  const sys = ctx.sys, D = r.diagram, out = [];
  const sec = (title, ...kids) => h('div', { class: 'mx-sec' }, h('h2', null, title), kids);
  const tbl = (head, rows) => h('table', null, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))), h('tbody', null, rows.map((row) => h('tr', null, row.map((c) => h('td', { class: 'mono' }, c))))));
  (inputTables || []).forEach(([t, head, rows]) => out.push(sec(t, tbl(head, rows))));
  if (!r.ok || !D.res) return out;
  const sc = mxScale(sys, D.units);
  const strips = (title, o) => h('div', null, h('div', { class: 'mx-sub' }, title), o.nFree != null ? partitionLegend() : null, matrixStrips(o));
  out.push(sec('Member matrices (' + sc.label + ')', D.res.map((m) => strips((D.kind === 'beam' ? 'Element ' : 'Member ') + m.id + ': K = Tᵀ k T' + (m.release !== 'none' ? ' (modified for the release, MT = ' + m.MT + ')' : ''), { rows: m.names, cols: m.names, data: scaleM(m.K, m.names, m.names, sc.K) }))));
  const names = D.dofNames, ord = D.order;
  out.push(sec('Structure stiffness matrix K', strips('K', { rows: names, cols: names, data: scaleM(D.K, names, names, sc.K) })));
  out.push(sec('Partitioned K: Kpp, Kps, Ksp, Kss', strips('Partition order: ' + ord.join(', '), { rows: ord, cols: ord, data: scaleM(D.Kpart, ord, ord, sc.K), nFree: D.nFree })));
  const fn = ord.slice(0, D.nFree), sn = ord.slice(D.nFree), rn = D.orderIdx.slice(D.nFree).map((q) => D.rnames[q]);
  if (D.KppInv) out.push(sec('Kpp⁻¹', strips('Kpp⁻¹', { rows: fn, cols: fn, data: D.KppInv.map((row, i) => row.map((x, j) => x / sc.K(fn[j], fn[i]))) })));
  out.push(sec('Up and Fs', h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' },
    matrixTable({ rows: fn, cols: ['Up'], data: fn.map((nm, a) => [D.Up[a] * sc.U(nm)]) }),
    matrixTable({ rows: rn, cols: ['Fs'], data: rn.map((nm, a) => [D.Fs[a] * sc.P(sn[a])]) }))));
  resultTables(r, sys).forEach(([t, head, rows, note]) => out.push(sec(t, tbl(head, rows.map((x) => x.cells)), note ? h('p', { class: 'msg' }, note) : null)));
  return out;
}

export { fmtMx };
