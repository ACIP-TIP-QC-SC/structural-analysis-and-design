// Columns: module definition and live drawings.
import { solve } from './columns.calc.js';
import presets from '../../../presets/rc-columns.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, circle, path, arrow, lineChart, g } from '../../ui/drawing.js';
import { fromSI } from '../../core/units.js';
import { fmt } from '../../core/format.js';

const SHAPES = [{ value: 'rect', label: 'Rectangular, tied' }, { value: 'circular', label: 'Circular, spiral' }];

function fields(mode, method, val, ed) {
  const f = [];
  if (mode === 'axial') {
    f.push(sel('shape', 'Section', 'Section', 'rect', SHAPES, { wide: true }));
    if (val.task === 'design') {
      f.push(num('rho', 'chosen steel ratio', 'ρg', 'ratio', 'Reinforcement', 0.02, { min: 0.01, max: 0.08 }), bar('db', 'bar size', 'Reinforcement', 25, { sizes: [16, 20, 25, 28, 32, 36] }));
      if (val.shape !== 'circular') f.push(num('b', 'chosen width (optional; blank = rounded side)', 'b', 'length_mm', 'Section', null, { optional: true }), num('h', 'chosen depth (optional)', 'h', 'length_mm', 'Section', null, { optional: true }));
    } else {
      if (val.shape === 'circular') f.push(num('D', 'diameter', 'D', 'length_mm', 'Section', 500));
      else f.push(num('b', 'width', 'b', 'length_mm', 'Section', 400), num('h', 'depth', 'h', 'length_mm', 'Section', 400));
      f.push(num('n', 'number of bars', 'n', 'count', 'Reinforcement', 8, { min: 4, max: 40 }), bar('db', 'bar size', 'Reinforcement', 25, { sizes: [16, 20, 25, 28, 32, 36] }));
    }
    f.push(fcField(ed, 'Materials'), fyField(ed, 'Materials'));
    f.push(num('Pu', method === 'WSD' ? 'service axial load' : (val.task === 'design' ? 'factored axial load' : 'factored axial load (optional)'), method === 'WSD' ? 'P' : 'Pu', 'force', 'Loads', 2500, val.task === 'design' ? null : { optional: true }));
    return f;
  }
  if (mode === 'interaction') {
    f.push(num('b', 'width', 'b', 'length_mm', 'Section', 400), num('h', 'depth in the direction of bending', 'h', 'length_mm', 'Section', 400),
      sel('confinement', 'Transverse reinforcement', 'Section', 'tied', [{ value: 'tied', label: 'Ties' }, { value: 'spiral', label: 'Spiral' }]),
      fcField(ed, 'Materials'), fyField(ed, 'Materials'),
      sel('layerFrom', 'Bars', 'Reinforcement', 'helper', [{ value: 'helper', label: 'From the number and size of bars' }, { value: 'layers', label: 'Typed layers' }], { wide: true }));
    if (val.layerFrom === 'layers') f.push({ key: 'layers', type: 'list', label: 'Bar layers (depth from the compression face, area)', step: 'Reinforcement', minRows: 1, maxRows: 20,
      columns: [{ key: 'd', label: 'Depth d', quantity: 'length_mm' }, { key: 'As', label: 'Area As', quantity: 'area' }],
      default: [{ d: 62.5, As: 1472.6 }, { d: 200, As: 981.75 }, { d: 337.5, As: 1472.6 }] });
    else f.push(num('n', 'number of bars', 'n', 'count', 'Reinforcement', 8, { min: 4 }), bar('db', 'bar size', 'Reinforcement', 25, { sizes: [16, 20, 25, 28, 32, 36] }),
      num('cover', 'clear cover to the tie', '', 'length_mm', 'Reinforcement', 40), bar('tie', 'tie size', 'Reinforcement', 10, { sizes: [10, 12] }),
      sel('arrangement', 'Arrangement', 'Reinforcement', 'four', [{ value: 'four', label: 'All four faces' }, { value: 'two', label: 'Two faces' }]));
    f.push(num('Pu', 'factored axial load', 'Pu', 'force', 'Loads', 1500, { optional: true }), num('Mu', 'factored moment', 'Mu', 'moment', 'Loads', 225, { optional: true }),
      num('cAt', 'report the point at this neutral axis depth (optional)', 'c', 'length_mm', 'Loads', null, { optional: true }));
    return f;
  }
  if (mode === 'ties') {
    f.push(sel('detail', 'Detail', 'Reinforcement', 'ties', [{ value: 'ties', label: 'Ties' }, { value: 'spiral', label: 'Spiral' }], { wide: true }));
    if (val.detail === 'spiral') f.push(num('D', 'column diameter', 'D', 'length_mm', 'Reinforcement', 500), num('cover', 'cover to the outside of the spiral', '', 'length_mm', 'Reinforcement', 40),
      bar('dsp', 'spiral bar size', 'Reinforcement', 10, { sizes: [10, 12, 16] }), fcField(ed, 'Reinforcement'),
      { key: 'fyt', label: 'spiral yield strength', symbol: 'fyt', quantity: 'stress', step: 'Reinforcement', default: 420, choices: ed.concrete.fyChoices });
    else f.push(bar('db', 'longitudinal bar size', 'Reinforcement', 25), bar('dt', 'tie size', 'Reinforcement', 10, { sizes: [10, 12, 16] }),
      num('least', 'least column dimension', '', 'length_mm', 'Reinforcement', 400), num('sProv', 'tie spacing provided (optional)', 's', 'length_mm', 'Reinforcement', null, { optional: true }));
    return f;
  }
  f.push(sel('shape', 'Section', 'Section', 'rect', SHAPES, { wide: true }));
  if (val.shape === 'circular') f.push(num('D', 'diameter', 'D', 'length_mm', 'Section', 500));
  else f.push(num('b', 'width', 'b', 'length_mm', 'Section', 400), num('h', 'depth in the direction of bending', 'h', 'length_mm', 'Section', 400));
  f.push(sel('frame', 'Frame', 'Section', 'braced', [{ value: 'braced', label: 'Braced against sidesway' }, { value: 'unbraced', label: 'Not braced (sway)' }]),
    num('lu', 'unsupported length', 'ℓu', 'length_mm', 'Section', 6000), num('k', 'effective length factor', 'k', 'ratio', 'Section', 1.0, { min: 0.5, max: 2 }),
    fcField(ed, 'Materials'), num('betaDns', 'sustained load ratio', 'βdns', 'ratio', 'Materials', 0.6, { min: 0, max: 1 }),
    num('Pu', 'factored axial load', 'Pu', 'force', 'Loads', 1000), num('M2', 'larger end moment', 'M2', 'moment', 'Loads', 120), num('M1', 'smaller end moment', 'M1', 'moment', 'Loads', 60),
    sel('curvature', 'Curvature', 'Loads', 'single', [{ value: 'single', label: 'Single curvature (M1/M2 negative)' }, { value: 'double', label: 'Double curvature (M1/M2 positive)' }], { wide: true }),
    { key: 'transverse', type: 'check', label: 'Transverse loads between the supports (Cm = ' + ed.concrete.column.Cm.transverse + ')', step: 'Loads', default: false });
  return f;
}

