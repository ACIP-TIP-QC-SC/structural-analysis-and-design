// Steel beam-columns: module definition and live drawing.
import { solve } from './beam-columns.calc.js';
import presets from '../../../presets/steel-beam-columns.js';
import { num, sel, gradeFields, iProps, estimatePatch, W250x73 } from './fields.js';
import { estimateI } from '../../core/shapes.js';
import { canvas, fit, line, text, cap, iShape, arrow, path, hatch } from '../../ui/drawing.js';
import { fmt } from '../../core/format.js';

const KEYS = ['Ag', 'rx', 'ry', 'bf2tf', 'htw', 'Zx', 'Sx', 'J', 'rts', 'ho', 'Zy', 'Sy', 'Ix', 'Iy', 'dsec', 'bf', 'tf', 'tw'];

function fields(mode, method, val, ed) {
  const keys = mode === 'amplify' ? ['Ix', 'Iy', 'dsec', 'bf', 'tf', 'tw'] : KEYS;
  const f = [{ type: 'shape', key: 'shape', label: 'Section (W and S shapes)', step: 'Section', default: 'W250x73', types: ['W', 'S'], props: iProps(keys, W250x73, ['dsec', 'bf', 'tf', 'tw']) }];
  if (val.shape === 'custom') f.push({ type: 'action', key: 'estimate', step: 'Section', label: 'Estimate properties', hint: 'Fills the properties from d, bf, tf and tw, ignoring fillets (estimated).',
    run: (si) => (si.dsec > 0 && si.bf > 0 && si.tf > 0 && si.tw > 0 ? estimatePatch(estimateI(si.dsec, si.bf, si.tf, si.tw), keys) : null) });
  const dem = method === 'ASD' ? 'a' : 'u';
  if (mode === 'amplify') {
    f.push(sel('axis', 'Axis of bending', 'Section', 'major', [{ value: 'major', label: 'Major axis (Ix)' }, { value: 'minor', label: 'Minor axis (Iy)' }]),
      num('K1L', 'effective length for B1', 'K1 L', 'length_mm', 'Member', 4000),
      sel('b1From', 'B1', 'Member', 'computed', [{ value: 'computed', label: 'Compute B1' }, { value: 'typed', label: 'Type B1' }]));
    if (val.b1From === 'typed') f.push(num('B1', 'amplifier', 'B1', 'ratio', 'Member', 1.0, { min: 1 }));
    else {
      f.push(sel('cmFrom', 'Cm', 'Member', 'moments', [{ value: 'moments', label: 'From the end moments' }, { value: 'transverse', label: 'Transverse loading: Cm = ' + ed.steel.amplification.Cm.transverse }, { value: 'typed', label: 'Typed Cm' }]));
      if (val.cmFrom === 'typed') f.push(num('Cm', 'equivalent uniform moment factor', 'Cm', 'ratio', 'Member', 1.0));
      if (val.cmFrom === 'moments') f.push(num('M2', 'larger end moment', 'M2', 'moment', 'Member', 120), num('M1', 'smaller end moment', 'M1', 'moment', 'Member', 60),
        sel('curvature', 'Curvature', 'Member', 'single', [{ value: 'single', label: 'Single curvature (M1/M2 negative)' }, { value: 'reverse', label: 'Reverse curvature (M1/M2 positive)' }], { wide: true }));
    }
    f.push(num('Pnt', 'axial load, no translation', 'Pnt', 'force', 'Loads', 800), num('Plt', 'axial load from lateral translation', 'Plt', 'force', 'Loads', 0, { min: 0 }),
      num('Mnt', 'moment, no translation', 'Mnt', 'moment', 'Loads', 100, { min: 0 }), num('Mlt', 'moment from lateral translation', 'Mlt', 'moment', 'Loads', 60, { min: 0 }),
      { key: 'sway', type: 'check', label: 'Compute B2 for the storey (sidesway)', step: 'Storey', default: false });
    if (val.sway) {
      f.push(sel('pe2From', 'ΣPe2', 'Storey', 'storey', [{ value: 'storey', label: 'RM ΣH L / ΔH' }, { value: 'typed', label: 'Typed Σ π² E I / (K2 L)²' }], { wide: true }));
      if (val.pe2From === 'typed') f.push(num('SPe2', 'elastic storey buckling strength', 'ΣPe2', 'force', 'Storey', 85000));
      else f.push(sel('frame', 'Frame', 'Storey', 'moment', [{ value: 'moment', label: 'Moment frame (RM ' + ed.steel.amplification.RM.moment + ')' }, { value: 'braced', label: 'Braced frame (RM ' + ed.steel.amplification.RM.braced + ')' }]),
        num('SH', 'storey shear from the lateral forces', 'ΣH', 'force', 'Storey', 300), num('dH', 'first-order storey drift', 'ΔH', 'length_mm', 'Storey', 12), num('Lst', 'storey height', 'L', 'length_mm', 'Storey', 4000));
      f.push(num('SPnt', 'total gravity load on the storey', 'ΣPnt', 'force', 'Storey', 6000));
    }
    return f;
  }
  f.push(...gradeFields(ed, val, 'Material', 'A992', false));
  f.push(num('Kx', 'effective length factor, x axis', 'Kx', 'ratio', 'Lengths', 1), num('Lx', 'unbraced length, x axis', 'Lx', 'length_mm', 'Lengths', 4000),
    num('Ky', 'effective length factor, y axis', 'Ky', 'ratio', 'Lengths', 1), num('Ly', 'unbraced length, y axis', 'Ly', 'length_mm', 'Lengths', 4000),
    num('Lb', 'unbraced length for lateral-torsional buckling', 'Lb', 'length_mm', 'Lengths', 4000), num('Cb', 'lateral-torsional buckling factor', 'Cb', 'ratio', 'Lengths', 1.0, { min: 1, max: 3 }),
    num('Pr', 'required axial strength', 'P' + dem, 'force', 'Loads', 800), num('Mrx', 'required moment, major axis', 'M' + dem + 'x', 'moment', 'Loads', 120, { min: 0 }),
    num('Mry', 'required moment, minor axis', 'M' + dem + 'y', 'moment', 'Loads', 0, { min: 0 }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 230, D.kind === 'amplify' ? 'Column in a storey with the amplification factors' : 'Beam-column section with its loads', o);
  if (D.kind === 'amplify') {
    const x = 180;
    svg.add(line(x, 30, x, 200, 'ax'), hatch(x - 24, x + 24, 200), line(x - 30, 200, x + 30, 200, 'ax'));
    svg.add(path(D.sway ? `M${x},200 Q${x + 10},110 ${x + 40},30` : `M${x},200 Q${x + 40},115 ${x},30`, 'markline'), arrow(x, 4, x, 26), text(x + 6, 14, 'P'));
    if (D.sway) svg.add(arrow(x - 60, 30, x - 4, 30), text(x - 64, 26, 'H', 'end'));
    svg.add(text(300, 90, 'B1 = ' + fmt(D.B1)), text(300, 108, 'B2 = ' + fmt(D.B2)), cap(x, 224, D.sway ? 'Storey with sidesway' : 'Member without sidesway'));
    return svg;
  }
  if (D.dsec > 0 && D.bf > 0 && D.tf > 0 && D.tw > 0) {
    const F = fit(D.bf, D.dsec, 190, 30, 140, 160), k = F.k;
    svg.add(iShape(F.x(D.bf / 2), F.y(0), D.dsec * k, D.bf * k, Math.max(D.tf * k, 2), Math.max(D.tw * k, 1.5)));
    svg.add(line(F.x(0) - 14, F.y(D.dsec / 2), F.x(D.bf) + 14, F.y(D.dsec / 2), 'dash'), text(F.x(D.bf) + 18, F.y(D.dsec / 2) + 4, 'x'));
    svg.add(text(380, 90, 'axial force P'), text(380, 106, 'moments Mx, My'), cap(F.x(D.bf / 2), 224, 'Section'));
  }
  return svg;
}

export default {
  id: 'steel/beam-columns', group: 'steel', title: 'Beam-columns',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'interaction', label: 'Interaction', icon: 'ishape' }, { id: 'amplify', label: 'B1 and B2', icon: 'ishape' }],
  steps: (mode) => (mode === 'amplify' ? ['Setup', 'Section', 'Member', 'Loads', 'Storey', 'Results'] : ['Setup', 'Section', 'Material', 'Lengths', 'Loads', 'Results']),
  fields, presets, solve, draw,
  stepHelp: (step, mode) => (mode === 'interaction' && step === 'Loads' ? 'Required strengths must include second-order effects. Use the B1 and B2 mode to amplify a first-order analysis.' : mode === 'amplify' && step === 'Loads' ? 'Nt: from the analysis with the frame restrained against translation. Lt: from the lateral translation only.' : '')
};
