// Welded connections: module definition and live drawings.
import { solve } from './welded.calc.js';
import presets from '../../../presets/steel-welded.js';
import { num, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, circle, arrow, path, poly } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const W = ed.steel.weld, dem = method === 'ASD' ? 'Pa' : 'Pu';
  const f = [{ key: 'FEXX', label: 'electrode strength', symbol: 'FEXX', quantity: 'stress', step: 'Weld', default: 480, choices: W.electrodes }];
  if (mode === 'eccentric') {
    f.push(sel('layout', 'Weld group', 'Weld', 'C', [{ value: 'C', label: 'C shape (vertical weld with two legs)' }, { value: 'parallel', label: 'Two parallel vertical welds' }, { value: 'box', label: 'Box' }, { value: 'free', label: 'Free segments' }], { wide: true }));
    if (val.layout === 'free') f.push({ key: 'segments', type: 'list', label: 'Weld segments (end coordinates)', step: 'Weld', minRows: 1, maxRows: 20,
      columns: [{ key: 'x1', label: 'x1', quantity: 'length_mm' }, { key: 'y1', label: 'y1', quantity: 'length_mm' }, { key: 'x2', label: 'x2', quantity: 'length_mm' }, { key: 'y2', label: 'y2', quantity: 'length_mm' }],
      default: [{ x1: 0, y1: 0, x2: 0, y2: 200 }, { x1: 100, y1: 0, x2: 100, y2: 200 }] });
    else f.push(num('a', val.layout === 'parallel' ? 'length of each vertical weld' : 'vertical weld length (height)', 'a', 'length_mm', 'Weld', 250), num('b', val.layout === 'parallel' ? 'distance between the welds' : 'horizontal leg length (width)', 'b', 'length_mm', 'Weld', 150));
    f.push(num('w', 'fillet size provided (optional)', 'w', 'length_mm', 'Weld', 6, { optional: true }),
      num('P', 'load on the group (' + (method || 'LRFD') + ')', dem, 'force', 'Loads', 120), num('angle', 'load direction from the vertical (0 = downward)', 'θ', 'angle_deg', 'Loads', 0),
      num('ex', 'horizontal distance of the load from the centroid', 'ex', 'length_mm', 'Loads', 250), num('ey', 'vertical distance of the load from the centroid', 'ey', 'length_mm', 'Loads', 0));
    return f;
  }
  if (mode === 'groove') {
    f.push(sel('groove', 'Groove weld', 'Weld', 'cjp', [{ value: 'cjp', label: 'Complete joint penetration' }, { value: 'pjp', label: 'Partial joint penetration' }], { wide: true }),
      sel('loading', 'Load on the weld', 'Weld', 'tension', [{ value: 'tension', label: 'Tension or compression normal to the weld' }, { value: 'shear', label: 'Shear' }], { wide: true }));
    if (val.groove === 'pjp') f.push(num('E', 'effective throat', 'E', 'length_mm', 'Weld', 6));
    f.push(num('Lw', 'weld length', 'ℓ', 'length_mm', 'Weld', 200), num('t', 'thickness of the thinner part joined', 't', 'length_mm', 'Base metal', 12),
      num('Fy', 'base metal yield strength', 'Fy', 'stress', 'Base metal', 248), num('Fu', 'base metal tensile strength', 'Fu', 'stress', 'Base metal', 400), num('P', 'required strength', dem, 'force', 'Loads', 450));
    return f;
  }
  f.push(num('w', 'fillet leg size', 'w', 'length_mm', 'Weld', 8), num('nLong', 'number of longitudinal welds', '', 'count', 'Weld', 2, { min: 0 }), num('Llong', 'length of each longitudinal weld', 'ℓ', 'length_mm', 'Weld', 150, { min: 0 }),
    num('Ltrans', 'total length of transverse welds', '', 'length_mm', 'Weld', 0, { min: 0 }), num('angle', 'load angle to the weld axis (only without transverse welds)', 'θ', 'angle_deg', 'Weld', 0, { min: 0, max: 90 }),
    num('t', 'thickness of the thinner part joined', 't', 'length_mm', 'Base metal', 10), num('Fy', 'base metal yield strength', 'Fy', 'stress', 'Base metal', 248), num('Fu', 'base metal tensile strength', 'Fu', 'stress', 'Base metal', 400),
    num('P', 'required strength', dem, 'force', 'Loads', 300));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'group' && D.segs) {
    const svg = canvas(520, 270, 'Weld group with the stress at the critical point', o);
    const xs = D.segs.flatMap((s) => [s.x1, s.x2]), ys = D.segs.flatMap((s) => [s.y1, s.y2]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(x1 - x0, y1 - y0, 50) * 0.25, F = fit(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, 40, 20, 240, 230);
    const X = (x) => F.x(x - x0 + pad), Y = (y) => F.y(y1 + pad - y);
    svg.add(rect(X(x0 - pad * 0.5), Y(y1 + pad * 0.5), (x1 - x0 + pad) * F.k, (y1 - y0 + pad) * F.k, 'steel'));
    D.segs.forEach((s) => svg.add(line(X(s.x1), Y(s.y1), X(s.x2), Y(s.y2), 'markline')));
    svg.add(text(X(D.cx) + 4, Y(D.cy) - 4, '+ centroid'), circle(X(D.crit.x), Y(D.crit.y), 5, 'mark'));
    svg.add(arrow(X(D.crit.x), Y(D.crit.y), X(D.crit.x) + D.crit.fx / D.crit.fr * 40, Y(D.crit.y) - D.crit.fy / D.crit.fr * 40, 'markline'));
    const lx = X(D.cx + D.load.ex), ly = Y(D.cy + D.load.ey);
    if (lx < 500) svg.add(arrow(lx, ly - 50, lx, ly - 4), text(lx + 6, ly - 40, 'P'));
    svg.add(text(320, 60, 'critical point'), text(320, 76, 'fr = ' + o.fq(D.crit.fr, 'force_per_mm')), cap(160, 264, 'Weld group (welds in orange)'));
    return svg;
  }
  if (D.kind === 'groove') {
    const svg = canvas(520, 180, 'Groove weld between two plates', o), y = 70, th = 30;
    svg.add(rect(60, y, 180, th, 'steel'), rect(280, y, 180, th, 'steel'));
    svg.add(poly(D.groove === 'cjp' ? [[240, y], [280, y], [266, y + th], [254, y + th]] : [[240, y], [280, y], [266, y + th * 0.5], [254, y + th * 0.5]], 'mark'));
    svg.add(text(260, y - 8, D.groove === 'cjp' ? 'complete joint penetration' : 'partial penetration, throat E', 'middle'), cap(260, 172, 'Section through the joint'));
    return svg;
  }
  const svg = canvas(520, 200, 'Plate lap joint with fillet welds', o);
  if (!(D.w > 0)) return svg;
  const len = Math.max(D.Ll, 1), F = fit(len * 2.2, 200, 60, 20, 400, 120), k = F.k;
  svg.add(rect(F.x(len * 0.8), F.y(0), len * 1.4 * k, 200 * k, 'conc'), rect(F.x(0), F.y(20), len * 1.4 * k, 160 * k, 'steel'));
  svg.add(text(F.x(len * 2.2) - 4, F.y(0) + 14, 'lower plate', 'end'), text(F.x(0) + 4, F.y(20) + 14, 'upper plate'));
  if (D.nL > 0) { svg.add(line(F.x(len * 0.8), F.y(20), F.x(len * 1.4), F.y(20), 'markline'), line(F.x(len * 0.8), F.y(180), F.x(len * 1.4), F.y(180), 'markline')); svg.add(dimH(F.x(len * 0.8), F.x(len * 1.4), F.y(200) + 12, 'ℓ = ' + o.fq(D.Ll, 'length_mm'))); }
  if (D.Lt > 0) svg.add(line(F.x(len * 0.8), F.y(20), F.x(len * 0.8), F.y(180), 'markline'));
  svg.add(arrow(F.x(0), F.y(100), F.x(0) - 40, F.y(100), 'markline'), text(F.x(0) - 44, F.y(100) - 6, 'P', 'end'), cap(260, 194, 'Plan of the lap joint (welds in orange)'));
  return svg;
}

export default {
  id: 'steel/welded', group: 'steel', title: 'Welded connections',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'fillet', label: 'Fillet', icon: 'bolts' }, { id: 'groove', label: 'Groove', icon: 'bolts' }, { id: 'eccentric', label: 'Eccentric group', icon: 'bolts' }],
  steps: (mode) => (mode === 'eccentric' ? ['Setup', 'Weld', 'Loads', 'Results'] : ['Setup', 'Weld', 'Base metal', 'Loads', 'Results']),
  fields, presets, solve, draw,
  stepHelp: (step, mode) => (mode === 'eccentric' && step === 'Weld' ? 'Each weld is treated as a line of unit throat. Coordinates are in mm.' : '')
};
