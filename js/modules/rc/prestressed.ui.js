// Prestressed concrete beams: module definition and live drawings.
import { solve } from './prestressed.calc.js';
import presets from '../../../presets/rc-prestressed.js';
import { fcField, fyField, num, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, pline, poly, circle } from '../../ui/drawing.js';
import { fmt } from '../../core/format.js';

const strand = (step, ed, val) => {
  const f = [num('fpu', 'tensile strength of the tendons', 'fpu', 'stress', step, ed.concrete.prestress.fpuMax.strand)];
  f.push(num('fpy', 'yield strength of the tendons (0.90 fpu for low-relaxation strand)', 'fpy', 'stress', step, (val.fpu > 0 ? val.fpu : ed.concrete.prestress.fpuMax.strand) * ed.concrete.prestress.fpyRatio['strand-lr']));
  return f;
};
const lambdaField = (step) => num('lambda', 'lightweight factor (1.0 normal weight)', 'λ', 'ratio', step, 1, { min: 0.75, max: 1 });

function fields(mode, method, val, ed) {
  if (mode === 'stresses') {
    const custom = val.section === 'custom', steel = val.force !== 'direct';
    const f = [sel('section', 'Section', 'Section', 'rect', [{ value: 'rect', label: 'Rectangular' }, { value: 'custom', label: 'Custom section (A, I, yt, yb)' }])];
    if (custom) f.push(num('A', 'area', 'A', 'area', 'Section', 225000), num('I', 'moment of inertia', 'I', 'inertia', 'Section', 10546.875e6), num('yt', 'centroid to the top fibre', 'yt', 'length_mm', 'Section', 375), num('yb', 'centroid to the bottom fibre', 'yb', 'length_mm', 'Section', 375), num('h', 'total depth', 'h', 'length_mm', 'Section', 750));
    else f.push(num('b', 'width', 'b', 'length_mm', 'Section', 300), num('h', 'total depth', 'h', 'length_mm', 'Section', 750));
    f.push(fcField(ed, 'Section', { default: 40, choices: null }), num('fci', "concrete strength at transfer", "f'ci", 'stress', 'Section', 30));
    f.push(sel('force', 'Prestress given as', 'Prestress', 'steel', [{ value: 'steel', label: 'Tendon area and stress' }, { value: 'direct', label: 'Forces Pi and Pe' }], { wide: true }));
    if (steel) f.push(num('Aps', 'area of prestressing steel', 'Aps', 'area', 'Prestress', 789.6), num('fpi', 'tendon stress just after transfer', 'fpi', 'stress', 'Prestress', 1300),
      num('losses', 'long-term losses (%)', 'losses', 'ratio', 'Prestress', 18, { min: 0, max: 40 }), ...strand('Prestress', ed, val));
    else f.push(num('Pi', 'prestress force just after transfer', 'Pi', 'force', 'Prestress', 1000), num('Pe', 'effective prestress force after losses', 'Pe', 'force', 'Prestress', 820));
    f.push(num('eMid', 'eccentricity at midspan (below the centroid +)', 'e mid', 'length_mm', 'Prestress', 275), num('eEnd', 'eccentricity at the ends (below the centroid +)', 'e end', 'length_mm', 'Prestress', 275));
    f.push(num('span', 'simple span', 'L', 'length_m', 'Loads', 12), num('gammaC', 'unit weight of concrete (0 when the self weight is in wD)', 'γc', 'unitweight', 'Loads', 24, { min: 0 }),
      num('wD', 'superimposed dead load', 'wD', 'lineload', 'Loads', 5, { min: 0 }), num('wL', 'live load', 'wL', 'lineload', 'Loads', 10, { min: 0 }),
      num('sustainedL', 'sustained fraction of the live load', 'ψ', 'ratio', 'Loads', 0, { min: 0, max: 1 }));
    return f;
  }
  if (mode === 'flexure') {
    const f = [sel('bond', 'Tendons', 'Section', 'bonded', [{ value: 'bonded', label: 'Bonded' }, { value: 'unbonded', label: 'Unbonded' }]),
      num('b', 'width', 'b', 'length_mm', 'Section', 300), num('h', 'total depth', 'h', 'length_mm', 'Section', 750), num('dp', 'depth to the tendon centroid', 'dp', 'length_mm', 'Section', 650),
      fcField(ed, 'Section', { default: 40, choices: null }), lambdaField('Section'),
      num('Aps', 'area of prestressing steel', 'Aps', 'area', 'Tendons', 789.6), ...strand('Tendons', ed, val), num('fse', 'effective stress after losses', 'fse', 'stress', 'Tendons', 1066),
      num('As', 'non-prestressed tension steel (optional)', 'As', 'area', 'Tendons', 0, { min: 0 }), fyField(ed, 'Tendons'), num('d', 'depth to the non-prestressed steel (optional)', 'd', 'length_mm', 'Tendons', null, { optional: true })];
    if (val.bond === 'unbonded') f.push(num('span', 'span (for ln / h)', 'ln', 'length_m', 'Loads', 12));
    f.push(num('Mu', 'factored moment (optional)', 'Mu', 'moment', 'Loads', null, { optional: true, min: 0 }));
    return f;
  }
  return [num('bw', 'web width', 'bw', 'length_mm', 'Section', 300), num('h', 'total depth', 'h', 'length_mm', 'Section', 750), num('dp', 'depth to the tendon centroid', 'dp', 'length_mm', 'Section', 650),
    fcField(ed, 'Section', { default: 40, choices: null }), lambdaField('Section'),
    num('Aps', 'area of prestressing steel', 'Aps', 'area', 'Tendons', 789.6), num('fpu', 'tensile strength of the tendons', 'fpu', 'stress', 'Tendons', ed.concrete.prestress.fpuMax.strand), num('fse', 'effective stress after losses', 'fse', 'stress', 'Tendons', 1066),
    num('As', 'non-prestressed tension steel (optional)', 'As', 'area', 'Tendons', 0, { min: 0 }), fyField(ed, 'Tendons'), num('fyt', 'stirrup yield strength', 'fyt', 'stress', 'Tendons', 420),
    num('Vu', 'factored shear at the section', 'Vu', 'force', 'Loads', 350), num('Mu', 'factored moment at the same section', 'Mu', 'moment', 'Loads', 420)];
}

