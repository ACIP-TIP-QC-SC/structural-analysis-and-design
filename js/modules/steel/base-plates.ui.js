// Base plates and anchor rods: module definition and live drawing.
import { solve } from './base-plates.calc.js';
import presets from '../../../presets/steel-base-plates.js';
import { num, sel, prop } from './fields.js';
import { canvas, fit, rect, text, cap, dimH, dimV, iShape, circle } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const BP = ed.steel.basePlate, dem = method === 'ASD' ? 'Pa' : 'Pu';
  if (mode === 'anchors') {
    return [sel('rod', 'Rod size', 'Rods', 24, BP.anchor.sizes.map((d) => ({ value: d, label: 'M' + d }))),
      { key: 'Fu', label: 'rod tensile strength', symbol: 'Fu', quantity: 'stress', step: 'Rods', default: 400, choices: BP.anchor.grades },
      sel('threads', 'Threads', 'Rods', 'N', [{ value: 'N', label: 'In the shear plane' }, { value: 'X', label: 'Excluded from the shear plane' }]),
      num('nRods', 'number of rods', 'n', 'count', 'Rods', 4, { min: 1 }),
      num('T', 'total uplift (optional)', method === 'ASD' ? 'Ta' : 'Tu', 'force', 'Loads', null, { optional: true }), num('V', 'total shear (optional)', method === 'ASD' ? 'Va' : 'Vu', 'force', 'Loads', null, { optional: true })];
  }
  const f = [];
  if (mode === 'thickness') f.push({ type: 'shape', key: 'shape', label: 'Column (W and S shapes)', step: 'Column', default: 'W250x73', types: ['W', 'S'],
    props: [prop('dsec', 'd', 'column depth', 'd', 'length_mm', 254), prop('bf', 'bf', 'column flange width', 'bf', 'length_mm', 254)] });
  f.push(num('B', 'plate width', 'B', 'length_mm', 'Plate', 400), num('N', 'plate length', 'N', 'length_mm', 'Plate', 400));
  if (mode === 'thickness') f.push(num('Fy', 'plate yield strength', 'Fy', 'stress', 'Plate', 248), num('tProv', 'plate thickness provided (optional)', 't', 'length_mm', 'Plate', null, { optional: true }));
  f.push(num('Bs', 'support width', '', 'length_mm', 'Support', 600), num('Ns', 'support length', '', 'length_mm', 'Support', 600),
    { key: 'fc', label: 'concrete strength', symbol: "f'c", quantity: 'stress', step: 'Support', default: 21, choices: ed.concrete.fcChoices });
  if (mode === 'bearing') f.push(num('A2A1', 'assumed A2/A1 for the design helper', 'A2/A1', 'ratio', 'Support', 2.25, { min: 1, max: 4 }));
  f.push(num('P', 'required axial strength', dem, 'force', 'Loads', 1500));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'anchors') {
    const svg = canvas(520, 220, 'Base plate with anchor rods', o);
    svg.add(rect(180, 40, 160, 140, 'steel'));
    const pts = D.n <= 2 ? [[210, 110], [310, 110]] : [[205, 65], [315, 65], [205, 155], [315, 155]].concat(D.n > 4 ? [[260, 65], [260, 155]] : []);
    pts.slice(0, Math.max(D.n, 2)).forEach((p) => svg.add(circle(p[0], p[1], 7)));
    svg.add(cap(260, 212, 'Plan of the plate with ' + D.n + ' rods'));
    return svg;
  }
  const svg = canvas(520, 260, 'Base plate on the concrete support with the column', o);
  if (!(D.Bs > 0)) return svg;
  const F = fit(D.Bs, D.Ns, 120, 20, 280, 210), k = F.k, cx = F.x(D.Bs / 2), cy = F.y(D.Ns / 2);
  svg.add(rect(F.x(0), F.y(0), D.Bs * k, D.Ns * k, 'conc'), rect(cx - D.B * k / 2, cy - D.N * k / 2, D.B * k, D.N * k, 'steel'));
  if (D.d > 0 && D.bf > 0) svg.add(iShape(cx, cy - D.d * k / 2, D.d * k, D.bf * k, Math.max(3, 0.06 * D.d * k), Math.max(2, 0.035 * D.bf * k), 'bar'));
  svg.add(dimH(cx - D.B * k / 2, cx + D.B * k / 2, cy + D.N * k / 2 + 10, 'B = ' + o.fq(D.B, 'length_mm')), dimV(F.x(D.Bs) + 12, cy - D.N * k / 2, cy + D.N * k / 2, 'N', true));
  svg.add(text(F.x(0) + 4, F.y(0) + 14, 'support'), cap(cx, 254, 'Plan'));
  return svg;
}

export default {
  id: 'steel/base-plates', group: 'steel', title: 'Base plates and anchor rods',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'bearing', label: 'Bearing', icon: 'footing' }, { id: 'thickness', label: 'Plate thickness', icon: 'footing' }, { id: 'anchors', label: 'Anchors', icon: 'bolts' }],
  steps: (mode) => (mode === 'anchors' ? ['Setup', 'Rods', 'Loads', 'Results'] : mode === 'thickness' ? ['Setup', 'Column', 'Plate', 'Support', 'Loads', 'Results'] : ['Setup', 'Plate', 'Support', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Axially loaded column base plates. Bases with moment, and the concrete breakout and pullout of anchors, are outside the scope.'
};
