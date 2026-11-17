// Compression members: module definition and live drawing.
import { solve } from './compression.calc.js';
import presets from '../../../presets/steel-compression.js';
import { num, gradeFields, iProps, estimatePatch, W250x73 } from './fields.js';
import { estimateI } from '../../core/shapes.js';
import { canvas, fit, line, text, cap, path, iShape, hatch, arrow } from '../../ui/drawing.js';

const KEYS = ['Ag', 'rx', 'ry', 'bf2tf', 'htw', 'dsec', 'bf', 'tf', 'tw'];

function fields(mode, method, val, ed) {
  const f = [{ type: 'shape', key: 'shape', label: 'Section (W and S shapes)', step: 'Section', default: 'W250x73', types: ['W', 'S'], props: iProps(KEYS, W250x73, ['dsec', 'bf', 'tf', 'tw']) }];
  if (val.shape === 'custom') f.push({ type: 'action', key: 'estimate', step: 'Section', label: 'Estimate properties', hint: 'Fills the properties from d, bf, tf and tw, ignoring fillets (estimated).',
    run: (si) => (si.dsec > 0 && si.bf > 0 && si.tf > 0 && si.tw > 0 ? estimatePatch(estimateI(si.dsec, si.bf, si.tf, si.tw), KEYS) : null) });
  f.push(...gradeFields(ed, val, 'Material', 'A992', false));
  f.push(num('Kx', 'effective length factor, x axis', 'Kx', 'ratio', 'Lengths', 1), num('Lx', 'unbraced length, x axis', 'Lx', 'length_mm', 'Lengths', 4500),
    num('Ky', 'effective length factor, y axis', 'Ky', 'ratio', 'Lengths', 1), num('Ly', 'unbraced length, y axis', 'Ly', 'length_mm', 'Lengths', 4500),
    num('P', 'required compressive strength (' + (method || 'LRFD') + ')', method === 'ASD' ? 'Pa' : 'Pu', 'force', 'Loads', 1600));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 240, 'Column elevation with the buckled shape and the cross-section', o);
  svg.add(line(140, 30, 140, 190, 'ax'), hatch(120, 164, 190), line(118, 190, 162, 190, 'ax'), line(118, 30, 162, 30, 'ax'));
  svg.add(path('M140,30 Q190,110 140,190', 'markline'), arrow(140, 4, 140, 28), text(148, 14, 'P'));
  if (D.klr) svg.add(text(176, 106, 'buckles about the ' + D.axis + ' axis'), text(176, 122, 'KL/r = ' + o.fq(D.klr, 'ratio')));
  svg.add(cap(140, 232, 'Elevation'));
  if (D.dsec > 0 && D.bf > 0 && D.tf > 0 && D.tw > 0) {
    const F = fit(D.bf, D.dsec, 360, 50, 120, 120), k = F.k;
    svg.add(iShape(F.x(D.bf / 2), F.y(0), D.dsec * k, D.bf * k, Math.max(D.tf * k, 2), Math.max(D.tw * k, 1.5)));
    svg.add(line(F.x(0) - 12, F.y(D.dsec / 2), F.x(D.bf) + 12, F.y(D.dsec / 2), 'dash'), text(F.x(D.bf) + 15, F.y(D.dsec / 2) + 4, 'x'), line(F.x(D.bf / 2), F.y(0) - 12, F.x(D.bf / 2), F.y(D.dsec) + 12, 'dash'), text(F.x(D.bf / 2) - 3, F.y(0) - 15, 'y'));
    svg.add(cap(F.x(D.bf / 2), 232, 'Section'));
  }
  return svg;
}

export default {
  id: 'steel/compression', group: 'steel', title: 'Compression members',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'buckling', label: 'Flexural buckling', icon: 'ishape' }],
  steps: ['Setup', 'Section', 'Material', 'Lengths', 'Loads', 'Results'],
  fields, presets, solve, draw,
  stepHelp: (step) => (step === 'Lengths' ? 'KL is the effective length about each axis. Use different lengths when the weak axis is braced at mid-height.' : '')
};
