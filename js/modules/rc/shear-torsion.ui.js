// Shear and torsion: module definition and live drawing.
import { solve } from './shear-torsion.calc.js';
import presets from '../../../presets/rc-shear-torsion.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, hatch, arrow, circle, path } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const C = ed.concrete, fyt = { key: 'fyt', label: 'stirrup yield strength', symbol: 'fyt', quantity: 'stress', step: 'Materials', default: 280, choices: C.fyChoices, min: C.fyRange[0], max: C.fyRange[1] };
  const lam = num('lambda', 'lightweight factor (1.0 normal weight)', 'λ', 'ratio', 'Materials', 1, { min: 0.75, max: 1 });
  const stir = bar('dbs', 'stirrup bar size', 'Stirrups', 10, { sizes: [10, 12, 16] });
  if (mode === 'torsion') {
    return [num('b', 'width', 'b', 'length_mm', 'Section', 350), num('h', 'total depth', 'h', 'length_mm', 'Section', 600), num('d', 'effective depth', 'd', 'length_mm', 'Section', 540),
      num('cover', 'cover to the centerline of the closed stirrup', 'c', 'length_mm', 'Section', 45),
      fcField(ed, 'Materials'), fyField(ed, 'Materials', { label: 'longitudinal steel yield strength' }), Object.assign({}, fyt, { default: 420 }), lam, stir,
      num('Tu', 'factored torsion', 'Tu', 'moment', 'Loads', 40), num('Vu', 'factored shear', 'Vu', 'force', 'Loads', 150),
      sel('torsionType', 'Type of torsion', 'Loads', 'equilibrium', [{ value: 'equilibrium', label: 'Equilibrium torsion (cannot be reduced)' }, { value: 'compatibility', label: 'Compatibility torsion (may be reduced to φTcr)' }], { wide: true })];
  }
  const f = [num('bw', 'web width', 'bw', 'length_mm', 'Section', 300), num('d', 'effective depth', 'd', 'length_mm', 'Section', 440), fcField(ed, 'Materials'), fyt, lam, stir,
    num('legs', 'number of stirrup legs', '', 'count', 'Stirrups', 2, { min: 2, max: 6 })];
  if (val.task === 'analyze') f.push(num('s', 'stirrup spacing', 's', 'length_mm', 'Stirrups', 150));
  f.push(num('Vu', 'factored shear at the critical section', 'Vu', 'force', 'Loads', 180));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'torsion') {
    const svg = canvas(520, 250, 'Beam cross-section with the closed stirrup', o);
    if (!(D.b > 0 && D.h > 0)) return svg;
    const F = fit(D.b, D.h, 170, 24, 180, 180), x0 = F.x(0), y0 = F.y(0), k = F.k;
    svg.add(rect(x0, y0, D.b * k, D.h * k, 'conc'));
    const st = rect(F.x(D.cover), F.y(D.cover), D.x1 * k, D.y1 * k, 'barline'); st.setAttribute('rx', 5); svg.add(st);
    [[D.cover + 8, D.cover + 8], [D.b - D.cover - 8, D.cover + 8], [D.cover + 8, D.h - D.cover - 8], [D.b - D.cover - 8, D.h - D.cover - 8]].forEach((p) => svg.add(circle(F.x(p[0]), F.y(p[1]), 4)));
    svg.add(dimH(x0, x0 + D.b * k, y0 + D.h * k + 8, 'b = ' + o.fq(D.b, 'length_mm')), dimV(x0 - 12, y0, y0 + D.h * k, 'h = ' + o.fq(D.h, 'length_mm', false)));
    svg.add(dimV(x0 + D.b * k + 14, F.y(D.cover), F.y(D.h - D.cover), 'y1 = ' + o.fq(D.y1, 'length_mm', false), true));
    svg.add(path(`M${F.x(D.b / 2) - 26},${F.y(D.h / 2)} a26,26 0 1 1 26,26`, 'markline'), text(F.x(D.b / 2), F.y(D.h / 2) + 4, 'Tu', 'middle'));
    if (D.s) svg.add(text(400, 60, 'closed stirrups'), text(400, 76, 'at ' + o.fq(D.s, 'length_mm')));
    svg.add(cap(F.x(D.b / 2), 244, 'Section'));
    return svg;
  }
  const svg = canvas(520, 230, 'Beam elevation near the support with the critical section and stirrups', o);
  if (!(D.d > 0)) return svg;
  const hh = D.d * 1.14, len = D.d * 3.4, F = fit(len, hh, 70, 34, 420, 130), k = F.k, y0 = F.y(0), y1 = F.y(hh), xs = F.x(0);
  svg.add(rect(xs - 26, y0 - 14, 26, hh * k + 44, 'conc'), hatch(xs - 26, xs, y1 + 30).slice(0, 4));
  svg.add(rect(xs, y0, len * k, hh * k, 'conc'));
  if (D.s > 0) for (let x = D.s / 2; x < len; x += D.s) svg.add(line(F.x(x), y0 + 5, F.x(x), y1 - 5, 'barline'));
  svg.add(line(F.x(D.d), y0 - 12, F.x(D.d), y1 + 12, 'na'), text(F.x(D.d) + 4, y0 - 6, 'critical section'));
  svg.add(dimH(xs, F.x(D.d), y1 + 18, 'd = ' + o.fq(D.d, 'length_mm')));
  if (D.s > 0) { const n0 = Math.ceil(D.d * 1.7 / D.s); if ((n0 + 1.5) * D.s < len) svg.add(dimH(F.x((n0 + 0.5) * D.s), F.x((n0 + 1.5) * D.s), y1 + 18, 's = ' + o.fq(D.s, 'length_mm'))); }
  if (D.Vu > 0) svg.add(arrow(F.x(D.d) + 30, y0 + hh * k * 0.75, F.x(D.d) + 30, y0 + hh * k * 0.25, 'markline'), text(F.x(D.d) + 36, y0 + hh * k * 0.5 + 4, 'Vu = ' + o.fq(D.Vu, 'force')));
  svg.add(cap(xs + len * k / 2, 222, D.none ? 'Elevation near the support (stirrups not required)' : 'Elevation near the support'));
  return svg;
}

export default {
  id: 'rc/shear-torsion', group: 'rc', title: 'Shear and torsion',
  methods: ['USD'],
  modes: [{ id: 'shear', label: 'Beam shear', icon: 'stirrup' }, { id: 'torsion', label: 'Torsion', icon: 'torsion' }],
  tasks: (mode) => (mode === 'shear' ? [{ id: 'design', label: 'Design' }, { id: 'analyze', label: 'Analyze' }] : []),
  steps: ['Setup', 'Section', 'Materials', 'Stirrups', 'Loads', 'Results'],
  fields, presets, solve, draw,
  stepHelp(step, mode) {
    if (step === 'Loads' && mode === 'shear') return 'Enter Vu at the critical section, a distance d from the face of the support. This value can also arrive from Load transfer or Load combinations.';
    if (step === 'Section' && mode === 'torsion') return 'Solid rectangular section, non-prestressed, no axial force.';
    return '';
  }
};
