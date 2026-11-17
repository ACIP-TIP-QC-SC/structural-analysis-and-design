// Steel beams: module definition and live drawing.
import { solve } from './beams.calc.js';
import presets from '../../../presets/steel-beams.js';
import { num, sel, gradeFields, iProps, estimatePatch, W250x45 } from './fields.js';
import { estimateI } from '../../core/shapes.js';
import { canvas, fit, rect, line, text, cap, path, iShape, arrow, lineChart, hatch, poly } from '../../ui/drawing.js';
import { fromSI } from '../../core/units.js';

const DIMS = ['dsec', 'bf', 'tf', 'tw'];
const PROPS = { flexure: ['Zx', 'Sx', 'ry', 'J', 'rts', 'ho', 'bf2tf', 'htw', 'Zy', 'Sy'], shear: ['dsec', 'tw', 'htw'], deflection: ['Ix'] };

function fields(mode, method, val, ed) {
  const keys = PROPS[mode].concat(DIMS.filter((k) => !PROPS[mode].includes(k)));
  const f = [{ type: 'shape', key: 'shape', label: 'Section (W and S shapes)', step: 'Section', default: 'W250x45', types: ['W', 'S'], props: iProps(keys, W250x45, DIMS.filter((k) => !PROPS[mode].includes(k))) }];
  if (val.shape === 'custom') f.push({ type: 'action', key: 'estimate', step: 'Section', label: 'Estimate properties', hint: 'Fills the properties from d, bf, tf and tw, ignoring fillets (estimated).',
    run: (si) => (si.dsec > 0 && si.bf > 0 && si.tf > 0 && si.tw > 0 ? estimatePatch(estimateI(si.dsec, si.bf, si.tf, si.tw), keys) : null) });
  if (mode === 'deflection') {
    const T = ed.theory.deflection, point = T[val.defCase || 'simpleUniform'].point;
    f.push(sel('defCase', 'Beam and load', 'Loading', 'simpleUniform', [{ value: 'simpleUniform', label: 'Simply supported, uniform load' }, { value: 'simplePoint', label: 'Simply supported, point load at midspan' },
      { value: 'cantileverUniform', label: 'Cantilever, uniform load' }, { value: 'cantileverPoint', label: 'Cantilever, point load at the end' }], { wide: true }),
      num('span', 'span', 'L', 'length_mm', 'Loading', 6000), point ? num('load', 'service point load', 'P', 'force', 'Loading', 12) : num('load', 'service uniform load', 'w', 'lineload', 'Loading', 12),
      num('limitRatio', 'limit ratio: Δ ≤ L divided by', '', 'ratio', 'Loading', ed.steel.deflection.limit));
    return f;
  }
  f.push(...gradeFields(ed, val, 'Material', 'A992', false));
  if (mode === 'shear') { f.push(num('V', 'required shear strength (' + (method || 'LRFD') + ')', method === 'ASD' ? 'Va' : 'Vu', 'force', 'Loads', 250)); return f; }
  f.push(sel('axis', 'Bending axis', 'Bracing', 'major', [{ value: 'major', label: 'Major axis (x)' }, { value: 'minor', label: 'Minor axis (y)' }]));
  if (val.axis !== 'minor') {
    f.push(num('Lb', 'unbraced length', 'Lb', 'length_mm', 'Bracing', 1200), sel('cbFrom', 'Cb', 'Bracing', 'typed', [{ value: 'typed', label: 'Typed value' }, { value: 'moments', label: 'From Mmax, MA, MB, MC' }]));
    if (val.cbFrom === 'moments') f.push(num('Mmax', 'largest moment in the segment', 'Mmax', 'moment', 'Bracing', 100), num('MA', 'moment at the quarter point', 'MA', 'moment', 'Bracing', 75), num('MB', 'moment at the centre', 'MB', 'moment', 'Bracing', 100), num('MC', 'moment at the three-quarter point', 'MC', 'moment', 'Bracing', 75));
    else f.push(num('Cb', 'lateral-torsional buckling factor', 'Cb', 'ratio', 'Bracing', 1.0, { min: 1, max: 3 }));
  }
  f.push(num('Mreq', 'required flexural strength (' + (method || 'LRFD') + ')', method === 'ASD' ? 'Ma' : 'Mu', 'moment', 'Loads', 120));
  return f;
}

