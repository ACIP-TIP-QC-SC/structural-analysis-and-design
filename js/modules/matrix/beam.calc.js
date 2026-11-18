// Beams by the direct stiffness method (Kassimali Ch. 5; releases 7.1; support movements 7.3).
// Pure: no DOM, no rounding. Inputs follow hand-off 5.1 in the calc's consistent units (see dsm.js).
// Mode 'joints' takes the joint, element and load tables; mode 'spans' builds them first (beamSpans.js).
import { run as analyse, normalise, cellErrors, isNum } from './analysis.js';
import { generate } from './beamSpans.js';
import { fail } from '../../core/steps.js';

export const LOAD_TYPES = { point: 'Point load', couple: 'Couple', uniform: 'Uniform load', linear: 'Linear load' };

// Member loads -> local items (+y up, couples ccw), with the checks that need the input rows.
export function beamItems(rows, members, joints, errors) {
  const J = new Map(joints.map((j) => [j.id, j])), items = {}, draw = [];
  (rows || []).forEach((ld, k) => {
    const lab = 'Load row ' + (k + 1) + ' (element ' + ld.member + ')';
    const m = members.find((x) => x.id === ld.member);
    if (!m) { errors.push('Load row ' + (k + 1) + ': element ' + ld.member + ' is not in the element table.'); return; }
    if (!LOAD_TYPES[ld.type]) { errors.push('Load row ' + (k + 1) + ': choose a load type.'); return; }
    if (!isNum(ld.value)) { errors.push('Load row ' + (k + 1) + ': the value needs a number.'); return; }
    const a = J.get(m.i), b = J.get(m.j), L = a && b ? b.x - a.x : NaN;
    const s = isNum(ld.a) ? ld.a : 0, e = isNum(ld.b) ? ld.b : L, v = ld.value;
    let it;
    if (ld.type === 'point') it = { kind: 'py', a: s, P: v };
    else if (ld.type === 'couple') it = { kind: 'm', a: s, M: v };
    else if (ld.type === 'uniform') it = { kind: 'wy', a: s, b: e, w1: v, w2: v };
    else { if (!isNum(ld.w2)) { errors.push('Load row ' + (k + 1) + ': a linear load needs w2.'); return; } it = { kind: 'wy', a: s, b: e, w1: v, w2: ld.w2 }; }
    it.label = lab;
    (items[m.id] = items[m.id] || []).push(it);
    draw.push(Object.assign({ member: m.id, dir: [0, 1] }, it));
  });
  return { items, draw };
}

function build(input) {
  const kind = 'beam';
  const units = input.units === 'US' || input.units === 'SI' ? input.units : 'consistent';
  let src = input, pre = [];
  if (input.mode === 'spans') {
    const gen = generate(input);
    if (gen.errors.length) return { r: fail(gen.errors.slice(0, 14)), vals: null };
    src = Object.assign({}, input, { joints: gen.joints, members: gen.members, memberLoads: gen.memberLoads });
  } else pre = cellErrors(input, kind);
  const { joints, members } = normalise(src, kind);
  const { items, draw } = beamItems(src.memberLoads, members, joints, pre);
  const out = analyse({ kind, units, input: src, model: { joints, members, items }, loadRows: draw, preErrors: pre });
  if (input.mode === 'spans') out.r.diagram.generated = { joints: src.joints, members: src.members, memberLoads: src.memberLoads };
  return out;
}

export function run(input) {
  try {
    const { r, vals } = build(input);
    return { vals: vals || {}, result: r };
  } catch (e) {
    return { vals: {}, result: fail(['The beam could not be analysed (' + e.message + ').']) };
  }
}
export const compute = (input) => run(input).vals;
export const solve = (input) => run(input).result;
