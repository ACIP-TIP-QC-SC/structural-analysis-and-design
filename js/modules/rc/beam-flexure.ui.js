// Beam flexure: module definition and live drawing.
import { solve } from './beam-flexure.calc.js';
import presets from '../../../presets/rc-beam-flexure.js';
import { fcField, fyField, num, bar, sel } from './fields.js';
import { canvas, fit, rect, line, poly, text, cap, dimH, dimV, barRow, g } from '../../ui/drawing.js';

const STEPS = ['Setup', 'Section', 'Materials', 'Reinforcement', 'Loads', 'Results'];

function fields(mode, method, val, ed) {
  const wsd = method === 'WSD', design = !wsd && val.task === 'design', f = [];
  if (mode === 'flanged') {
    f.push(num('bw', 'web width', 'bw', 'length_mm', 'Section', 300, { min: 150 }), num('h', 'total depth', 'h', 'length_mm', 'Section', 560),
      num('d', 'effective depth', 'd', 'length_mm', 'Section', 500), num('hf', 'flange (slab) thickness', 'hf', 'length_mm', 'Section', 100),
      sel('bfFrom', 'Flange width', 'Section', 'typed', [{ value: 'typed', label: 'Typed value' }, { value: 'table', label: 'From ' + (ed.clauses['flexure.flangeWidth'].nscp) }], { wide: true }));
    if (val.bfFrom === 'table') {
      f.push(sel('flangeType', 'Beam type', 'Section', 'T', [{ value: 'T', label: 'T beam (slab on both sides)' }, { value: 'L', label: 'L beam (slab on one side)' }]),
        num('sw', 'clear distance to the next web', 'sw', 'length_mm', 'Section', 2700), num('ln', 'clear span', 'ℓn', 'length_mm', 'Section', 6000));
    } else f.push(num('bf', 'effective flange width', 'bf', 'length_mm', 'Section', 1200));
  } else {
    f.push(num('b', 'width', 'b', 'length_mm', 'Section', 300, { min: 150 }), num('h', 'total depth', 'h', 'length_mm', 'Section', 500), num('d', 'effective depth', 'd', 'length_mm', 'Section', 440));
    if (mode === 'doubly') f.push(num('dp', 'compression steel depth', "d'", 'length_mm', 'Section', 60));
  }
  f.push(fcField(ed, 'Materials'), fyField(ed, 'Materials'));
  if (wsd) f.push({ key: 'exactN', type: 'check', label: 'Use exact n = Es/Ec (default: nearest whole number)', step: 'Materials', default: false });
  if (!design) {
    f.push(num('n', 'number of tension bars', 'n', 'count', 'Reinforcement', 3, { min: 1, max: 20 }), bar('db', 'tension bar size', 'Reinforcement', 25));
    if (mode === 'doubly') f.push(num('np', 'number of compression bars', "n'", 'count', 'Reinforcement', 2, { min: 1, max: 20 }), bar('dbp', 'compression bar size', 'Reinforcement', 20));
  } else if (mode === 'doubly') f.push(bar('db', 'tension bar size', 'Reinforcement', 25), bar('dbp', 'compression bar size', 'Reinforcement', 20));
  f.push(wsd ? num('Ms', 'service moment', 'M', 'moment', 'Loads', 90) : num('Mu', 'factored moment', 'Mu', 'moment', 'Loads', 180));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 250, 'Beam cross-section with strain and stress diagrams', o);
  if (!(D.b > 0 && D.h > 0 && D.d > 0)) return svg;
  const wide = Math.max(D.bf || D.b, D.b), F = fit(wide, D.h, 60, 28, 170, 172);
  const cx = F.x(wide / 2), top = F.y(0), k = F.k, yd = F.y(D.d), bx0 = cx - D.b * k / 2, bx1 = cx + D.b * k / 2;
  const hasNA = result.ok && D.c > 0 && D.c < D.h;
  const comp = hasNA ? Math.min(D.a, D.h) : 0;
  if (D.flangedMode && D.bf > D.b) {
    const fx0 = cx - D.bf * k / 2, fx1 = cx + D.bf * k / 2, yf = F.y(D.hf), yb = F.y(D.h);
    svg.add(poly([[fx0, top], [fx1, top], [fx1, yf], [bx1, yf], [bx1, yb], [bx0, yb], [bx0, yf], [fx0, yf]], 'conc'));
    if (comp > 0) {
      svg.add(rect(fx0, top, D.bf * k, Math.min(comp, D.hf) * k, 'comp'));
      if (comp > D.hf) svg.add(rect(bx0, yf, D.b * k, (comp - D.hf) * k, 'comp'));
    }
    svg.add(dimH(fx0, fx1, top - 8, 'bf = ' + o.fq(D.bf, 'length_mm'), true), dimH(bx0, bx1, F.y(D.h) + 8, 'bw = ' + o.fq(D.b, 'length_mm')));
  } else {
    svg.add(rect(bx0, top, D.b * k, D.h * k, 'conc'));
    if (comp > 0) svg.add(rect(bx0, top, D.b * k, comp * k, 'comp'));
    svg.add(dimH(bx0, bx1, F.y(D.h) + 8, 'b = ' + o.fq(D.b, 'length_mm')));
  }
  const pad = Math.min(D.b * k * 0.18, 14);
  if (D.n > 0) svg.add(barRow(D.n, bx0 + pad, bx1 - pad, yd, Math.max(3, D.db * k / 2)));
  if (D.np > 0 && D.dp > 0) svg.add(barRow(D.np, bx0 + pad, bx1 - pad, F.y(D.dp), Math.max(3, D.dbp * k / 2)));
  svg.add(dimV(Math.min(bx0, cx - wide * k / 2) - 12, top, yd, 'd = ' + o.fq(D.d, 'length_mm', false)));
  svg.add(cap(cx, 244, 'Section'));
  if (!hasNA) return svg;
  const yn = F.y(D.c), wsd = D.kind === 'wsd';
  svg.add(line(Math.min(bx0, cx - wide * k / 2), yn, 492, yn, 'na'), text(494, yn + 4, 'N.A.'));
  if (o.show.strain !== false) {
    const botW = Math.min(70, 36 * (D.d - D.c) / D.c);
    svg.add(g(null, line(310, top, 310, yd, 'ax'), poly([[310, top], [346, top], [310, yn]]), poly([[310, yn], [310 - botW, yd], [310, yd]]),
      text(314, top - 6, wsd ? 'εc' : '0.003'), text(310 - botW, yd + 14, wsd ? 'εs' : 'εt = ' + o.fq(D.et, 'strain'), botW > 40 ? 'start' : 'middle'), cap(310, 244, 'Strain')));
  }
  if (o.show.stress !== false) {
    const ya = F.y(comp);
    svg.add(g(null, line(420, top, 420, yd, 'ax'),
      wsd ? poly([[420, top], [470, top], [420, yn]]) : poly([[420, top], [470, top], [470, ya], [420, ya]]),
      text(424, top - 6, wsd ? 'fc = ' + o.fq(D.fcS, 'stress') : "0.85 f'c"),
      line(420, yd, 388, yd, 'markline'), text(424, yd + 14, wsd ? 'fs/n = ' + o.fq(D.fsS / D.n, 'stress') : 'T = As·fs'), cap(445, 244, 'Stress')));
    if (!wsd) svg.add(g('dimg', text(474, (top + ya) / 2 + 4, 'a')));
  }
  return svg;
}

