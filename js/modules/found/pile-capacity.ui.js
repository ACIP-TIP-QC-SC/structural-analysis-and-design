// Pile capacity: module definition and live drawing.
import { solve } from './pile-capacity.calc.js';
import presets from '../../../presets/found-pile-capacity.js';
import { canvas, fit, rect, line, text, cap, circle, poly, dimV, arrow } from '../../ui/drawing.js';

const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);
const sel = (key, label, step, def, options, extra) => Object.assign({ key, label, type: 'select', step, default: def, options }, extra);

function fields(mode, method, val, ed) {
  const fs = num('FS', 'factor of safety (2.5 to 4 suggested)', 'FS', 'ratio', 'Loads', 3, { min: 2.5, max: 4 }), q = num('Q', 'applied load (optional)', 'Q', 'force', 'Loads', null, { optional: true });
  if (mode === 'group') {
    const f = [num('n1', 'piles in one direction', 'n1', 'count', 'Group', 3, { min: 1 }), num('n2', 'piles in the other direction', 'n2', 'count', 'Group', 4, { min: 1 }),
      num('sp', 'spacing centre to centre', 'd', 'length_m', 'Group', 1.2), num('D', 'pile diameter or side', 'D', 'length_m', 'Group', 0.4), num('Qu', 'ultimate capacity of one pile', 'Qu', 'force', 'Group', 1692.3),
      sel('soil', 'Soil', 'Group', 'sand', [{ value: 'sand', label: 'Sand' }, { value: 'clay', label: 'Clay (check block failure)' }])];
    if (val.soil === 'clay') f.push(num('cu', 'undrained shear strength', 'cu', 'pressure', 'Group', 60), num('L', 'pile length', 'L', 'length_m', 'Group', 20), num('Nc', 'bearing capacity factor of the block', 'Nc*', 'ratio', 'Group', ed.theory.pile.blockNc));
    return f.concat([fs, q]);
  }
  const f = [sel('shape', 'Pile shape', 'Pile', 'round', [{ value: 'round', label: 'Round (D = diameter)' }, { value: 'square', label: 'Square (D = side)' }]),
    num('D', 'pile diameter or side', 'D', 'length_m', 'Pile', 0.4), num('L', 'embedded length', 'L', 'length_m', 'Pile', 15),
    { key: 'layers', type: 'list', label: 'Soil layers from the surface (φ\' for sand, cu for clay; leave the other 0)', step: 'Soil', minRows: 1, maxRows: 12,
      columns: [{ key: 't', label: 'Thickness', quantity: 'length_m' }, { key: 'gamma', label: 'γ', quantity: 'unitweight' }, { key: 'phi', label: "φ'", quantity: 'angle_deg' }, { key: 'cu', label: 'cu', quantity: 'pressure' }],
      default: [{ t: 20, gamma: 17, phi: 35, cu: 0 }] },
    num('wt', 'water table depth (optional)', '', 'length_m', 'Soil', null, { optional: true, hint: 'Below the water table the effective unit weight γ − γw is used.' })];
  if (mode === 'skin') f.push(num('K', 'earth pressure coefficient for skin friction', 'K', 'ratio', 'Soil', 1.3, { hint: ed.theory.pile.Kguide }), num('delta', 'pile-soil friction angle', "δ'", 'angle_deg', 'Soil', 28));
  return f.concat([fs, q]);
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'group') {
    const svg = canvas(520, 240, 'Plan of the pile group', o), W = (D.n1 - 1) * D.sp + 2 * D.D, H = (D.n2 - 1) * D.sp + 2 * D.D, F = fit(W, H, 130, 20, 260, 200);
    svg.add(rect(F.x(0), F.y(0), W * F.k, H * F.k, 'conc'));
    for (let i = 0; i < D.n1; i++) for (let j = 0; j < D.n2; j++) svg.add(circle(F.x(D.D + i * D.sp), F.y(D.D + j * D.sp), Math.max(3, D.D * F.k / 2)));
    svg.add(cap(260, 234, D.n1 + ' × ' + D.n2 + ' piles at ' + o.fq(D.sp, 'length_m')));
    return svg;
  }
  const svg = canvas(520, 280, 'Pile in the soil profile with the unit skin friction', o);
  if (!(D.L > 0) || !D.layers) return svg;
  const depth = D.L * 1.15, y0 = 30, hh = 220, k = hh / depth, Y = (z) => y0 + z * k;
  let z = 0;
  D.layers.forEach((l, i) => { const z2 = Math.min(z + l.t, depth); if (z < depth) { svg.add(rect(60, Y(z), 220, (z2 - z) * k, i % 2 ? 'conc' : 'soil'), text(66, Y(z) + 14, l.cu > 0 && !(l.phi > 0) ? 'clay, cu ' + o.fq(l.cu, 'pressure') : "sand, φ' " + o.fq(l.phi, 'angle_deg'))); } z += l.t; });
  if (D.wt != null && D.wt < depth) svg.add(line(60, Y(D.wt), 280, Y(D.wt), 'water'), text(276, Y(D.wt) - 4, 'water table', 'end'));
  svg.add(rect(230, Y(0) - 10, 16, D.L * k + 10, 'steel'), arrow(238, 4, 238, Y(0) - 12, 'markline'), dimV(300, Y(0), Y(D.L), 'L = ' + o.fq(D.L, 'length_m'), true));
  if (D.f && D.f.length) {
    const fm = Math.max(...D.f.map((p) => p[1]), 1e-9), x0 = 370, s = 70 / fm;
    svg.add(poly([[x0, Y(0)]].concat(D.f.map((p) => [x0 + p[1] * s, Y(p[0])]), [[x0, Y(D.L)]])), line(x0, Y(0), x0, Y(D.L), 'ax'), text(x0, y0 - 8, 'unit skin friction f', 'middle'));
    svg.add(text(x0 + fm * s + 4, Y(D.f.reduce((m, p) => (p[1] > m[1] ? p : m), D.f[0])[0]) + 4, o.fq(fm, 'pressure')));
  }
  svg.add(cap(170, 276, 'Soil profile'));
  return svg;
}

export default {
  id: 'found/pile-capacity', group: 'found', title: 'Pile capacity',
  methods: [],
  modes: [{ id: 'point', label: 'Point', icon: 'soil' }, { id: 'skin', label: 'Skin', icon: 'soil' }, { id: 'group', label: 'Group', icon: 'footplan' }],
  steps: (mode) => (mode === 'group' ? ['Setup', 'Group', 'Loads', 'Results'] : ['Setup', 'Pile', 'Soil', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Static formulas from the foundation engineering textbook. The Skin mode also adds the point resistance to give Qu and Qall.'
};
