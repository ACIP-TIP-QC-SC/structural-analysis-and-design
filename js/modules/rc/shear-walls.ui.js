// Shear walls (basic): module definition and live drawing.
import { solve } from './shear-walls.calc.js';
import presets from '../../../presets/rc-shear-walls.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, arrow, lineChart } from '../../ui/drawing.js';
import { fromSI } from '../../core/units.js';

function fields(mode, method, val, ed) {
  const W = ed.concrete.wall;
  if (mode === 'axial') {
    const f = [sel('method', 'Method', 'Wall', 'simplified', [{ value: 'simplified', label: 'Simplified (resultant within the middle third of the thickness)' }, { value: 'interaction', label: 'In-plane axial force and moment (interaction diagram)' }], { wide: true }),
      num('h', 'wall thickness', 'h', 'length_mm', 'Wall', 200), fcField(ed, 'Wall')];
    if (val.method === 'interaction') f.push(num('lw', 'wall length', 'ℓw', 'length_mm', 'Wall', 4000), fyField(ed, 'Wall'), bar('dbV', 'vertical bar size', 'Bars', 16),
      num('sV', 'vertical bar spacing', 's', 'length_mm', 'Bars', 300), num('curtains', 'curtains', '', 'count', 'Bars', 2, { min: 1, max: 2 }), num('cover', 'cover to the bars', '', 'length_mm', 'Bars', 25),
      num('Pu', 'factored axial load', 'Pu', 'force', 'Loads', 1200, { optional: true }), num('Mu', 'factored in-plane moment', 'Mu', 'moment', 'Loads', 1500, { optional: true }));
    else f.push(num('strip', 'design length of wall', '', 'length_mm', 'Wall', 1000), num('lc', 'vertical distance between supports', 'ℓc', 'length_mm', 'Wall', 3000),
      sel('k', 'Effective length factor', 'Wall', 0.8, W.simplified.kValues, { wide: true }), num('lu', 'unsupported length, if less than ℓc (optional)', '', 'length_mm', 'Wall', null, { optional: true }),
      num('Pu', 'factored axial load on the strip', 'Pu', 'force', 'Loads', 1500, { optional: true }), num('e', 'eccentricity across the thickness', 'e', 'length_mm', 'Loads', 0, { min: 0 }));
    return f;
  }
  const f = [num('h', 'wall thickness', 'h', 'length_mm', 'Wall', 250), num('lw', 'wall length', 'ℓw', 'length_mm', 'Wall', 4000), num('hw', 'wall height', 'hw', 'length_mm', 'Wall', 3000),
    fcField(ed, 'Wall'), fyField(ed, 'Wall'), num('lambda', 'lightweight factor', 'λ', 'ratio', 'Wall', 1, { min: 0.75, max: 1 }),
    bar('dbH', 'horizontal bar size', 'Bars', 12), bar('dbV', 'vertical bar size', 'Bars', 12), num('curtains', 'curtains', '', 'count', 'Bars', 2, { min: 1, max: 2 })];
  if (mode === 'shear') f.push(num('s', 'horizontal bar spacing (optional; blank = designed)', 's', 'length_mm', 'Bars', null, { optional: true }),
    num('Vu', 'factored in-plane shear', 'Vu', 'force', 'Loads', 900), num('Nu', 'factored axial compression (for the note)', 'Nu', 'force', 'Loads', null, { optional: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'interaction' && D.curve) {
    const svg = canvas(520, 290, 'In-plane interaction diagram of the wall', o), mx = (m) => fromSI(m, 'moment', o.sys), fz = (p) => fromSI(p, 'force', o.sys);
    svg.add(lineChart({ x: 90, y: 26, w: 400, h: 210, series: [{ pts: D.curve.nominal.map((p) => [mx(p[0]), fz(p[1])]), cls: 'line2' }, { pts: D.curve.design.map((p) => [mx(p[0]), fz(p[1])]) }],
      markers: D.demand ? [{ x: mx(D.demand.M), y: fz(D.demand.P), label: 'demand' }] : [], ray: D.demand ? { x: mx(D.demand.M), y: fz(D.demand.P) } : null,
      xLabel: 'Mn and φMn, ' + (o.sys === 'US' ? 'kip·ft' : 'kN·m'), yLabel: 'Pn and φPn, ' + (o.sys === 'US' ? 'kip' : 'kN') }));
    return svg;
  }
  if (D.kind === 'strip') {
    const svg = canvas(520, 220, 'Wall strip in elevation with its axial load', o);
    svg.add(rect(230, 30, 40, 160, 'conc'), line(200, 30, 300, 30, 'ax'), line(200, 190, 300, 190, 'ax'), arrow(250, 4, 250, 28, 'markline'), text(256, 16, 'Pu'));
    svg.add(dimV(320, 30, 190, 'ℓc = ' + o.fq(D.lc, 'length_mm'), true), dimH(230, 270, 204, 'h'), cap(250, 216, 'Section (not to scale)'));
    return svg;
  }
  const svg = canvas(520, 240, 'Wall elevation with the reinforcement grid', o);
  if (!(D.lw > 0)) return svg;
  const hw = D.hw > 0 ? D.hw : D.lw * 0.75, F = fit(D.lw, hw, 60, 20, 380, 165), k = F.k;
  svg.add(rect(F.x(0), F.y(0), D.lw * k, hw * k, 'conc'));
  if (D.sT > 0) for (let y = D.sT; y < hw; y += D.sT) svg.add(line(F.x(0) + 4, F.y(hw - y), F.x(D.lw) - 4, F.y(hw - y), 'thin'));
  if (D.sL > 0) for (let x = D.sL; x < D.lw; x += D.sL) svg.add(line(F.x(x), F.y(0) + 4, F.x(x), F.y(hw) - 4, 'thin'));
  svg.add(arrow(F.x(0) - 40, F.y(0) + 10, F.x(0) - 4, F.y(0) + 10, 'markline'), text(F.x(0) - 44, F.y(0) + 6, 'Vu', 'end'));
  svg.add(dimH(F.x(0), F.x(D.lw), F.y(hw) + 10, 'ℓw = ' + o.fq(D.lw, 'length_mm')), dimV(F.x(D.lw) + 12, F.y(0), F.y(hw), 'hw', true), cap(250, 234, 'Elevation'));
  return svg;
}

export default {
  id: 'rc/shear-walls', group: 'rc', title: 'Shear walls (basic)',
  methods: ['USD'],
  modes: [{ id: 'shear', label: 'In-plane shear', icon: 'wall' }, { id: 'axial', label: 'Axial and flexure', icon: 'wall' }, { id: 'minimum', label: 'Minimum steel', icon: 'wall' }],
  steps: (mode) => (mode === 'minimum' ? ['Setup', 'Wall', 'Bars', 'Results'] : mode === 'axial' ? ['Setup', 'Wall', 'Bars', 'Loads', 'Results'] : ['Setup', 'Wall', 'Bars', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Ordinary cast-in-place structural walls, non-prestressed. Special (seismic) walls are outside the scope.'
};