// A small stress block: depth vertical, stress horizontal (compression to the left), with the limit lines.
function stressBlock(svg, x0, y0, hh, blk, sc, o) {
  const X = (f) => x0 + f * sc;   // compression (negative) to the left of the zero line
  svg.add(line(x0, y0 - 4, x0, y0 + hh + 4, 'ax'));
  svg.add(poly([[x0, y0], [X(blk.f.top), y0], [X(blk.f.bot), y0 + hh], [x0, y0 + hh]], 'poly'));
  svg.add(line(X(-blk.c), y0 - 2, X(-blk.c), y0 + hh + 2, 'na'), line(X(blk.t), y0 - 2, X(blk.t), y0 + hh + 2, 'na'));
  svg.add(text(X(blk.f.top) + (blk.f.top < 0 ? -2 : 2), y0 - 6, o.fq(blk.f.top, 'stress', false), blk.f.top < 0 ? 'end' : 'start'), text(X(blk.f.bot) + (blk.f.bot < 0 ? -2 : 2), y0 + hh + 14, o.fq(blk.f.bot, 'stress', false), blk.f.bot < 0 ? 'end' : 'start'));
  svg.add(cap(x0, y0 + hh + 32, blk.name));
}

function drawStresses(D, o) {
  const svg = canvas(520, 330, 'Beam elevation with the tendon profile, the section, and the stress diagrams at transfer and service', o);
  if (!(D.h > 0 && D.span > 0)) return svg;
  // Elevation (depth exaggerated)
  const x0 = 30, x1 = 330, yT = 30, hh = 50, k = hh / D.h, yC = yT + D.yt * k;
  svg.add(rect(x0, yT, x1 - x0, hh, 'conc'), line(x0 - 6, yC, x1 + 6, yC, 'dash'));
  svg.add(pline([[x0, yC + D.eEnd * k], [(x0 + x1) / 2, yC + D.eMid * k], [x1, yC + D.eEnd * k]], 'markline'));
  svg.add(poly([[x0, yT + hh], [x0 - 7, yT + hh + 12], [x0 + 7, yT + hh + 12]], 'ax'), poly([[x1, yT + hh], [x1 - 7, yT + hh + 12], [x1 + 7, yT + hh + 12]], 'ax'));
  svg.add(dimH(x0, x1, yT + hh + 22, 'L = ' + o.fq(D.span, 'length_m')), text((x0 + x1) / 2, yT - 6, 'tendon (depth exaggerated)', 'middle'));
  // Section
  const sb = D.b > 0 ? D.b : D.h * 0.4, F = fit(sb, D.h, 380, 14, 110, 110), kk = F.k;
  svg.add(rect(F.x(0), F.y(0), sb * kk, D.h * kk, 'conc'), circle(F.x(sb / 2), F.y(D.yt + D.eMid), Math.max(3, Math.min(6, kk * 8))));
  svg.add(line(F.x(0) - 6, F.y(D.yt), F.x(sb) + 6, F.y(D.yt), 'dash'), dimV(F.x(sb) + 10, F.y(D.yt), F.y(D.yt + D.eMid), 'e', true), cap(F.x(sb / 2), 140, 'Midspan section'));
  // Stress blocks
  const all = (D.blocks || []).flatMap((b) => [Math.abs(b.f.top), Math.abs(b.f.bot), b.c, b.t]), mx = Math.max(...all, 1e-9), sc = 48 / mx;
  (D.blocks || []).forEach((b, i) => stressBlock(svg, 70 + i * 125, 186, 80, b, sc, o));
  svg.add(text(10, 326, 'compression −, tension +; dashed: limits', 'start'));
  return svg;
}