export default {
  id: 'rc/beam-flexure', group: 'rc', title: 'Beam flexure',
  methods: ['USD', 'WSD'],
  modes: [{ id: 'singly', label: 'Singly reinforced', icon: 'singly' }, { id: 'doubly', label: 'Doubly reinforced', icon: 'doubly' }, { id: 'flanged', label: 'T and L beams', icon: 'tbeam' }],
  modeHeading: 'Beam type',
  tasks: (mode, method) => (method === 'WSD' ? [] : [{ id: 'analyze', label: 'Analyze' }, { id: 'design', label: 'Design' }]),
  steps: STEPS,
  fields, presets, solve, draw,
  drawOptions: [{ key: 'strain', label: 'Strain diagram' }, { key: 'stress', label: 'Stress diagram' }],
  stepHelp(step, mode, method, val) {
    if (step === 'Section') return 'The drawing on the right redraws to scale as you type.';
    if (step === 'Reinforcement' && method !== 'WSD' && val.task === 'design') return mode === 'doubly' ? 'Choose the bar sizes. The number of bars is found from the required areas and the section is then analyzed with those bars.' : 'In Design mode the bars are an answer, not an input. The Results step lists a bar option for every size and suggests the lightest one that fits in one layer.';
    if (step === 'Loads') return 'This value can also arrive from Load transfer or Load combinations.';
    if (step === 'Materials' && method === 'WSD') return 'WSD follows the alternate design method of the code and is a reference mode. Only Analyze is available.';
    return '';
  }
};