function section(svg, D, x, y, w, hh, shear) {
  if (!(D.dsec > 0 && D.bf > 0 && D.tf > 0 && D.tw > 0)) return;
  const F = fit(D.bf, D.dsec, x, y, w, hh), k = F.k;
  svg.add(iShape(F.x(D.bf / 2), F.y(0), D.dsec * k, D.bf * k, Math.max(D.tf * k, 2), Math.max(D.tw * k, 1.5)));
  if (shear) svg.add(rect(F.x(D.bf / 2) - Math.max(D.tw * k, 1.5) / 2, F.y(0), Math.max(D.tw * k, 1.5), D.dsec * k, 'comp'));
  svg.add(cap(F.x(D.bf / 2), y + hh + 34, 'Section'));
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'deflection') {
    const svg = canvas(520, 200, 'Beam with its deflected shape', o), x0 = 70, x1 = 450, y = 80;
    svg.add(line(x0, y, x1, y, 'ax'));
    if (D.cantilever) svg.add(rect(x0 - 14, y - 34, 14, 68, 'conc'), path(`M${x0},${y} Q${(x0 + x1) / 2},${y} ${x1},${y + 46}`, 'markline'), text(x1 + 6, y + 50, 'Δ = ' + o.fq(D.delta, 'length_mm')));
    else svg.add(poly([[x0, y], [x0 - 9, y + 14], [x0 + 9, y + 14]], 'conc'), poly([[x1, y], [x1 - 9, y + 14], [x1 + 9, y + 14]], 'conc'), path(`M${x0},${y} Q${(x0 + x1) / 2},${y + 80} ${x1},${y}`, 'markline'), text((x0 + x1) / 2, y + 58, 'Δ = ' + o.fq(D.delta, 'length_mm'), 'middle'));
    if (D.point) { const xp = D.cantilever ? x1 : (x0 + x1) / 2; svg.add(arrow(xp, y - 44, xp, y - 3), text(xp + 6, y - 34, 'P')); }
    else { for (let x = x0; x <= x1 + 1; x += 38) svg.add(arrow(x, y - 30, x, y - 3)); svg.add(line(x0, y - 30, x1, y - 30, 'ax'), text(x1 + 6, y - 26, 'w')); }
    svg.add(cap(260, 190, 'Deflected shape (not to scale), L = ' + o.fq(D.span, 'length_mm')));
    return svg;
  }
  if (D.kind === 'shear' || D.minor || !D.curve) {
    const svg = canvas(520, 240, 'Cross-section of the beam', o);
    section(svg, D, 190, 30, 140, 160, D.kind === 'shear');
    if (D.kind === 'shear') svg.add(text(350, 110, 'web area Aw = d · tw'));
    return svg;
  }
  const svg = canvas(520, 270, 'Section and chart of available moment against unbraced length', o);
  section(svg, D, 14, 60, 80, 120, false);
  svg.add(lineChart({ x: 170, y: 30, w: 320, h: 180, series: [{ pts: D.curve.map((p) => [fromSI(p[0] / 1000, 'length_m', o.sys), fromSI(p[1], 'moment', o.sys)]) }],
    xLabel: 'Unbraced length Lb, ' + (o.sys === 'US' ? 'ft' : 'm'), yLabel: 'Available moment, ' + (o.sys === 'US' ? 'kip·ft' : 'kN·m'),
    vlines: [{ x: fromSI(D.Lp / 1000, 'length_m', o.sys), label: 'Lp' }, { x: fromSI(D.Lr / 1000, 'length_m', o.sys), label: 'Lr' }],
    markers: [{ x: fromSI(D.Lb / 1000, 'length_m', o.sys), y: fromSI(D.avail, 'moment', o.sys), label: 'current Lb' }] }));
  return svg;
}

export default {
  id: 'steel/beams', group: 'steel', title: 'Beams',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'flexure', label: 'Flexure', icon: 'ishape' }, { id: 'shear', label: 'Shear', icon: 'shearI' }, { id: 'deflection', label: 'Deflection', icon: 'deflect' }],
  steps: (mode) => (mode === 'flexure' ? ['Setup', 'Section', 'Material', 'Bracing', 'Loads', 'Results'] : mode === 'shear' ? ['Setup', 'Section', 'Material', 'Loads', 'Results'] : ['Setup', 'Section', 'Loading', 'Results']),
  fields, presets, solve, draw,
  stepHelp: (step) => (step === 'Bracing' ? 'Lb is the distance between points braced against lateral movement of the compression flange. Cb = 1.0 is conservative.' : step === 'Loading' ? 'Use service loads for deflection. Limits are set by the designer; L/360 is a common limit for live load.' : '')
};