function drawFlexure(D, o) {
  const svg = canvas(520, 260, 'Section with the tendon, the stress block and the strain diagram', o);
  if (!(D.b > 0 && D.h > 0)) return svg;
  const F = fit(D.b, D.h, 40, 20, 200, 200), k = F.k;
  svg.add(rect(F.x(0), F.y(0), D.b * k, D.h * k, 'conc'));
  if (D.a > 0) svg.add(rect(F.x(0), F.y(0), D.b * k, Math.min(D.a, D.h) * k, 'comp'), line(F.x(0) - 6, F.y(D.c), F.x(D.b) + 6, F.y(D.c), 'na'), text(F.x(D.b) + 8, F.y(D.c) + 4, 'c'));
  svg.add(circle(F.x(D.b / 2), F.y(D.dp), Math.max(3, 6)), text(F.x(D.b / 2) + 9, F.y(D.dp) + 4, D.bonded ? 'bonded tendon' : 'unbonded tendon'));
  if (D.As > 0) svg.add(circle(F.x(D.b * 0.2), F.y(D.d), 3), circle(F.x(D.b * 0.8), F.y(D.d), 3));
  svg.add(dimH(F.x(0), F.x(D.b), F.y(D.h) + 10, 'b = ' + o.fq(D.b, 'length_mm')), dimV(F.x(0) - 10, F.y(0), F.y(D.dp), 'dp', false));
  svg.add(cap(F.x(D.b / 2), 254, 'Section'));
  if (D.c > 0) {
    const sx = 360, top = F.y(0), bot = F.y(D.h), yc = F.y(D.c), ydp = F.y(D.dp), es = 50;
    svg.add(line(sx, top, sx, bot, 'ax'), poly([[sx, top], [sx - 30, top], [sx, yc]], 'poly'), pline([[sx, yc], [sx + es, ydp]], 'line'));
    svg.add(text(sx - 32, top + 4, 'εcu = 0.003', 'end'), text(sx + es + 4, ydp + 4, 'εt = ' + fmt(D.epsT == null ? 0 : D.epsT)));
    svg.add(text(514, top + 30, 'fps = ' + o.fq(D.fps, 'stress'), 'end'), text(514, top + 46, 'φMn = ' + o.fq(D.phiMn, 'moment'), 'end'), cap(sx, 254, 'Strain'));
  }
  return svg;
}

function drawShear(D, o) {
  const svg = canvas(520, 250, 'Section for shear with the effective depth', o);
  if (!(D.b > 0 && D.h > 0)) return svg;
  const F = fit(D.b, D.h, 170, 16, 180, 180), k = F.k;
  svg.add(rect(F.x(0), F.y(0), D.b * k, D.h * k, 'conc'), rect(F.x(0) + 6, F.y(0) + 6, D.b * k - 12, D.h * k - 12, 'barline'));
  svg.add(circle(F.x(D.b / 2), F.y(D.dp), 5), dimV(F.x(D.b) + 12, F.y(0), F.y(D.d), 'd = ' + o.fq(D.d, 'length_mm'), true), dimH(F.x(0), F.x(D.b), F.y(D.h) + 10, 'bw = ' + o.fq(D.b, 'length_mm')));
  svg.add(cap(F.x(D.b / 2), 246, 'Section with stirrups'));
  return svg;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.mode === 'flexure') return drawFlexure(D, o);
  if (D.mode === 'shear') return drawShear(D, o);
  return drawStresses(D, o);
}

export default {
  id: 'rc/prestressed', group: 'rc', title: 'Prestressed',
  methods: [],
  modes: [{ id: 'stresses', label: 'Stresses', icon: 'beam' }, { id: 'flexure', label: 'Flexural strength', icon: 'beam' }, { id: 'shear', label: 'Shear', icon: 'beam' }],
  steps: (mode) => (mode === 'stresses' ? ['Setup', 'Section', 'Prestress', 'Loads', 'Results'] : ['Setup', 'Section', 'Tendons', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Simply supported prestressed beams of rectangular section (a custom section for the stresses). Concrete stresses at transfer and at service with their permissible values and the class of the member, flexural strength with the approximate tendon stress fps and the minimum strength or reinforcement, and shear by the approximate method. Strain compatibility, flanged sections and the detailed shear method (Vci, Vcw) are not covered.',
  signNote: 'Compression is negative and tension positive. Eccentricity is positive below the centroid.',
  stepHelp: (step, mode) => (step === 'Loads' && mode === 'stresses' ? 'Service (unfactored) loads. γc = 0 when the self weight is already in wD.' : step === 'Loads' ? 'Factored loads at the section considered.' : '')
};