function sectionRect(svg, D, x, y, w, hh, o) {
  const F = fit(D.b, D.h, x, y, w, hh), k = F.k;
  svg.add(rect(F.x(0), F.y(0), D.b * k, D.h * k, 'conc'));
  return F;
}

function draw(result, o) {
  const D = result.diagram || {};
  const sys = o.sys, mx = (m) => fromSI(m, 'moment', sys), fz = (p) => fromSI(p, 'force', sys);
  if (D.kind === 'interaction' && D.curve) {
    const svg = canvas(520, 300, 'Interaction diagram with the section and the demand point', o);
    const F = sectionRect(svg, D, 10, 50, 110, 150, o), k = F.k;
    const ab = 3.5;
    (D.layers || []).forEach((l) => {
      const nn = l.n ? Math.max(2, Math.round(l.n)) : 2;
      for (let i = 0; i < nn; i++) svg.add(circle(F.x(D.b * 0.12 + D.b * 0.76 * i / (nn - 1)), F.y(l.d), ab));
    });
    if (D.cap && D.cap.c < D.h) svg.add(line(F.x(0) - 4, F.y(D.cap.c), F.x(D.b) + 4, F.y(D.cap.c), 'na'));
    svg.add(dimH(F.x(0), F.x(D.b), F.y(D.h) + 8, 'b = ' + o.fq(D.b, 'length_mm')), dimV(F.x(0) - 8, F.y(0), F.y(D.h), 'h', false));
    svg.add(text(F.x(D.b / 2), F.y(0) - 8, 'compression face', 'middle'));
    const series = [{ pts: D.curve.nominal.map((p) => [mx(p[0]), fz(p[1])]), cls: 'line2' }, { pts: D.curve.design.map((p) => [mx(p[0]), fz(p[1])]) }];
    const markers = D.demand ? [{ x: mx(D.demand.M), y: fz(D.demand.P), label: 'demand' }] : [];
    svg.add(lineChart({ x: 200, y: 26, w: 300, h: 220, series, markers, ray: D.demand ? { x: mx(D.demand.M), y: fz(D.demand.P) } : null,
      xLabel: 'Mn and φMn, ' + (sys === 'US' ? 'kip·ft' : 'kN·m'), yLabel: 'Pn and φPn, ' + (sys === 'US' ? 'kip' : 'kN') }));
    svg.add(g('dimg', text(500, 40, 'thin: nominal', 'end'), text(500, 54, 'thick: design', 'end')));
    return svg;
  }
  if (D.kind === 'slender') {
    const svg = canvas(520, 240, 'Column elevation with its deflected shape', o), x = 200;
    svg.add(line(x - 40, 20, x + 40, 20, 'ax'), line(x - 40, 210, x + 40, 210, 'ax'), line(x, 20, x, 210, 'dash'));
    svg.add(path(D.curvature === 'double' ? `M${x},20 C${x + 50},80 ${x - 50},150 ${x},210` : `M${x},20 Q${x + 60},115 ${x},210`, 'markline'));
    svg.add(arrow(x, -2 + 6, x, 18), text(x + 8, 14, 'Pu'), dimV(x - 60, 20, 210, 'ℓu = ' + o.fq(D.lu, 'length_mm', false)));
    svg.add(text(300, 100, D.curvature === 'double' ? 'double curvature' : 'single curvature'), text(300, 116, 'k = ' + fmt(D.k)), cap(x, 232, 'Elevation (not to scale)'));
    return svg;
  }
  if (D.kind === 'spiral' && D.D > 0) {
    const svg = canvas(520, 240, 'Circular column with its spiral', o), F = fit(D.D, D.D, 150, 20, 200, 200), k = F.k, cx = F.x(D.D / 2), cy = F.y(D.D / 2);
    svg.add(circle(cx, cy, D.D * k / 2, 'conc'), circle(cx, cy, (D.Dch - D.dsp) * k / 2, 'barline'), circle(cx, cy, D.Dch * k / 2, 'dash'));
    svg.add(dimH(cx - D.D * k / 2, cx + D.D * k / 2, cy + D.D * k / 2 + 8, 'D = ' + o.fq(D.D, 'length_mm')), text(cx, cy + 4, 'Dch = ' + o.fq(D.Dch, 'length_mm'), 'middle'));
    svg.add(text(370, 60, 'spiral ' + D.dsp + ' mm'), text(370, 76, 'pitch ' + o.fq(D.pitch, 'length_mm')));
    return svg;
  }
  if (D.kind === 'ties') {
    const svg = canvas(520, 220, 'Column elevation with ties at the maximum spacing', o), x0 = 200, w = 80;
    svg.add(rect(x0, 10, w, 180, 'conc'), line(x0 + 12, 10, x0 + 12, 190, 'barline'), line(x0 + w - 12, 10, x0 + w - 12, 190, 'barline'));
    for (let y = 30; y < 190; y += 50) svg.add(line(x0 + 6, y, x0 + w - 6, y, 'barline'));
    svg.add(dimV(x0 + w + 14, 30, 80, 's = ' + o.fq(D.s, 'length_mm'), true), cap(x0 + w / 2, 212, 'Elevation (spacing to scale only in the label)'));
    return svg;
  }
  // Axial: section with the bars.
  const svg = canvas(520, 230, 'Column cross-section with its bars', o);
  if (D.shape === 'circular' && D.D > 0) {
    const F = fit(D.D, D.D, 160, 14, 190, 190), k = F.k, cx = F.x(D.D / 2), cy = F.y(D.D / 2), rr = (D.D / 2 - 65) * k;
    svg.add(circle(cx, cy, D.D * k / 2, 'conc'));
    for (let i = 0; i < D.n; i++) { const t = 2 * Math.PI * i / D.n; svg.add(circle(cx + rr * Math.cos(t), cy + rr * Math.sin(t), Math.max(3, D.db * k / 2))); }
    svg.add(dimH(cx - D.D * k / 2, cx + D.D * k / 2, cy + D.D * k / 2 + 8, 'D = ' + o.fq(D.D, 'length_mm')));
    return svg;
  }
  if (!(D.b > 0 && D.h > 0)) return svg;
  const F = fit(D.b, D.h, 160, 14, 190, 180), k = F.k, inset = 62.5, n = Math.max(4, D.n || 4);
  svg.add(rect(F.x(0), F.y(0), D.b * k, D.h * k, 'conc'), rect(F.x(50), F.y(50), (D.b - 100) * k, (D.h - 100) * k, 'barline'));
  const per = Math.ceil(n / 4) + 1, pts = [];
  const xs = (i, m) => inset + (D.b - 2 * inset) * i / (m - 1), ys = (i, m) => inset + (D.h - 2 * inset) * i / (m - 1);
  for (let i = 0; i < per; i++) { pts.push([xs(i, per), inset], [xs(i, per), D.h - inset]); }
  for (let i = 1; i < per - 1 && pts.length < n; i++) { pts.push([inset, ys(i, per)], [D.b - inset, ys(i, per)]); }
  pts.slice(0, n).forEach((p) => svg.add(circle(F.x(p[0]), F.y(p[1]), Math.max(3, D.db * k / 2))));
  svg.add(dimH(F.x(0), F.x(D.b), F.y(D.h) + 8, 'b = ' + o.fq(D.b, 'length_mm')), dimV(F.x(0) - 10, F.y(0), F.y(D.h), 'h = ' + o.fq(D.h, 'length_mm', false)));
  return svg;
}

