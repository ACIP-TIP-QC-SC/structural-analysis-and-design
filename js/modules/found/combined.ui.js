// Combined and strap footings: module definition and live drawing (plan with shear and moment diagrams).
import { solve } from './combined.calc.js';
import presets from '../../../presets/found-combined.js';
import { fcField, fyField, num, bar } from '../rc/fields.js';
import { canvas, rect, line, text, cap, poly, lineChart, dimH } from '../../ui/drawing.js';
import { fromSI } from '../../core/units.js';

function fields(mode, method, val, ed) {
  const f = [num('cA1', 'column A size along the footing', 'cA1', 'length_mm', 'Columns', 400), num('cA2', 'column A size across', 'cA2', 'length_mm', 'Columns', 400),
    num('PDA', 'column A service dead load', 'PDA', 'force', 'Columns', 600), num('PLA', 'column A service live load', 'PLA', 'force', 'Columns', 400),
    num('cB1', 'column B size along the footing', 'cB1', 'length_mm', 'Columns', 500), num('cB2', 'column B size across', 'cB2', 'length_mm', 'Columns', 500),
    num('PDB', 'column B service dead load', 'PDB', 'force', 'Columns', 900), num('PLB', 'column B service live load', 'PLB', 'force', 'Columns', 600),
    num('s', 'spacing of the columns, centre to centre', 's', 'length_m', 'Footing', 5.0), num('a', 'centre of column A to the footing end near it', 'a', 'length_m', 'Footing', 0.2),
    num('qa', 'net allowable soil pressure', 'qa', 'pressure', 'Footing', 200)];
  if (mode === 'strap') { f.push(num('L1', 'length of the exterior footing along the strap', 'L1', 'length_m', 'Footing', 2.0)); return f; }
  if (mode === 'trapezoidal') f.push(num('Lt', 'footing length (fixed)', 'L', 'length_m', 'Footing', 5.7));
  else f.push(num('B', 'footing width used (optional; blank = rounded from the loads)', 'B', 'length_m', 'Footing', 2.0, { optional: true }));
  f.push(num('h', 'footing thickness', 'h', 'length_mm', 'Footing', 850), bar('db', 'bar size', 'Materials', 25), fcField(ed, 'Materials'), fyField(ed, 'Materials'));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 420, 'Footing plan with the shear and moment diagrams along its length', o);
  const sys = o.sys, len = D.kind === 'strap' ? D.s + D.a : D.L;
  if (!(len > 0) || !D.V) return svg;
  const x0 = 70, W = 400, k = W / len, X = (x) => x0 + x * k;
  if (D.kind === 'strap') {
    const bw = Math.min(60, D.B1 * k), sd = Math.min(60, D.side * k);
    svg.add(rect(X(0), 60 - bw / 2, D.L1 * k, bw, 'conc'), rect(X(D.a + D.s) - sd / 2, 60 - sd / 2, sd, sd, 'conc'), rect(X(D.L1), 54, X(D.a + D.s) - sd / 2 - X(D.L1), 12, 'steel'));
    svg.add(rect(X(D.a) - 6, 54, 12, 12, 'bar'), rect(X(D.a + D.s) - 7, 53, 14, 14, 'bar'), text(X(D.L1) + 6, 48, 'strap'));
  } else {
    const hA = Math.min(D.widthA * k, 70), hB = Math.min(D.widthB * k, 70), y = 60;
    svg.add(poly([[X(0), y - hA / 2], [X(D.L), y - hB / 2], [X(D.L), y + hB / 2], [X(0), y + hA / 2]], 'conc'));
    svg.add(rect(X(D.xA) - D.cA * k / 2000, y - D.cA * k / 2000, D.cA * k / 1000, D.cA * k / 1000, 'bar'), rect(X(D.xB) - D.cB * k / 2000, y - D.cB * k / 2000, D.cB * k / 1000, D.cB * k / 1000, 'bar'));
    svg.add(dimH(X(0), X(D.L), y + 48, 'L = ' + o.fq(D.L, 'length_m')), text(X(D.xA), y - 40, 'A', 'middle'), text(X(D.xB), y - 40, 'B', 'middle'));
  }
  const xs = (p) => [fromSI(p[0], 'length_m', sys), p[1]];
  const fv = (p) => [xs(p)[0], fromSI(p[1], 'force', sys)], fm = (p) => [xs(p)[0], fromSI(p[1], 'moment', sys)];
  const xMax = fromSI(len, 'length_m', sys), xu = sys === 'US' ? 'ft' : 'm';
  svg.add(lineChart({ x: x0, y: 140, w: W, h: 95, xMin: 0, xMax, series: [{ pts: D.V.map(fv), fill: true }], yLabel: 'Shear Vu, ' + (sys === 'US' ? 'kip' : 'kN'), pad: 0.05 }));
  svg.add(lineChart({ x: x0, y: 290, w: W, h: 95, xMin: 0, xMax, series: [{ pts: D.M.map(fm), fill: true }], yLabel: 'Moment Mu, ' + (sys === 'US' ? 'kip·ft' : 'kN·m') + ' (negative: tension on top)', xLabel: 'Distance from end A, ' + xu, pad: 0.05 }));
  return svg;
}

export default {
  id: 'found/combined', group: 'found', title: 'Combined and strap footings',
  methods: [],
  modes: [{ id: 'rectangular', label: 'Rectangular', icon: 'footing' }, { id: 'trapezoidal', label: 'Trapezoidal', icon: 'footing' }, { id: 'strap', label: 'Strap', icon: 'footing' }],
  steps: (mode) => (mode === 'strap' ? ['Setup', 'Columns', 'Footing', 'Results'] : ['Setup', 'Columns', 'Footing', 'Materials', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Two columns on one footing. Proportioning uses service loads and the net allowable soil pressure; strength design uses factored loads.',
  stepHelp: (step) => (step === 'Footing' ? 'Column A is the one near the property line. The columns are assumed on the centreline of the footing width.' : '')
};
