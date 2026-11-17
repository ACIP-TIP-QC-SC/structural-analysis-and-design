// Bolted connections: module definition and live drawings.
import { solve } from './bolted.calc.js';
import presets from '../../../presets/steel-bolted.js';
import { num, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, circle, arrow } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const B = ed.steel.bolt, dem = method === 'ASD' ? 'a' : 'u';
  const f = [sel('grade', 'Bolt grade', 'Bolts', 'A325', B.grades.map((g) => ({ value: g.value, label: g.label })).filter((g) => mode !== 'slip' || g.value !== 'A307')),
    sel('bolt', 'Bolt size', 'Bolts', 20, B.sizes.map((x) => ({ value: x, label: 'M' + x }))),
    sel('threads', 'Threads', 'Bolts', 'N', [{ value: 'N', label: 'Included in the shear plane (N)' }, { value: 'X', label: 'Excluded from the shear plane (X)' }], { wide: true }),
    num('planes', mode === 'slip' ? 'number of shear (slip) planes' : 'number of shear planes', '', 'count', 'Bolts', 1, { min: 1, max: 2 })];
  if (mode === 'eccentric') {
    f.push(sel('layout', 'Bolt layout', 'Group', 'pattern', [{ value: 'pattern', label: 'Rows × columns' }, { value: 'free', label: 'Free coordinates' }], { wide: true }));
    if (val.layout === 'free') f.push({ key: 'points', type: 'list', label: 'Bolt coordinates', step: 'Group', minRows: 2, maxRows: 40, columns: [{ key: 'x', label: 'x', quantity: 'length_mm' }, { key: 'y', label: 'y', quantity: 'length_mm' }],
      default: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 75 }, { x: 100, y: 75 }] });
    else f.push(num('rows', 'rows', '', 'count', 'Group', 3, { min: 1 }), num('cols', 'columns', '', 'count', 'Group', 2, { min: 1 }), num('pitch', 'pitch between rows', 's', 'length_mm', 'Group', 75), num('gauge', 'gauge between columns', 'g', 'length_mm', 'Group', 100));
    f.push(num('P', 'load on the group (' + (method || 'LRFD') + ')', 'P' + dem, 'force', 'Loads', 150), num('angle', 'load direction from the vertical (0 = downward)', 'θ', 'angle_deg', 'Loads', 0),
      num('ex', 'horizontal distance of the load from the centroid', 'ex', 'length_mm', 'Loads', 200), num('ey', 'vertical distance of the load from the centroid', 'ey', 'length_mm', 'Loads', 0));
    return f;
  }
  f.push(num('lines', 'lines of bolts parallel to the load', '', 'count', 'Plates', 2, { min: 1 }), num('perLine', 'bolts in each line', '', 'count', 'Plates', 2, { min: 1 }),
    num('t', 'thickness of the thinner or weaker part', 't', 'length_mm', 'Plates', 12), num('Fu', 'tensile strength of that part', 'Fu', 'stress', 'Plates', 400),
    num('Le', 'end distance', 'Le', 'length_mm', 'Plates', 40), num('s', 'spacing', 's', 'length_mm', 'Plates', 75),
    sel('edge', 'Edge type', 'Plates', 'sheared', [{ value: 'sheared', label: 'Sheared edge' }, { value: 'rolled', label: 'Rolled or gas-cut edge' }]),
    { key: 'deformation', type: 'check', label: 'Deformation at the bolt holes at service load is a design consideration', step: 'Plates', default: true });
  if (mode === 'slip') f.push(sel('surface', 'Faying surface', 'Slip', 'A', [{ value: 'A', label: 'Class A (μ = ' + B.slip.mu.A + ')' }, { value: 'B', label: 'Class B (μ = ' + B.slip.mu.B + ')' }]),
    sel('hole', 'Hole type', 'Slip', 'std', B.slip.hsc.map((x) => ({ value: x.value, label: x.label }))),
    sel('level', 'Design level', 'Slip', 'service', [{ value: 'service', label: 'Slip as a serviceability limit state' }, { value: 'strength', label: 'Slip at the required strength level' }], { wide: true }),
    num('Tslip', 'applied tension on the connection (optional)', 'T' + dem, 'force', 'Slip', null, { optional: true }), num('Nb', 'bolts carrying that tension', 'Nb', 'count', 'Slip', 1, { min: 1 }));
  f.push(num('V', 'required shear on the connection', 'V' + dem, 'force', 'Loads', 300, { min: 0 }));
  if (mode === 'bearing') f.push(num('T', 'required tension per bolt (optional)', 'T' + dem, 'force', 'Loads', null, { optional: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'group' && D.pts) {
    const svg = canvas(520, 280, 'Bolt group with the force on each bolt', o);
    const xs = D.pts.map((p) => p.x), ys = D.pts.map((p) => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(x1 - x0, y1 - y0, 100) * 0.35, F = fit(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, 40, 20, 260, 240);
    const X = (x) => F.x(x - x0 + pad), Y = (y) => F.y(y1 + pad - y);
    svg.add(rect(X(x0 - pad * 0.6), Y(y1 + pad * 0.6), (x1 - x0 + 1.2 * pad) * F.k, (y1 - y0 + 1.2 * pad) * F.k, 'steel'));
    const fmax = Math.max(...D.forces.map((f) => f.R)), sc = 50 / fmax;
    D.forces.forEach((f) => {
      const crit = f === D.crit || (f.x === D.crit.x && f.y === D.crit.y);
      svg.add(circle(X(f.x), Y(f.y), 6, crit ? 'mark' : 'bar'));
      svg.add(arrow(X(f.x), Y(f.y), X(f.x) + f.fx * sc, Y(f.y) - f.fy * sc, crit ? 'markline' : 'arrow'));
    });
    svg.add(text(X(D.cx) + 4, Y(D.cy) - 4, '+ centroid'));
    const lx = X(D.cx + D.load.ex), ly = Y(D.cy + D.load.ey);
    if (lx < 500) svg.add(arrow(lx, ly - 50, lx, ly - 4, 'markline'), text(lx + 6, ly - 40, 'P'));
    svg.add(text(320, 60, 'critical bolt in orange'), text(320, 76, 'R = ' + o.fq(D.crit.R, 'force')), cap(160, 274, 'Bolt group (arrows to scale with the force)'));
    return svg;
  }
  const svg = canvas(520, 200, 'Lap splice with the bolt layout', o);
  if (!(D.lines > 0)) return svg;
  const run = D.Le + (D.perLine - 1) * D.s, len = run + 2 * D.Le + D.s, wid = (D.lines + 1) * 60, F = fit(len, wid, 70, 30, 380, 120), k = F.k;
  svg.add(rect(F.x(0), F.y(0), len * k, wid * k, 'steel'));
  const xb = (j) => len - D.Le - j * D.s;
  for (let i = 0; i < D.lines; i++) for (let j = 0; j < D.perLine; j++) svg.add(circle(F.x(xb(j)), F.y(60 + i * 60), Math.max(3, D.d * k / 2)));
  svg.add(dimH(F.x(xb(0)), F.x(len), F.y(wid) + 12, 'Le = ' + o.fq(D.Le, 'length_mm')));
  if (D.perLine > 1) svg.add(dimH(F.x(xb(1)), F.x(xb(0)), F.y(0) - 10, 's = ' + o.fq(D.s, 'length_mm'), true));
  svg.add(arrow(F.x(0), F.y(wid / 2), F.x(0) - 40, F.y(wid / 2), 'markline'), text(F.x(0) - 44, F.y(wid / 2) - 6, 'V', 'end'), text(F.x(len) + 6, F.y(wid / 2) + 4, 'plate end'));
  svg.add(cap(260, 194, 'Plan of the connected plate'));
  return svg;
}

export default {
  id: 'steel/bolted', group: 'steel', title: 'Bolted connections',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'bearing', label: 'Bearing-type', icon: 'bolts' }, { id: 'slip', label: 'Slip-critical', icon: 'bolts' }, { id: 'eccentric', label: 'Eccentric group', icon: 'bolts' }],
  steps: (mode) => (mode === 'eccentric' ? ['Setup', 'Bolts', 'Group', 'Loads', 'Results'] : mode === 'slip' ? ['Setup', 'Bolts', 'Plates', 'Slip', 'Loads', 'Results'] : ['Setup', 'Bolts', 'Plates', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Bolt stresses are the values printed in NSCP 2015, which differ from some other editions. The value used is shown in the first solution step.',
  stepHelp: (step, mode) => (step === 'Group' ? 'Coordinates are in mm. The load acts at the given distance from the centroid of the group.' : '')
};
