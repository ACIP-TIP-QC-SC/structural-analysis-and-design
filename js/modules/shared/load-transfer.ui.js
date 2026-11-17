// Load transfer: module definition and live drawing.
import { solve } from './load-transfer.calc.js';
import presets from '../../../presets/shared-load-transfer.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, poly, arrow } from '../../ui/drawing.js';

const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);

function fields(mode, method, val, ed) {
  if (mode === 'takeoff') {
    return [num('wD', 'floor dead load', 'wD', 'pressure', 'Loads', 4.8), num('wL', 'floor live load', 'wL', 'pressure', 'Loads', 2.4), num('roofD', 'roof dead load', '', 'pressure', 'Loads', 4.8), num('roofL', 'roof live load', '', 'pressure', 'Loads', 2.4),
      num('tribW', 'tributary width of the beam', '', 'length_m', 'Beam', 3), num('beamSpan', 'beam span', 'L', 'length_m', 'Beam', 6), num('bw', 'beam width', 'b', 'length_mm', 'Beam', 300), num('bh', 'beam depth', 'h', 'length_mm', 'Beam', 500),
      num('gammaC', 'unit weight of concrete', 'γc', 'unitweight', 'Beam', ed.found.defaults.gammaC), num('wWall', 'wall load on the beam (optional)', '', 'lineload', 'Beam', 0, { min: 0 }),
      num('colW', 'column tributary width', '', 'length_m', 'Column', 6), num('colL', 'column tributary length', '', 'length_m', 'Column', 7.5), num('floors', 'floors carried (not counting the roof)', '', 'count', 'Column', 3, { min: 0 }),
      num('extraD', 'other dead load per level (beams, column)', '', 'force', 'Column', 0, { min: 0 })];
  }
  return [num('S', 'short span', 'S', 'length_m', 'Panel', 4), num('Lg', 'long span', 'Lg', 'length_m', 'Panel', 6),
    { key: 'bothSides', type: 'check', label: 'Panels on both sides of the beam (interior beam: doubles the load)', step: 'Panel', default: false },
    num('wD', 'floor dead load', 'wD', 'pressure', 'Loads', 4.8), num('wL', 'floor live load', 'wL', 'pressure', 'Loads', 2.4),
    { key: 'loadType', label: 'Loads to distribute', type: 'select', step: 'Loads', default: 'factored', wide: true, options: [{ value: 'factored', label: 'Factored (larger of Eq. ' + ed.loads.strength[0].eq + ' and Eq. ' + ed.loads.strength[1].eq + ')' }, { value: 'service', label: 'Service (wD + wL)' }] }];
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'takeoff') {
    const n = D.levels.length, svg = canvas(520, Math.max(200, 60 + n * 40), 'Column with the cumulative load at each level', o), x = 200;
    D.levels.forEach((lv, i) => {
      const y = 30 + i * 40;
      svg.add(line(x - 90, y, x + 90, y, 'ax'), rect(x - 6, y, 12, 40, 'conc'), text(x - 96, y + 4, lv.level, 'end'), text(x + 16, y + 26, 'Pu = ' + o.fq(lv.Pu, 'force')));
    });
    const yb = 30 + n * 40;
    svg.add(rect(x - 34, yb, 68, 12, 'conc'), text(x + 44, yb + 10, 'footing'), arrow(x, 6, x, 28, 'markline'));
    return svg;
  }
  const svg = canvas(520, 260, 'Plan of the panel with the tributary areas of the edge beams', o);
  if (!(D.S > 0)) return svg;
  const F = fit(D.Lg, D.S, 80, 30, 330, 180), k = F.k, x0 = F.x(0), y0 = F.y(0), x1 = F.x(D.Lg), y1 = F.y(D.S), ym = F.y(D.S / 2);
  svg.add(rect(x0, y0, D.Lg * k, D.S * k, 'conc'));
  if (D.oneWay) svg.add(rect(x0, y0, D.Lg * k, D.S * k / 2, 'comp'), line(x0, ym, x1, ym, 'dash'), arrow((x0 + x1) / 2, ym - 4, (x0 + x1) / 2, y0 + 6), arrow((x0 + x1) / 2, ym + 4, (x0 + x1) / 2, y1 - 6));
  else {
    const xa = F.x(D.S / 2), xb = F.x(D.Lg - D.S / 2);
    svg.add(poly([[x0, y0], [x1, y0], [xb, ym], [xa, ym]], 'thin'), poly([[x0, y1], [x1, y1], [xb, ym], [xa, ym]], 'thin'), poly([[x0, y0], [xa, ym], [x0, y1]], 'comp'), poly([[x1, y0], [xb, ym], [x1, y1]], 'comp'));
    svg.add(text(F.x(D.Lg / 2), F.y(D.S / 4) + 4, 'trapezoid', 'middle'), text(F.x(D.S / 6) + 4, ym + 4, 'triangle'));
  }
  [[x0, y0, x1, y0], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]].forEach((b) => svg.add(line(b[0], b[1], b[2], b[3], 'barline')));
  svg.add(dimH(x0, x1, y1 + 12, 'Lg = ' + o.fq(D.Lg, 'length_m')), dimV(x0 - 12, y0, y1, 'S = ' + o.fq(D.S, 'length_m', false)));
  svg.add(text(x1 + 10, y0 + 12, 'peak on a beam'), text(x1 + 10, y0 + 27, o.fq(D.peak, 'lineload')), cap((x0 + x1) / 2, 252, D.oneWay ? 'Plan: one-way slab, long beams loaded' : 'Plan: two-way slab, 45° tributary areas'));
  return svg;
}

export default {
  id: 'shared/load-transfer', group: 'shared', title: 'Load transfer',
  methods: [],
  modes: [{ id: 'panel', label: 'Panel distribution', icon: 'panel' }, { id: 'takeoff', label: 'Load takeoff', icon: 'takeoff' }],
  steps: (mode) => (mode === 'takeoff' ? ['Setup', 'Loads', 'Beam', 'Column', 'Results'] : ['Setup', 'Panel', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Beams are assumed on all four edges of the panel.',
  stepHelp: (step) => (step === 'Column' ? 'The column carries its tributary area on the roof and on each floor below it. No live load reduction is applied.' : '')
};