export default {
  id: 'rc/columns', group: 'rc', title: 'Columns',
  methods: ['USD', 'WSD'],
  modes: [{ id: 'axial', label: 'Axial', icon: 'column' }, { id: 'interaction', label: 'Interaction diagram', icon: 'column' }, { id: 'ties', label: 'Ties and spirals', icon: 'column' }, { id: 'slenderness', label: 'Slenderness', icon: 'column' }],
  tasks: (mode, method) => (mode === 'axial' && method !== 'WSD' ? [{ id: 'analyze', label: 'Analyze' }, { id: 'design', label: 'Design' }] : []),
  steps: (mode) => (mode === 'ties' ? ['Setup', 'Reinforcement', 'Results'] : mode === 'slenderness' ? ['Setup', 'Section', 'Materials', 'Loads', 'Results'] : ['Setup', 'Section', 'Materials', 'Reinforcement', 'Loads', 'Results']),
  fields, presets, solve, draw,
  stepHelp(step, mode, method) {
    if (mode === 'interaction' && step === 'Reinforcement') return 'Layer depths are measured from the compression face. The helper places corner bars and spreads the rest over the faces.';
    if (mode === 'slenderness' && step === 'Loads') return 'M1/M2 is negative in single curvature and positive in double curvature. A sway (unbraced) column that is slender needs a second-order analysis of the whole storey.';
    if (mode === 'axial' && method === 'WSD') return 'WSD reference mode: the allowable load is 0.40 Pn,max with φ = 1.';
    return '';
  }
};
