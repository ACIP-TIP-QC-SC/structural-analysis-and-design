// Mat foundations: module definition and live drawing.
import { solve } from './mat.calc.js';
import presets from '../../../presets/found-mat.js';
import { canvas, fit, rect, circle, text, cap, dimH, dimV, lineChart } from '../../ui/drawing.js';
import { fromSI } from '../../core/units.js';

const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);
const sel = (key, label, step, def, options, extra) => Object.assign({ key, label, type: 'select', step, default: def, options }, extra);

function fields(mode, method, val) {
  return [num('B', 'mat width (x direction)', 'B', 'length_m', 'Mat', 10), num('Lm', 'mat length (y direction)', 'L', 'length_m', 'Mat', 16),
    num('qa', 'net allowable soil pressure', 'qa', 'pressure', 'Mat', 100),
    { key: 'columns', type: 'list', label: 'Columns (coordinates from the mat centre, service loads)', step: 'Columns', minRows: 1, maxRows: 60,
      columns: [{ key: 'x', label: 'x', quantity: 'length_m' }, { key: 'y', label: 'y', quantity: 'length_m' }, { key: 'D', label: 'Dead', quantity: 'force' }, { key: 'L', label: 'Live', quantity: 'force' }],
      default: [{ x: -3, y: -3, D: 800, L: 400 }, { x: 3, y: -3, D: 800, L: 400 }, { x: -3, y: 3, D: 800, L: 400 }, { x: 3, y: 3, D: 800, L: 400 }] },
    sel('loads', 'Loads', 'Columns', 'service', [{ value: 'service', label: 'Service (pressures against qa)' }, { value: 'factored', label: 'Factored (for strength design of the strips)' }], { wide: true }),
    sel('strip', 'Design strip', 'Strip', 'y', [{ value: 'y', label: 'Strip running in the y direction (edges at x = s1, s2)' }, { value: 'x', label: 'Strip running in the x direction (edges at y = s1, s2)' }], { wide: true }),
    num('s1', 'first edge of the strip', 's1', 'length_m', 'Strip', -5, { optional: true }), num('s2', 'second edge of the strip', 's2', 'length_m', 'Strip', -2.25, { optional: true })];
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, D.strip ? 480 : 292, 'Mat plan with the columns, the corner pressures and the design strip', o);
  if (!(D.B > 0)) return svg;
  const F = fit(D.B, D.Lm, 120, 22, 280, 200), k = F.k, X = (x) => F.x(x + D.B / 2), Y = (y) => F.y(D.Lm / 2 - y);
  svg.add(rect(X(-D.B / 2), Y(D.Lm / 2), D.B * k, D.Lm * k, 'conc'));
  if (D.strip) {
    const st = D.strip;
    svg.add(st.alongY ? rect(X(st.s1), Y(D.Lm / 2), (st.s2 - st.s1) * k, D.Lm * k, 'comp') : rect(X(-D.B / 2), Y(st.s2), D.B * k, (st.s2 - st.s1) * k, 'comp'));
  }
  const pmax = Math.max(...D.cols.map((c) => c.P));
  D.cols.forEach((c) => svg.add(circle(X(c.x), Y(c.y), 3 + 5 * c.P / pmax)));
  const lab = ['A', 'B', 'C', 'D'];
  D.corners.forEach((c, i) => svg.add(text(X(c.x) + (c.x < 0 ? -6 : 6), Y(c.y) + (c.y > 0 ? -6 : 14), lab[i] + ' ' + o.fq(c.q, 'pressure'), c.x < 0 ? 'end' : 'start')));
  svg.add(dimH(X(-D.B / 2), X(D.B / 2), Y(-D.Lm / 2) + 26, 'B = ' + o.fq(D.B, 'length_m')), cap(260, 284, 'Plan (circle size shows the column load)'));
  if (D.strip) {
    const st = D.strip, xMax = fromSI(st.len, 'length_m', o.sys), fx = (p) => fromSI(p, 'length_m', o.sys);
    svg.add(lineChart({ x: 70, y: 316, w: 200, h: 120, xMin: 0, xMax, series: [{ pts: st.V.map((p) => [fx(p[0]), fromSI(p[1], 'force', o.sys)]), fill: true }], yLabel: 'Strip shear', xLabel: 'along the strip', pad: 0.05 }));
    svg.add(lineChart({ x: 320, y: 316, w: 180, h: 120, xMin: 0, xMax, series: [{ pts: st.M.map((p) => [fx(p[0]), fromSI(p[1], 'moment', o.sys)]), fill: true }], yLabel: 'Strip moment', xLabel: 'along the strip', pad: 0.05 }));
  }
  return svg;
}

export default {
  id: 'found/mat', group: 'found', title: 'Mat foundations',
  methods: [],
  modes: [{ id: 'rigid', label: 'Rigid method', icon: 'footplan' }],
  steps: ['Setup', 'Mat', 'Columns', 'Strip', 'Results'],
  fields, presets, solve, draw,
  setupNote: 'Conventional rigid method. Coordinates are measured from the centre of the mat, x along the width B and y along the length L.',
  stepHelp: (step) => (step === 'Strip' ? 'Leave the strip edges empty to see the pressures only.' : '')
};
