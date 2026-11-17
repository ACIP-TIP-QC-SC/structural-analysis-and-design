// One-way slabs: module definition and live drawing.
import { solve } from './one-way-slab.calc.js';
import presets from '../../../presets/rc-one-way-slab.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, circle } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const f = [num('span', 'span', 'ℓ', 'length_mm', 'Geometry', 3600), sel('support', 'Support condition', 'Geometry', 'oneEnd', ed.concrete.supports),
    num('h', 'slab thickness', 'h', 'length_mm', 'Geometry', 150),
    sel('dFrom', 'Effective depth', 'Geometry', 'cover', [{ value: 'cover', label: 'From cover and bar size' }, { value: 'typed', label: 'Typed value' }])];
  f.push(val.dFrom === 'typed' ? num('d', 'effective depth', 'd', 'length_mm', 'Geometry', 120) : num('cover', 'clear cover', '', 'length_mm', 'Geometry', ed.concrete.cover.slab));
  f.push(bar('dbm', 'main bar size', 'Geometry', 12, { sizes: [10, 12, 16, 20] }), bar('dbt', 'temperature bar size', 'Geometry', 10, { sizes: [10, 12, 16] }));
  f.push(fcField(ed, 'Materials', { default: 21 }), fyField(ed, 'Materials', { default: 280 }));
  f.push(sel('muFrom', 'Moment', 'Loads', 'typed', [{ value: 'typed', label: 'Typed Mu per metre' }, { value: 'loads', label: 'From floor loads (simple span)' }], { wide: true }));
  if (val.muFrom === 'loads') f.push(num('wD', 'dead load', 'wD', 'pressure', 'Loads', 4.8), num('wL', 'live load', 'wL', 'pressure', 'Loads', 2.4));
  else f.push(num('Mu', 'factored moment per metre', 'Mu', 'moment_per_m', 'Loads', 18));
  f.push(num('Vu', 'factored shear per metre (optional)', 'Vu', 'lineload', 'Loads', null, { optional: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 200, 'Slab strip section with main and temperature bars', o);
  if (!(D.h > 0)) return svg;
  const F = fit(1000, D.h, 70, 40, 350, 90), k = F.k, x0 = F.x(0), y0 = F.y(0), yb = F.y(D.h), yd = F.y(D.d);
  svg.add(rect(x0, y0, 1000 * k, D.h * k, 'conc'));
  const r = Math.max(3, D.dbm * k / 2);
  if (D.sT > 0) svg.add(line(x0 + 4, yd - r - Math.max(2, D.dbt * k / 2), x0 + 1000 * k - 4, yd - r - Math.max(2, D.dbt * k / 2), 'barline'));
  if (D.s > 0) for (let x = D.s / 2; x < 1000; x += D.s) svg.add(circle(F.x(x), yd, r));
  svg.add(dimH(x0, x0 + 1000 * k, yb + 10, o.sys === 'US' ? '1 m strip (39.37 in)' : '1000 mm strip'), dimV(x0 - 12, y0, yb, 'h = ' + o.fq(D.h, 'length_mm', false)), dimV(x0 + 1000 * k + 12, y0, yd, 'd = ' + o.fq(D.d, 'length_mm', false), true));
  if (D.s > 0) svg.add(text(x0, y0 - 22, 'main: ' + D.dbm + ' mm at ' + o.fq(D.s, 'length_mm')), text(x0, y0 - 8, 'temperature: ' + D.dbt + ' mm at ' + o.fq(D.sT, 'length_mm') + ' (shown as a line)'));
  svg.add(cap(x0 + 500 * k, 192, 'Section of the design strip'));
  return svg;
}

export default {
  id: 'rc/one-way-slab', group: 'rc', title: 'One-way slabs',
  methods: ['USD'],
  modes: [{ id: 'strip', label: 'Design strip', icon: 'slab' }],
  steps: ['Setup', 'Geometry', 'Materials', 'Loads', 'Results'],
  fields, presets, solve, draw,
  stepHelp: (step) => (step === 'Loads' ? 'The moment and shear are per metre of slab width. Leave the shear empty to skip the shear check.' : '')
};
