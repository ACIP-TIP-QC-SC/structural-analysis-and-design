// Retaining walls: module definition and live drawing.
import { solve } from './retaining.calc.js';
import presets from '../../../presets/found-retaining.js';
import { fcField, fyField, num, bar, sel } from '../rc/fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, poly, arrow } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const f = [num('hs', 'stem height', 'hs', 'length_m', 'Wall', 4.5), num('tTop', 'stem thickness at the top', '', 'length_mm', 'Wall', 400), num('tBot', 'stem thickness at the bottom', '', 'length_mm', 'Wall', 400),
    num('hb', 'base thickness', '', 'length_m', 'Wall', 0.5), num('toe', 'toe length', '', 'length_m', 'Wall', 0.8, { min: 0 }), num('heel', 'heel length', '', 'length_m', 'Wall', 1.8),
    num('gammaC', 'unit weight of concrete', 'γc', 'unitweight', 'Wall', ed.found.defaults.gammaC),
    num('gamma', 'backfill unit weight', 'γ', 'unitweight', 'Soil', 18), num('phi', 'backfill friction angle', "φ'", 'angle_deg', 'Soil', 30), num('beta', 'backfill slope', 'β', 'angle_deg', 'Soil', 0, { min: 0 }),
    num('q', 'surcharge', 'q', 'pressure', 'Soil', 0, { min: 0 }),
    sel('method', 'Active pressure', 'Soil', 'rankine', [{ value: 'rankine', label: 'Rankine' }, { value: 'coulomb', label: 'Coulomb (vertical back, wall friction δ)' }], { wide: true })];
  if (val.method === 'coulomb') f.push(num('delta', 'wall friction angle', 'δ', 'angle_deg', 'Soil', 20));
  f.push(num('mu', 'base friction coefficient', 'μ', 'ratio', 'Base', 0.55), num('adhesion', 'base adhesion (optional)', '', 'pressure', 'Base', 0, { min: 0 }),
    num('Dp', 'depth of soil in front for passive resistance (optional)', '', 'length_m', 'Base', 0, { min: 0 }), num('qa', 'allowable soil pressure', 'qa', 'pressure', 'Base', 200));
  if (mode === 'design') f.push(fcField(ed, 'Concrete'), fyField(ed, 'Concrete'), num('dStem', 'stem effective depth at the base', 'd', 'length_mm', 'Concrete', 330),
    bar('dbStem', 'stem bar size', 'Concrete', 20), bar('dbBase', 'base bar size', 'Concrete', 16), num('AsProv', 'stem steel provided per metre (optional)', 'As', 'area_per_m', 'Concrete', null, { optional: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 300, 'Retaining wall section with the earth pressure and the base pressure', o);
  if (!(D.H > 0 && D.B > 0)) return svg;
  const F = fit(D.B + 1.6, D.H + 1.4, 40, 20, 420, 240), X = (x) => F.x(x + 0.4), Y = (y) => F.y(D.H + 0.3 - y);
  const xs = D.toe, xb = D.toe + D.tBot, xh = D.B;
  svg.add(poly([[X(xb), Y(D.hb)], [X(xh + 1.0), Y(D.hb)], [X(xh + 1.0), Y(D.H + (xh + 1.0 - xb) * Math.tan(D.beta * Math.PI / 180))], [X(xb), Y(D.H)]], 'soil'));
  svg.add(rect(X(0), Y(D.hb), D.B * F.k, D.hb * F.k, 'conc'), poly([[X(xs), Y(D.hb)], [X(xb), Y(D.hb)], [X(xb), Y(D.H)], [X(xb - D.tTop), Y(D.H)]], 'conc'));
  const px = X(xh + 1.0) + 8, top = Y(D.H), bot = Y(0), wv = 50;
  svg.add(poly([[px, top], [px, bot], [px + wv, bot]]), text(px + wv + 4, bot - 6, 'earth pressure'), arrow(px + 40, Y(D.H / 3), px + 4, Y(D.H / 3), 'markline'), text(px + 44, Y(D.H / 3) + 4, 'Pa'));
  if (D.qmax > 0) {
    const s = 40 / D.qmax;
    svg.add(poly([[X(0), bot + 4], [X(D.B), bot + 4], [X(D.B), bot + 4 + D.qmin * s], [X(0), bot + 4 + D.qmax * s]]), text(X(0), bot + 4 + D.qmax * s + 14, 'qmax = ' + o.fq(D.qmax, 'pressure')));
  }
  svg.add(dimV(X(0) - 10, Y(D.H), Y(0), 'H = ' + o.fq(D.H, 'length_m', false)), dimH(X(0), X(D.B), Y(D.H) - 12, 'B = ' + o.fq(D.B, 'length_m'), true), cap(260, 296, 'Section (one metre of wall)'));
  return svg;
}

export default {
  id: 'found/retaining', group: 'found', title: 'Retaining walls',
  methods: [],
  modes: [{ id: 'stability', label: 'Stability', icon: 'wall' }, { id: 'design', label: 'Stem and base', icon: 'wall' }],
  steps: (mode) => (mode === 'design' ? ['Setup', 'Wall', 'Soil', 'Base', 'Concrete', 'Results'] : ['Setup', 'Wall', 'Soil', 'Base', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Cantilever wall with a level or sloping backfill. Stability uses service loads; the stem and base use factored loads.'
};
