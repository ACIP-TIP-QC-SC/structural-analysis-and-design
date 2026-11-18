// Bars (axial) by the direct stiffness method (Kassimali Ch. 3; hand-off Section 9).
// Pure: no DOM, no rounding. Inputs in the calc's consistent units (see dsm.js):
//   joints (nodes): [{ id, support: 'free' | 'fixed', FX, settle }]   (X comes from the element lengths)
//   members (elements): [{ i (1st node, left), j (2nd node), E, A or d, L }]
//   memberLoads: [{ member, w1, w2, P, a, alpha, dT, e0 }]   (+ to the right; e0 > 0: the element is too long)
import { run as analyse, normalise, isNum } from './analysis.js';
import { fail } from '../../core/steps.js';

const ALPHA_SLIP = 1e-3;   // an α of 0.001 per degree or more is a typing slip (reference Section 5.3)

// A used: A if given, else πd²/4.
export const areaOf = (m) => (isNum(m.A) && m.A > 0 ? m.A : isNum(m.d) && m.d > 0 ? Math.PI * m.d * m.d / 4 : NaN);

// Node positions from the element lengths: the lowest-numbered node of each connected piece at X = 0.
export function nodePositions(members, errors) {
  const x = new Map(), used = new Set();
  members.forEach((m) => { if (isNum(m.i)) used.add(m.i); if (isNum(m.j)) used.add(m.j); });
  const ok = members.filter((m) => isNum(m.i) && isNum(m.j) && isNum(m.L) && m.L > 0 && m.i !== m.j);
  [...used].sort((p, q) => p - q).forEach((start) => {
    if (x.has(start)) return;
    x.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      ok.forEach((m) => {
        let other = null, pos = null;
        if (m.i === n) { other = m.j; pos = x.get(n) + m.L; } else if (m.j === n) { other = m.i; pos = x.get(n) - m.L; } else return;
        if (!x.has(other)) { x.set(other, pos); queue.push(other); }
        else if (Math.abs(x.get(other) - pos) > 1e-9 * Math.max(1, Math.abs(pos))) {
          const msg = 'The element lengths do not fit together at node ' + other + ' (element ' + m.id + ' puts it at a different X): check the lengths of the elements between the same nodes.';
          if (!errors.includes(msg)) errors.push(msg);
        }
      });
    }
  });
  return x;
}

function build(input) {
  const kind = 'bar';
  const units = input.units === 'US' || input.units === 'SI' ? input.units : 'consistent';
  const pre = [];
  const rawM = (input.members || []).map((r, k) => Object.assign({}, r, { id: isNum(r.id) ? r.id : k + 1 }));
  rawM.forEach((m) => {
    const miss = ['i', 'j', 'E', 'L'].filter((c) => !isNum(m[c]));
    if (miss.length) pre.push('Element ' + m.id + ': ' + miss.join(', ') + (miss.length > 1 ? ' need numbers.' : ' needs a number.'));
    else if (!(m.L > 0)) pre.push('Element ' + m.id + ': L must be a number above zero.');
    if (!isNum(areaOf(m))) pre.push('Element ' + m.id + ': give the area A or the diameter d.');
  });
  const X = nodePositions(rawM, pre);
  const nodes = (input.joints || []).map((r, k) => {
    const id = isNum(r.id) ? r.id : k + 1;
    ['FX', 'settle'].forEach((c) => { if (r[c] !== '' && r[c] != null && !isNum(r[c])) pre.push('Node ' + id + ': ' + (c === 'FX' ? 'F' : 'the prescribed displacement') + ' is not a number.'); });
    return Object.assign({}, r, { id, x: X.has(id) ? X.get(id) : 0 });
  });
  const { joints, members } = normalise({ joints: nodes, members: rawM.map((m) => Object.assign({}, m, { A: areaOf(m) })) }, kind);
  // element loads -> local items
  const items = {}, draw = [];
  (input.memberLoads || []).forEach((ld, k) => {
    const m = members.find((x) => x.id === ld.member), lab = 'Load row ' + (k + 1) + ' (element ' + ld.member + ')';
    if (!m) { pre.push('Load row ' + (k + 1) + ': element ' + ld.member + ' is not in the element table.'); return; }
    const num = (c) => (ld[c] === '' || ld[c] == null ? 0 : ld[c]);
    const bad = ['w1', 'w2', 'P', 'a', 'alpha', 'dT', 'e0'].filter((c) => !isNum(num(c)));
    if (bad.length) { pre.push(lab + ': ' + bad.join(', ') + (bad.length > 1 ? ' are' : ' is') + ' not a number.'); return; }
    const L = rawM.find((x) => x.id === m.id).L, w1 = num('w1'), w2 = num('w2'), P = num('P'), a = num('a'), al = num('alpha'), dT = num('dT'), e0 = num('e0');
    const its = [];
    if (w1 || w2) its.push({ kind: 'wx', a: 0, b: L, w1, w2 });
    if (P) its.push({ kind: 'px', a, P });
    if ((al && !dT) || (!al && dT)) pre.push(lab + ': give both α and ΔT, or neither.');
    if (Math.abs(al) >= ALPHA_SLIP) pre.push(lab + ': α = ' + al + ' per degree looks like a typing slip (steel is about 0.0000117 per °C). Enter α as a number below ' + ALPHA_SLIP + '.');
    const eps = al * dT + e0 / L;
    if (eps) its.push({ kind: 'strain', a: 0, F0: m.E * m.A * eps, eps, alpha: al, dT, e0 });
    its.forEach((it) => { it.label = lab; });
    (items[m.id] = items[m.id] || []).push(...its);
    its.forEach((it) => { if (it.kind !== 'strain') draw.push(Object.assign({ member: m.id, dir: [1, 0] }, it)); else draw.push({ member: m.id, kind: 'strain', a: 0, eps, alpha: al, dT, e0, dir: [1, 0] }); });
  });
  const out = analyse({ kind, units, input, model: { joints, members, items }, loadRows: draw, preErrors: pre });
  if (out.vals) {
    // axial force and stress at both nodes of each element (stress = N / A, in force / length²)
    out.vals.N1 = {}; out.vals.N2 = {}; out.vals.S1 = {}; out.vals.S2 = {};
    out.r.diagram.res.forEach((m) => {
      const n1 = -m.Q6[0], n2 = m.Q6[3];
      out.vals.N1[m.id] = n1; out.vals.N2[m.id] = n2; out.vals.S1[m.id] = n1 / m.A; out.vals.S2[m.id] = n2 / m.A;
    });
  }
  return out;
}

export function run(input) {
  try {
    const { r, vals } = build(input);
    return { vals: vals || {}, result: r };
  } catch (e) {
    return { vals: {}, result: fail(['The bar could not be analysed (' + e.message + ').']) };
  }
}
export const compute = (input) => run(input).vals;
export const solve = (input) => run(input).result;
