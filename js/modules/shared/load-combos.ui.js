// Load combinations: module definition and bar chart drawing.
import { solve } from './load-combos.calc.js';
import presets from '../../../presets/shared-load-combos.js';
import { canvas, rect, line, text, g } from '../../ui/drawing.js';

function fields(mode, method, val, ed) {
  const q = val.quantity || 'force';
  const f = [{ key: 'quantity', label: 'Quantity (sets the unit shown)', type: 'select', step: 'Loads', default: 'force', wide: true,
    options: [{ value: 'force', label: 'Force' }, { value: 'moment', label: 'Moment' }, { value: 'pressure', label: 'Pressure' }, { value: 'lineload', label: 'Line load' }] }];
  const defs = { D: 100, L: 60, Lr: 20, R: 0, W: 40, E: 50, H: 0, F: 0, T: 0, Em: 120 };
  // Special seismic (203.5): only D, L and Em; the other loads are hidden.
  const syms = mode === 'special' ? ed.loads.symbols.filter(([sym]) => sym === 'D' || sym === 'L').concat([['Em', 'estimated maximum earthquake force (Ω0 Eh)']]) : ed.loads.symbols;
  syms.forEach(([sym, name]) => f.push({ key: sym, label: name, symbol: sym, quantity: q, step: 'Loads', default: defs[sym] }));
  f.push({ key: 'f1', label: 'Live load factor f1', type: 'select', step: 'Loads', default: 0.5, options: ed.loads.f1Options, wide: true });
  return f;
}

function draw(result, o) {
  const rows = (result.diagram && result.diagram.rows) || [];
  const rh = 17, H = Math.max(120, rows.length * rh + 40);
  const svg = canvas(520, H, 'Bar chart of the load combination results', o);
  if (!rows.length) return svg;
  const lo = Math.min(0, ...rows.map((r) => r.value)), hi = Math.max(0, ...rows.map((r) => r.value)), span = (hi - lo) || 1;
  const x0 = 150, w = 270, X = (val) => x0 + (val - lo) / span * w;
  svg.add(line(X(0), 12, X(0), rows.length * rh + 22, 'ax'));
  rows.forEach((r, i) => {
    const y = 18 + i * rh, a = Math.min(X(0), X(r.value)), b = Math.abs(X(r.value) - X(0));
    svg.add(text(x0 - 8, y + 10, r.label.replace('Eq. ', '').replace(' with ', ' '), 'end'));
    svg.add(rect(a, y, Math.max(b, 1), rh - 5, r.max || r.min ? 'mark' : 'comp'));
    svg.add(g('dimg', text(Math.max(X(r.value), X(0)) + 6, y + 10, o.fq(r.value, result.diagram.q) + (r.max ? '  max' : r.min ? '  min' : ''))));
  });
  return svg;
}

export default {
  id: 'shared/load-combos', group: 'shared', title: 'Load combinations',
  methods: [],
  modes: [{ id: 'strength', label: 'Strength', icon: 'combo' }, { id: 'basic', label: 'Allowable basic', icon: 'combo' }, { id: 'alternate', label: 'Allowable alternate', icon: 'combo' }, { id: 'special', label: 'Special seismic', icon: 'combo' }],
  modeHeading: 'Combination set',
  steps: ['Setup', 'Loads', 'Results'],
  fields, presets, solve, draw,
  signNote: 'Enter each load as a positive number in its usual direction. Wind W and earthquake E are applied in both directions automatically; a negative result means a net effect opposite to the dead load, such as uplift.',
  stepHelp: (step) => (step === 'Loads' ? 'Use one consistent quantity for every load, for example the axial force in one column or the moment at one section. Enter 0 for loads that do not act.' : '')
};
