// Isolated footings: module definition and live drawing (plan and section).
import { solve } from './isolated.calc.js';
import presets from '../../../presets/found-isolated.js';
import { fcField, fyField, num, bar, sel } from '../rc/fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, poly, arrow } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const D = ed.found.defaults;
  const f = [num('PD', 'service dead load', 'PD', 'force', 'Column', 800), num('PL', 'service live load', 'PL', 'force', 'Column', 600),
    num('c1', 'column size along L', 'c1', 'length_mm', 'Column', 400), num('c2', 'column size along B', 'c2', 'length_mm', 'Column', 400),
    num('Ms', 'service moment about one axis (optional)', 'M', 'moment', 'Column', null, { optional: true }), num('Mu', 'factored moment (optional)', 'Mu', 'moment', 'Column', null, { optional: true }),
    num('Pu', 'factored load (optional; blank = from PD and PL)', 'Pu', 'force', 'Column', null, { optional: true }),
    num('qa', 'allowable soil pressure', 'qa', 'pressure', 'Soil', 200), { key: 'qaNet', type: 'check', label: 'qa is already the net allowable pressure', step: 'Soil', default: false }];
  if (!val.qaNet) f.push(num('Df', 'depth of the footing base below grade', 'Df', 'length_m', 'Soil', 1.5), num('gammaC', 'unit weight of concrete', 'γc', 'unitweight', 'Soil', D.gammaC), num('gammaS', 'unit weight of soil', 'γs', 'unitweight', 'Soil', D.gammaS));
  if (mode === 'analyze') f.push(num('B', 'footing width', 'B', 'length_m', 'Footing', 2.9), num('L', 'footing length', 'L', 'length_m', 'Footing', 2.9));
  else {
    f.push(sel('plan', 'Plan shape', 'Footing', 'square', [{ value: 'square', label: 'Square' }, { value: 'rect', label: 'Rectangular (length L given)' }]));
    if (val.plan === 'rect') f.push(num('L', 'footing length', 'L', 'length_m', 'Footing', 3.4));
  }
  f.push(num('h', 'footing thickness', 'h', 'length_mm', 'Footing', 550), bar('db', 'bar size', 'Footing', 20, { sizes: [12, 16, 20, 25, 28, 32] }), fcField(ed, 'Materials', { default: 21 }), fyField(ed, 'Materials'));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 270, 'Footing plan with critical sections and a section with the soil pressure', o);
  if (!(D.B > 0 && D.L > 0)) return svg;
  const Lm = D.L * 1000, Bm = D.B * 1000, F = fit(Lm, Bm, 40, 22, 210, 190), k = F.k, cx = F.x(Lm / 2), cy = F.y(Bm / 2);
  svg.add(rect(F.x(0), F.y(0), Lm * k, Bm * k, 'conc'));
  if (o.show.bars !== false && D.nL) {
    for (let i = 0; i < D.nL; i++) { const y = F.y(75 + (Bm - 150) * i / (D.nL - 1)); svg.add(line(F.x(60), y, F.x(Lm - 60), y, 'thin')); }
    for (let i = 0; i < D.nB; i++) { const x = F.x(75 + (Lm - 150) * i / (D.nB - 1)); svg.add(line(x, F.y(60), x, F.y(Bm - 60), 'thin')); }
  }
  svg.add(rect(cx - D.c1 * k / 2, cy - D.c2 * k / 2, D.c1 * k, D.c2 * k, 'bar'));
  if (D.d && o.show.sections !== false) {
    const p = rect(cx - (D.c1 + D.d) * k / 2, cy - (D.c2 + D.d) * k / 2, (D.c1 + D.d) * k, (D.c2 + D.d) * k, 'na'); svg.add(p);
    const xs = cx + (D.c1 / 2 + D.d) * k; if (xs < F.x(Lm)) svg.add(line(xs, F.y(0), xs, F.y(Bm), 'markline'));
    const ys = cy + (D.c2 / 2 + D.d) * k; if (ys < F.y(Bm)) svg.add(line(F.x(0), ys, F.x(Lm), ys, 'markline'));
  }
  svg.add(dimH(F.x(0), F.x(Lm), F.y(Bm) + 10, 'L = ' + o.fq(D.L, 'length_m')), dimV(F.x(0) - 10, F.y(0), F.y(Bm), 'B = ' + o.fq(D.B, 'length_m', false)), cap(cx, 262, 'Plan'));
  // section along L with the pressure diagram
  const G = fit(Lm, D.h * 3.2, 300, 40, 150, 150), gk = G.k, gx = G.x(0), top = G.y(D.h * 1.2), bot = top + D.h * gk, gcx = G.x(Lm / 2);
  svg.add(rect(gx, top, Lm * gk, D.h * gk, 'conc'), rect(gcx - D.c1 * gk / 2, top - D.h * gk * 1.2, D.c1 * gk, D.h * gk * 1.2, 'conc'));
  if (D.qu) {
    const hi = 34, a = D.quMin / D.quMax * hi;
    svg.add(poly([[gx, bot + 6], [gx + Lm * gk, bot + 6], [gx + Lm * gk, bot + 6 + hi], [gx, bot + 6 + a]]));
    svg.add(text(gcx, bot + hi + 22, 'qu = ' + o.fq(D.quMax, 'pressure') + (D.quMin < D.quMax ? ' max' : ''), 'middle'));
  }
  svg.add(arrow(gcx, top - D.h * gk * 1.2 - 24, gcx, top - D.h * gk * 1.2 - 2), text(gcx + 6, top - D.h * gk * 1.2 - 12, 'Pu'), dimV(gx + Lm * gk + 10, top, bot, 'h = ' + o.fq(D.h, 'length_mm', false), true), cap(gcx, 262, 'Section'));
  return svg;
}

export default {
  id: 'found/isolated', group: 'found', title: 'Isolated footings',
  methods: [],
  modes: [{ id: 'design', label: 'Design', icon: 'footing' }, { id: 'analyze', label: 'Analyze', icon: 'footplan' }],
  steps: ['Setup', 'Column', 'Soil', 'Footing', 'Materials', 'Results'],
  fields, presets, solve, draw,
  drawOptions: [{ key: 'sections', label: 'Critical sections' }, { key: 'bars', label: 'Bar layout' }],
  stepHelp(step, mode) {
    if (step === 'Column') return 'Service loads size the footing; factored loads design it. The loads can also arrive from Load transfer or Load combinations. The moment acts about the axis parallel to B, so the pressure varies along L.';
    if (step === 'Footing' && mode === 'design') return 'The plan size is found from the service loads. Choose a thickness and check the shear results; increase it if a shear check fails.';
    return '';
  },
  setupNote: 'Concentrically loaded square or rectangular footing under a rectangular column. In the plan, the dashed line is the two-way shear section at d/2 and the orange lines are the one-way shear sections at d.'
};
