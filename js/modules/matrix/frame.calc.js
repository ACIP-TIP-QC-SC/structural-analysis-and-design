// Plane frames by the direct stiffness method (Kassimali Ch. 6; releases 7.1; support movements 7.3;
// inclined rollers 9.4). Pure: no DOM, no rounding. Inputs follow hand-off 5.1 in the calc's consistent
// units (see dsm.js).
import { run as analyse, normalise, cellErrors, isNum } from './analysis.js';
import { fail } from '../../core/steps.js';

export const LOAD_TYPES = { point: 'Point load', couple: 'Couple', uniform: 'Uniform load', linear: 'Linear load', axialPoint: 'Axial point load', axialUniform: 'Axial uniform load' };
export const DIRECTIONS = { local: 'Local', globalY: 'Global vertical', globalX: 'Global horizontal' };
export const PER = { member: 'Member length', projected: 'Projected length' };

// Frame member loads -> local +x / +y components and ccw couples (hand-off 6.4.3), and rows for the
// drawing in their true direction.
export function frameItems(rows, members, joints, errors) {
  const J = new Map(joints.map((j) => [j.id, j])), items = {}, draw = [];
  (rows || []).forEach((ld, k) => {
    const lab = 'Load row ' + (k + 1) + ' (member ' + ld.member + ')';
    const m = members.find((x) => x.id === ld.member);
    if (!m) { errors.push('Load row ' + (k + 1) + ': member ' + ld.member + ' is not in the member table.'); return; }
    const t = ld.type;
    if (!LOAD_TYPES[t]) { errors.push('Load row ' + (k + 1) + ': choose a load type.'); return; }
    if (!isNum(ld.value)) { errors.push('Load row ' + (k + 1) + ': the value needs a number.'); return; }
    if (t === 'linear' && !isNum(ld.w2)) { errors.push('Load row ' + (k + 1) + ': a linear load needs w2.'); return; }
    const A = J.get(m.i), B = J.get(m.j);
    if (!A || !B || !isNum(A.x) || !isNum(B.x) || !isNum(A.y) || !isNum(B.y)) return;
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    if (!(L > 0)) return;
    const c = dx / L, s = dy / L, v = ld.value, dir = ld.direction || 'local';
    const point = t === 'point' || t === 'couple' || t === 'axialPoint';
    const a = isNum(ld.l1) ? ld.l1 : 0, b = point ? a : L - (isNum(ld.l2) ? ld.l2 : 0);
    const w2 = t === 'linear' ? ld.w2 : v;
    const its = [];
    let drawRow;
    if (t === 'couple') {
      const M = dir === 'local' ? -v : v;                       // local couples: book sign, + clockwise
      its.push({ kind: 'm', a, M });
      drawRow = { kind: 'm', a, M, dir: [0, 0] };
    } else if (t === 'axialPoint' || t === 'axialUniform') {
      // along the member, + toward −x (book sign)
      if (t === 'axialPoint') its.push({ kind: 'px', a, P: -v }); else its.push({ kind: 'wx', a, b, w1: -v, w2: -v });
      drawRow = t === 'axialPoint' ? { kind: 'px', a, P: v, dir: [-c, -s] } : { kind: 'wx', a, b, w1: v, w2: v, dir: [-c, -s] };
    } else if (dir === 'local') {
      // perpendicular, + toward −y (book sign)
      if (t === 'point') its.push({ kind: 'py', a, P: -v }); else its.push({ kind: 'wy', a, b, w1: -v, w2: -w2 });
      drawRow = t === 'point' ? { kind: 'py', a, P: v, dir: [s, -c] } : { kind: 'wy', a, b, w1: v, w2, dir: [s, -c] };
    } else {
      // global: load V along +Y or +X; distributed per member length or per projected length
      const vert = dir === 'globalY';
      const f = t !== 'point' && ld.per === 'projected' ? (vert ? Math.abs(c) : Math.abs(s)) : 1;
      const qx = vert ? s * f : c * f, wy = vert ? c * f : -s * f;
      if (t === 'point') its.push({ kind: 'px', a, P: v * qx }, { kind: 'py', a, P: v * wy });
      else its.push({ kind: 'wx', a, b, w1: v * qx, w2: w2 * qx }, { kind: 'wy', a, b, w1: v * wy, w2: w2 * wy });
      drawRow = t === 'point' ? { kind: 'py', a, P: v, dir: vert ? [0, 1] : [1, 0] } : { kind: 'wy', a, b, w1: v, w2, dir: vert ? [0, 1] : [1, 0] };
    }
    its.forEach((it) => { it.label = lab; });
    (items[m.id] = items[m.id] || []).push(...its);
    draw.push(Object.assign({ member: m.id }, drawRow));
  });
  return { items, draw };
}

function build(input) {
  const kind = 'frame';
  const units = input.units === 'US' || input.units === 'SI' ? input.units : 'consistent';
  const pre = cellErrors(input, kind);
  const { joints, members } = normalise(input, kind);
  const { items, draw } = frameItems(input.memberLoads, members, joints, pre);
  return analyse({ kind, units, input, model: { joints, members, items }, loadRows: draw, preErrors: pre });
}

export function run(input) {
  try {
    const { r, vals } = build(input);
    return { vals: vals || {}, result: r };
  } catch (e) {
    return { vals: {}, result: fail(['The frame could not be analysed (' + e.message + ').']) };
  }
}
export const compute = (input) => run(input).vals;
export const solve = (input) => run(input).result;
