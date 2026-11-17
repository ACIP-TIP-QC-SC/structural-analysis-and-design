// Deflection and crack control: module definition and live drawing.
import { solve } from './serviceability.calc.js';
import presets from '../../../presets/rc-serviceability.js';
import { fcField, fyField, num, sel } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, path, poly, circle } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  if (mode === 'spacing') {
    const f = [fyField(ed, 'Steel'), sel('fsFrom', 'Steel stress at service loads', 'Steel', 'default', [{ value: 'default', label: 'fs = 2/3 fy (permitted)' }, { value: 'typed', label: 'Typed from a service analysis' }], { wide: true })];
    if (val.fsFrom === 'typed') f.push(num('fs', 'service steel stress', 'fs', 'stress', 'Steel', 280));
    f.push(num('cc', 'clear cover from the bar to the tension face', 'cc', 'length_mm', 'Steel', 50), num('sProv', 'bar spacing provided (optional)', 's', 'length_mm', 'Steel', null, { optional: true }));
    return f;
  }
  const S0 = ed.concrete.service, T = ed.theory.rcDeflection;
  const cases = Object.keys(T).map((k) => ({ value: k, label: T[k].label })).concat([{ value: 'other', label: 'Other (type K and Ma)' }]);
  const f = [num('b', 'width', 'b', 'length_mm', 'Section', 300), num('h', 'total depth', 'h', 'length_mm', 'Section', 500), num('d', 'effective depth', 'd', 'length_mm', 'Section', 440),
    num('As', 'tension steel area', 'As', 'area', 'Section', 1472.6), num('Asp', 'compression steel area (optional)', "A's", 'area', 'Section', null, { optional: true }),
    num('dp', 'depth of the compression steel', "d'", 'length_mm', 'Section', 60), fcField(ed, 'Section'), num('lambda', 'lightweight factor', 'λ', 'ratio', 'Section', 1, { min: 0.75, max: 1 }),
    num('span', 'span', 'L', 'length_mm', 'Loads', 6000), sel('loadCase', 'Support and load', 'Loads', 'simpleUniform', cases, { wide: true })];
  const kase = T[val.loadCase || 'simpleUniform'];
  if (!kase) f.push(num('Kt', 'deflection coefficient', 'K', 'ratio', 'Loads', 1), num('MaD', 'service moment, dead load', 'Ma', 'moment', 'Loads', 60), num('MaDL', 'service moment, dead + live', 'Ma', 'moment', 'Loads', 100));
  else if (kase.point) f.push(num('PD', 'service dead point load', 'PD', 'force', 'Loads', 40), num('PL', 'service live point load', 'PL', 'force', 'Loads', 25));
  else f.push(num('wD', 'service dead load', 'wD', 'lineload', 'Loads', 15), num('wL', 'service live load', 'wL', 'lineload', 'Loads', 10));
  f.push(num('psi', 'sustained fraction of live load', 'ψ', 'ratio', 'Limits', 0.3, { min: 0, max: 1 }), sel('duration', 'Duration of sustained load', 'Limits', '5y', S0.xi),
    sel('member', 'Immediate deflection limit', 'Limits', 'floor', S0.immediate, { wide: true }), sel('elements', 'Limit after attachment of non-structural elements', 'Limits', 'noDamage', S0.attached, { wide: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.kind === 'spacing') {
    const svg = canvas(520, 180, 'Beam soffit with the bar spacing and clear cover', o), y0 = 40, y1 = 130;
    svg.add(rect(60, y0, 400, y1 - y0, 'conc'));
    for (let i = 0; i < 5; i++) svg.add(circle(100 + i * 80, y1 - 26, 7));
    svg.add(dimH(100, 180, y1 + 14, 's,max = ' + o.fq(D.sMax, 'length_mm')), dimV(470, y1 - 19, y1, 'cc', true), text(60, y0 - 8, 'tension face at the bottom'));
    return svg;
  }
  const svg = canvas(520, 240, 'Cracked section and deflected shape', o);
  if (!(D.b > 0 && D.h > 0)) return svg;
  const F = fit(D.b, D.h, 20, 30, 110, 170), k = F.k;
  svg.add(rect(F.x(0), F.y(0), D.b * k, D.h * k, 'conc'), rect(F.x(0), F.y(0), D.b * k, D.kd * k, 'comp'), line(F.x(0) - 6, F.y(D.kd), F.x(D.b) + 6, F.y(D.kd), 'na'));
  svg.add(circle(F.x(D.b * 0.25), F.y(D.d), 4), circle(F.x(D.b * 0.5), F.y(D.d), 4), circle(F.x(D.b * 0.75), F.y(D.d), 4));
  if (D.Asp > 0) svg.add(circle(F.x(D.b * 0.25), F.y(D.dp), 3), circle(F.x(D.b * 0.75), F.y(D.dp), 3));
  svg.add(dimV(F.x(D.b) + 12, F.y(0), F.y(D.kd), 'kd = ' + o.fq(D.kd, 'length_mm', false), true), cap(F.x(D.b / 2), 232, 'Cracked section'));
  const x0 = 220, x1 = 490, y = 90;
  svg.add(line(x0, y, x1, y, 'ax'));
  if (D.cantilever) svg.add(rect(x0 - 12, y - 30, 12, 60, 'conc'), path(`M${x0},${y} Q${(x0 + x1) / 2},${y} ${x1},${y + 50}`, 'markline'), text(x1 - 4, y + 66, 'Δ = ' + o.fq(D.after, 'length_mm'), 'end'));
  else svg.add(poly([[x0, y], [x0 - 8, y + 12], [x0 + 8, y + 12]], 'conc'), poly([[x1, y], [x1 - 8, y + 12], [x1 + 8, y + 12]], 'conc'), path(`M${x0},${y} Q${(x0 + x1) / 2},${y + 90} ${x1},${y}`, 'markline'), text((x0 + x1) / 2, y + 62, 'Δ after attachment = ' + o.fq(D.after, 'length_mm'), 'middle'));
  svg.add(dimH(x0, x1, 190, 'L = ' + o.fq(D.span, 'length_mm')), cap((x0 + x1) / 2, 232, 'Deflected shape (not to scale)'));
  return svg;
}

export default {
  id: 'rc/serviceability', group: 'rc', title: 'Deflection and crack control',
  methods: ['USD'],
  modes: [{ id: 'deflection', label: 'Deflection', icon: 'beam' }, { id: 'spacing', label: 'Bar spacing', icon: 'beam' }],
  steps: (mode) => (mode === 'spacing' ? ['Setup', 'Steel', 'Results'] : ['Setup', 'Section', 'Loads', 'Limits', 'Results']),
  fields, presets, solve, draw,
  stepHelp: (step) => (step === 'Loads' ? 'Use service (unfactored) loads.' : '')
};
