// Wall footings: module definition and live drawing.
import { solve } from './wall.calc.js';
import presets from '../../../presets/found-wall.js';
import { fcField, fyField, num, bar, sel } from '../rc/fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, poly, circle, arrow } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const D = ed.found.defaults;
  const f = [num('wD', 'service dead load per metre', 'wD', 'lineload', 'Wall', 180), num('wL', 'service live load per metre', 'wL', 'lineload', 'Wall', 120),
    num('t', 'wall thickness', 't', 'length_mm', 'Wall', 300), sel('wallType', 'Wall type', 'Wall', 'concrete', [{ value: 'concrete', label: 'Concrete wall' }, { value: 'masonry', label: 'Masonry wall' }]),
    num('qa', 'allowable soil pressure', 'qa', 'pressure', 'Soil', 190), { key: 'qaNet', type: 'check', label: 'qa is already the net allowable pressure', step: 'Soil', default: false }];
  if (!val.qaNet) f.push(num('Df', 'depth of the footing base below grade', 'Df', 'length_m', 'Soil', 1.2), num('gammaC', 'unit weight of concrete', 'γc', 'unitweight', 'Soil', D.gammaC), num('gammaS', 'unit weight of soil', 'γs', 'unitweight', 'Soil', D.gammaS));
  f.push(num('h', 'footing thickness', 'h', 'length_mm', 'Footing', 350), bar('db', 'main bar size', 'Footing', 16, { sizes: [10, 12, 16, 20, 25] }), bar('dbl', 'longitudinal bar size', 'Footing', 12, { sizes: [10, 12, 16] }),
    fcField(ed, 'Materials', { default: 21 }), fyField(ed, 'Materials'));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 250, 'Wall footing cross-section with the soil pressure', o);
  if (!(D.B > 0)) return svg;
  const Bm = D.B * 1000, F = fit(Bm, D.h * 3.6, 90, 20, 300, 190), k = F.k, x0 = F.x(0), top = F.y(D.h * 1.5), bot = top + D.h * k, cx = F.x(Bm / 2);
  svg.add(rect(x0, top, Bm * k, D.h * k, 'conc'), rect(cx - D.t * k / 2, top - D.h * 1.5 * k, D.t * k, D.h * 1.5 * k, 'conc'));
  const yd = top + D.d * k;
  svg.add(line(x0 + 8, yd, x0 + Bm * k - 8, yd, 'barline'));
  for (let i = 0; i < (D.nLong || 0); i++) svg.add(circle(x0 + 16 + (Bm * k - 32) * i / Math.max(D.nLong - 1, 1), yd - 6, 2.5));
  const xs = cx + (D.t / 2 + D.d) * k;
  if (xs < x0 + Bm * k) svg.add(line(xs, top - 8, xs, bot + 8, 'na'), text(xs + 4, top - 10, 'shear section at d'));
  svg.add(poly([[x0, bot + 6], [x0 + Bm * k, bot + 6], [x0 + Bm * k, bot + 30], [x0, bot + 30]]), text(cx, bot + 22, D.qu ? 'qu = ' + o.fq(D.qu, 'pressure') : '', 'middle'));
  svg.add(dimH(x0, x0 + Bm * k, bot + 40, 'B = ' + o.fq(D.B, 'length_m')), dimV(x0 - 10, top, bot, 'h = ' + o.fq(D.h, 'length_mm', false)), arrow(cx, top - D.h * 1.5 * k - 22, cx, top - D.h * 1.5 * k - 2), text(cx + 6, top - D.h * 1.5 * k - 10, 'wu'));
  if (D.s) svg.add(text(x0, top - 8, 'main bars at ' + o.fq(D.s, 'length_mm')));
  svg.add(cap(cx, 244, 'Section (one metre of wall)'));
  return svg;
}

export default {
  id: 'found/wall', group: 'found', title: 'Wall footings',
  methods: [],
  modes: [{ id: 'design', label: 'Design', icon: 'footing' }],
  steps: ['Setup', 'Wall', 'Soil', 'Footing', 'Materials', 'Results'],
  fields, presets, solve, draw,
  stepHelp: (step) => (step === 'Wall' ? 'Loads are per metre of wall. For a masonry wall the moment is taken halfway between the middle and the edge of the wall.' : '')
};
