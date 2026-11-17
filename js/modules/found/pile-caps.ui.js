// Pile caps: module definition and live drawing.
import { solve } from './pile-caps.calc.js';
import presets from '../../../presets/found-pile-caps.js';
import { fcField, fyField, num, bar, sel } from '../rc/fields.js';
import { canvas, fit, rect, line, text, cap, circle, dimH, poly } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const f = [num('n1', 'piles along x', 'n1', 'count', 'Piles', 2, { min: 1 }), num('n2', 'piles along y', 'n2', 'count', 'Piles', 2, { min: 1 }),
    num('sx', 'spacing along x', 'sx', 'length_m', 'Piles', 1.2), num('sy', 'spacing along y', 'sy', 'length_m', 'Piles', 1.2),
    num('dp', 'pile diameter or side', 'dpile', 'length_mm', 'Piles', 400), sel('pileShape', 'Pile shape', 'Piles', 'round', [{ value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }]),
    num('B', 'cap width along x', 'B', 'length_m', 'Cap', 2.0), num('Lc', 'cap length along y', 'L', 'length_m', 'Cap', 2.0),
    num('c1', 'column size along x', 'c1', 'length_mm', 'Cap', 500), num('c2', 'column size along y', 'c2', 'length_mm', 'Cap', 500)];
  if (mode !== 'reactions') f.push(num('h', 'cap thickness', 'h', 'length_mm', 'Cap', 700), num('d', 'effective depth of the bottom bars', 'd', 'length_mm', 'Cap', 550),
    fcField(ed, 'Materials'), fyField(ed, 'Materials'), num('lambda', 'lightweight factor', 'λ', 'ratio', 'Materials', 1, { min: 0.75, max: 1 }));
  if (mode === 'flexure') f.push(bar('db', 'bottom bar size', 'Materials', 25));
  f.push(num('Pu', 'factored column load', 'Pu', 'force', 'Loads', 3200), num('Muy', 'factored moment about the y axis', 'Muy', 'moment', 'Loads', 240), num('Mux', 'factored moment about the x axis', 'Mux', 'moment', 'Loads', 0));
  if (mode === 'reactions') f.push(num('P', 'service column load (optional)', 'P', 'force', 'Loads', 2300, { optional: true }), num('My', 'service moment about the y axis', 'My', 'moment', 'Loads', 170),
    num('Mx', 'service moment about the x axis', 'Mx', 'moment', 'Loads', 0), num('Qa', 'allowable load per pile', 'Qall', 'force', 'Loads', 700));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 280, 'Pile cap plan with the reactions and the critical sections', o);
  if (!(D.B > 0) || !D.pts) return svg;
  const F = fit(D.B, D.Lc, 110, 18, 300, 210), k = F.k, X = (x) => F.x(x + D.B / 2), Y = (y) => F.y(D.Lc / 2 - y);
  svg.add(rect(X(-D.B / 2), Y(D.Lc / 2), D.B * k, D.Lc * k, 'conc'));
  if (D.b1) {
    svg.add(rect(X(-D.b1 / 2), Y(D.b2 / 2), D.b1 * k, D.b2 * k, 'na'));
    svg.add(line(X(D.oneSec), Y(D.Lc / 2), X(D.oneSec), Y(-D.Lc / 2), 'markline'));
  }
  D.pts.forEach((p, i) => {
    svg.add(circle(X(p.x), Y(p.y), D.dp * k / 2, 'steel'));
    if (D.R) svg.add(text(X(p.x), Y(p.y) + 4, o.fq(D.R[i], 'force'), 'middle'));
  });
  svg.add(rect(X(-D.c1 / 2000), Y(D.c2 / 2000), D.c1 / 1000 * k, D.c2 / 1000 * k, 'bar'));
  svg.add(dimH(X(-D.B / 2), X(D.B / 2), Y(-D.Lc / 2) + 12, 'B = ' + o.fq(D.B, 'length_m')), cap(260, 276, 'Plan: factored reactions on the piles'));
  return svg;
}

export default {
  id: 'found/pile-caps', group: 'found', title: 'Pile caps',
  methods: [],
  modes: [{ id: 'reactions', label: 'Reactions', icon: 'footplan' }, { id: 'shear', label: 'Shear', icon: 'footplan' }, { id: 'flexure', label: 'Flexure', icon: 'footing' }],
  steps: (mode) => (mode === 'reactions' ? ['Setup', 'Piles', 'Cap', 'Loads', 'Results'] : ['Setup', 'Piles', 'Cap', 'Materials', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Rigid cap on a symmetric rectangular pattern of identical vertical piles, with one column at the centroid.'
};
