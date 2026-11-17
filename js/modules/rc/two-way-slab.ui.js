// Two-way slabs (DDM): module definition and live drawings.
import { solve } from './two-way-slab.calc.js';
import presets from '../../../presets/rc-two-way-slab.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, path, poly } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const T = ed.concrete.twoWaySlab;
  if (mode === 'thickness') {
    const f = [fyField(ed, 'Slab'), num('ln', 'clear span in the long direction', 'ℓn', 'length_mm', 'Slab', 5600),
      sel('system', 'Support system', 'Slab', 'flat', [{ value: 'flat', label: 'No interior beams (flat plate or flat slab)' }, { value: 'beams', label: 'Beams on all sides' }], { wide: true })];
    if (val.system === 'beams') f.push(num('afm', 'average beam stiffness ratio', 'αfm', 'ratio', 'Slab', 1.2, { min: 0 }), num('beta', 'long to short clear span ratio', 'β', 'ratio', 'Slab', 1.25, { min: 1, max: 2 }));
    if (val.system !== 'beams' || val.afm <= T.beams.lowAlpha) f.push({ key: 'drop', type: 'check', label: 'Drop panels', step: 'Slab', default: false },
      sel('panel', 'Panel', 'Slab', 'extNoEdge', [{ value: 'extNoEdge', label: 'Exterior, no edge beam' }, { value: 'extEdge', label: 'Exterior, with edge beam (αf ≥ 0.8)' }, { value: 'interior', label: 'Interior' }], { wide: true }));
    f.push(num('h', 'slab thickness provided (optional)', 'h', 'length_mm', 'Slab', null, { optional: true }));
    return f;
  }
  if (mode === 'punching') {
    const f = [num('c1', 'column size, span direction', 'c1', 'length_mm', 'Column', 500), num('c2', 'column size, transverse', 'c2', 'length_mm', 'Column', 500),
      sel('location', 'Column location', 'Column', 'interior', [{ value: 'interior', label: 'Interior' }, { value: 'edge', label: 'Edge (free edge parallel to c2)' }, { value: 'corner', label: 'Corner' }]),
      num('d', 'effective depth', 'd', 'length_mm', 'Column', 160), fcField(ed, 'Column'), num('lambda', 'lightweight factor', 'λ', 'ratio', 'Column', 1, { min: 0.75, max: 1 }),
      sel('vuFrom', 'Shear', 'Loads', 'panel', [{ value: 'panel', label: 'From the panel load: Vu = qu (ℓ1 ℓ2 − b1 b2)' }, { value: 'typed', label: 'Typed Vu' }], { wide: true })];
    if (val.vuFrom === 'typed') f.push(num('Vu', 'factored shear', 'Vu', 'force', 'Loads', 350));
    else f.push(num('qu', 'factored load', 'qu', 'pressure', 'Loads', 12), num('l1', 'span ℓ1', 'ℓ1', 'length_m', 'Loads', 6), num('l2', 'span ℓ2', 'ℓ2', 'length_m', 'Loads', 5));
    f.push(num('Msc', 'unbalanced moment, interior columns (optional)', 'Msc', 'moment', 'Loads', null, { optional: true }));
    return f;
  }
  const f = [num('l1', 'span in the direction analysed, centre to centre', 'ℓ1', 'length_m', 'Panel', 6), num('l2', 'transverse span', 'ℓ2', 'length_m', 'Panel', 5),
    num('c1', 'column size along ℓ1', 'c1', 'length_mm', 'Panel', 500), num('c2', 'column size along ℓ2', 'c2', 'length_mm', 'Panel', 500),
    num('h', 'slab thickness', 'h', 'length_mm', 'Panel', 200), num('d', 'effective depth', 'd', 'length_mm', 'Panel', 160),
    sel('span', 'Span', 'Panel', 'interior', [{ value: 'interior', label: 'Interior span' }, { value: 'end', label: 'End span' }])];
  if (val.span === 'end') f.push(sel('edge', 'Exterior edge condition', 'Panel', 'noEdgeBeam', T.endSpan.map((r) => ({ value: r.value, label: r.label })), { wide: true }));
  f.push(num('af1', 'beam stiffness ratio in the span direction', 'αf1', 'ratio', 'Panel', 0, { min: 0 }), num('bt', 'edge beam torsional ratio', 'βt', 'ratio', 'Panel', 0, { min: 0 }),
    { key: 'threeSpans', type: 'check', label: 'At least three continuous spans in each direction', step: 'Panel', default: true },
    { key: 'spansSimilar', type: 'check', label: 'Successive spans differ by no more than one third of the longer', step: 'Panel', default: true },
    fcField(ed, 'Materials'), fyField(ed, 'Materials'), bar('db', 'bar size', 'Materials', 12, { sizes: [10, 12, 16] }),
    num('wD', 'service dead load (including the slab)', 'wD', 'pressure', 'Loads', 6), num('wL', 'service live load', 'wL', 'pressure', 'Loads', 3),
    { key: 'addSelf', type: 'check', label: 'wD is the superimposed load only: add the slab self-weight (γc = ' + ed.concrete.defaults.gammaC + ' kN/m³)', step: 'Loads', default: false });
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'moments' && D.l1 > 0) {
    const svg = canvas(520, 260, 'Panel plan with column and middle strips and the strip moments', o);
    const F = fit(D.l1, D.l2, 30, 20, 300, 185), k = F.k, x0 = F.x(0), y0 = F.y(0), w = D.l1 * k, hh = D.l2 * k, cs2 = D.cs * k / 2;
    svg.add(rect(x0, y0, w, hh, 'conc'), rect(x0, y0, w, cs2, 'comp'), rect(x0, y0 + hh - cs2, w, cs2, 'comp'));
    [[x0, y0], [x0 + w, y0], [x0, y0 + hh], [x0 + w, y0 + hh]].forEach((p) => svg.add(rect(p[0] - 6, p[1] - 6, 12, 12, 'bar')));
    svg.add(text(x0 + w / 2, y0 + cs2 / 2 + 4, 'half column strip', 'middle'), text(x0 + w / 2, y0 + hh / 2 + 4, 'middle strip', 'middle'));
    svg.add(dimH(x0, x0 + w, y0 + hh + 12, 'ℓ1 = ' + o.fq(D.l1, 'length_m')), dimV(x0 - 10, y0, y0 + hh, 'ℓ2', false));
    D.parts.forEach((p, i) => svg.add(text(350, 50 + i * 44, p.label), text(350, 64 + i * 44, 'column strip ' + o.fq(p.cs, 'moment')), text(350, 78 + i * 44, 'middle strip ' + o.fq(p.ms, 'moment'))));
    svg.add(cap(x0 + w / 2, 254, 'Plan of the panel'));
    return svg;
  }
  if (D.kind === 'punching' && D.c1 > 0) {
    const svg = canvas(520, 240, 'Column with the critical section for punching shear', o);
    const span = Math.max(D.c1, D.c2) + 2 * D.d, F = fit(span * 1.6, span * 1.6, 130, 15, 220, 210), k = F.k, cx = F.x(span * 0.8), cy = F.y(span * 0.8);
    const xL = D.loc === 'interior' ? cx - D.b1 * k / 2 : cx - D.c1 * k / 2, yT = D.loc === 'corner' ? cy - D.c2 * k / 2 : cy - D.b2 * k / 2;
    // Slab: an edge column sits on the free edge at its left face; a corner column also on the top edge.
    const sx = D.loc === 'interior' ? F.x(0) : cx - D.c1 * k / 2, sy = D.loc === 'corner' ? cy - D.c2 * k / 2 : F.y(0);
    svg.add(rect(sx, sy, F.x(span * 1.6) - sx, F.y(span * 1.6) - sy, 'conc'));
    if (D.loc !== 'interior') svg.add(text(sx - 4, F.y(span * 0.8) + 4, 'free edge', 'end'));
    svg.add(rect(xL, yT, D.b1 * k, D.b2 * k, 'na'), rect(cx - D.c1 * k / 2, cy - D.c2 * k / 2, D.c1 * k, D.c2 * k, 'bar'));
    svg.add(text(cx, yT - 6, 'critical section at d/2', 'middle'), cap(cx, 236, 'Plan'));
    return svg;
  }
  const svg = canvas(520, 160, 'Slab span with its minimum thickness', o);
  if (!(D.ln > 0)) return svg;
  const x0 = 60, x1 = 460, t = 24;
  svg.add(rect(x0, 60, x1 - x0, t, 'conc'), rect(x0 - 20, 60, 20, 70, 'conc'), rect(x1, 60, 20, 70, 'conc'));
  svg.add(dimH(x0, x1, 110, 'ℓn = ' + o.fq(D.ln, 'length_mm')), dimV(x1 + 34, 60, 60 + t, 'h = ' + o.fq(D.h, 'length_mm', false), true), cap(260, 152, 'Section along the long span (not to scale)'));
  return svg;
}

export default {
  id: 'rc/two-way-slab', group: 'rc', title: 'Two-way slabs (DDM)',
  methods: ['USD'],
  modes: [{ id: 'thickness', label: 'Thickness', icon: 'slab' }, { id: 'moments', label: 'Moments', icon: 'slab' }, { id: 'punching', label: 'Punching shear', icon: 'footplan' }],
  steps: (mode) => (mode === 'moments' ? ['Setup', 'Panel', 'Materials', 'Loads', 'Results'] : mode === 'punching' ? ['Setup', 'Column', 'Loads', 'Results'] : ['Setup', 'Slab', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Slabs supported on columns, with or without beams, under gravity load only.',
  stepHelp: (step, mode) => (mode === 'moments' && step === 'Panel' ? 'αf1 = 0 and βt = 0 describe a flat plate without edge beams.' : '')
};
