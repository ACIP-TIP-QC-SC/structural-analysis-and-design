// Development and splices: module definition and live drawing.
import { solve } from './development.calc.js';
import presets from '../../../presets/rc-development.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, line, text, cap, dimH, path, rect, g } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const D = ed.concrete.dev;
  const f = [bar('db', 'bar size', 'Bar', 25), fcField(ed, 'Materials'), fyField(ed, 'Materials'),
    num('lambda', 'lightweight factor (1.0 normal weight, 0.75 lightweight)', 'λ', 'ratio', 'Materials', 1, { min: 0.75, max: 1 })];
  const coat = sel('coating', 'Coating', 'Bar', 'none', [{ value: 'none', label: 'Uncoated' }, { value: 'epoxy', label: 'Epoxy-coated' }, { value: 'epoxyClose', label: 'Epoxy-coated, cover < 3db or spacing < 6db' }], { wide: true });
  if (mode === 'tension' || mode === 'laps') {
    f.push({ key: 'top', type: 'check', label: 'Top bar: more than ' + D.topBarDepth + ' mm of fresh concrete cast below it (ψt = ' + D.psiT.top + ')', step: 'Bar', default: false }, coat,
      sel('method', 'Method that governs the result', 'Conditions', mode === 'laps' ? 'simplified' : 'general', [{ value: 'general', label: 'General equation (needs cb)' }, { value: 'simplified', label: 'Simplified method' }], { wide: true }),
      sel('favourable', 'Simplified method case', 'Conditions', true, [{ value: true, label: 'Spacing and cover at least db (with stirrups) or 2db spacing' }, { value: false, label: 'Other cases' }], { wide: true }),
      num('cb', 'cover to the bar centre or half the bar spacing, smaller', 'cb', 'length_mm', 'Conditions', 50, { optional: true }),
      num('Atr', 'transverse steel area across the splitting plane (optional)', 'Atr', 'area', 'Conditions', null, { optional: true }),
      num('sTr', 'spacing of that transverse steel', 's', 'length_mm', 'Conditions', null, { optional: true }),
      num('nSpliced', 'bars developed or spliced along the plane', 'n', 'count', 'Conditions', null, { optional: true }));
    if (mode === 'tension') f.push(num('excess', 'As required / As provided (optional)', '', 'ratio', 'Conditions', null, { optional: true, min: 0, max: 1 }));
    else f.push({ key: 'ratio2', type: 'check', label: 'As provided / As required ≥ 2.0 over the splice length', step: 'Conditions', default: false },
      { key: 'half', type: 'check', label: 'Not more than 50% of the bars are spliced at the section', step: 'Conditions', default: false },
      bar('db2', 'other bar size for a compression lap (optional)', 'Conditions', 25),
      sel('lapType', 'Lap checked against the available length', 'Conditions', 'tension', [{ value: 'tension', label: 'Tension lap' }, { value: 'compression', label: 'Compression lap' }], { wide: true }));
  }
  if (mode === 'hooks') f.push(coat, { key: 'psiC', type: 'check', label: 'Side cover ≥ ' + D.hook.sideCover + ' mm (and ≥ ' + D.hook.extCover + ' mm on a 90° hook extension): ψc = ' + D.hook.psiC, step: 'Conditions', default: false },
    { key: 'psiR', type: 'check', label: 'Enclosed by ties or stirrups at not more than ' + D.hook.tieSpacingDb + 'db: ψr = ' + D.hook.psiR, step: 'Conditions', default: false });
  if (mode === 'compression') f.push({ key: 'confined', type: 'check', label: 'Enclosed by a spiral, a circular tie or ' + D.comp.tieDb + ' mm ties at ≤ ' + D.comp.tieSpacing + ' mm (ψr = ' + D.comp.psiR + ')', step: 'Conditions', default: false });
  f.push(num('available', 'available length (optional)', '', 'length_mm', 'Conditions', null, { optional: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 180, 'Bar with its development or lap length', o);
  if (!(D.length > 0)) return svg;
  const x0 = 70, len = 360, y = 80, k = len / D.length;
  svg.add(rect(x0 - 20, y - 40, len + 60, 80, 'conc'));
  if (D.kind === 'lap') {
    svg.add(line(x0 - 40, y - 4, x0 + len, y - 4, 'barline'), line(x0, y + 4, x0 + len + 40, y + 4, 'barline'));
    svg.add(dimH(x0, x0 + len, y + 56, D.label + ' = ' + o.fq(D.length, 'length_mm')));
  } else if (D.kind === 'hook') {
    const r = Math.min(Math.max(6, D.bend * k / 2), 20);
    svg.add(path(`M${x0 - 20},${y} L${x0 + len - r},${y} A${r},${r} 0 0 0 ${x0 + len},${y - r} L${x0 + len},${y - 34}`, 'barline'));
    svg.add(line(x0, y - 36, x0, y + 36, 'na'), text(x0 + 4, y - 26, 'critical section'), dimH(x0, x0 + len, y + 56, D.label + ' = ' + o.fq(D.length, 'length_mm')));
  } else {
    svg.add(line(x0 - 20, y, x0 + len, y, 'barline'), line(x0, y - 36, x0, y + 36, 'na'), text(x0 + 4, y - 26, 'critical section'), dimH(x0, x0 + len, y + 56, D.label + ' = ' + o.fq(D.length, 'length_mm')));
  }
  svg.add(g(null, text(x0 - 34, y - 8, D.comp ? 'C' : 'T', 'end')), cap(260, 172, 'Elevation (length to scale along the bar)'));
  return svg;
}

export default {
  id: 'rc/development', group: 'rc', title: 'Development and splices',
  methods: ['USD'],
  modes: [{ id: 'tension', label: 'Tension', icon: 'bar' }, { id: 'compression', label: 'Compression', icon: 'bar' }, { id: 'hooks', label: 'Hooks', icon: 'bar' }, { id: 'laps', label: 'Lap splices', icon: 'bar' }],
  steps: ['Setup', 'Bar', 'Materials', 'Conditions', 'Results'],
  fields, presets, solve, draw,
  setupNote: '√f\'c is limited to 8.3 MPa in every formula of this module.',
  stepHelp: (step, mode) => (step === 'Conditions' && (mode === 'tension' || mode === 'laps') ? 'Both methods are always shown. Choose which one governs the result. Ktr may be taken as 0.' : '')
};
