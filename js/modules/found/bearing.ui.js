// Bearing capacity: module definition and live drawing.
import { solve } from './bearing.calc.js';
import presets from '../../../presets/found-bearing.js';
import { canvas, fit, rect, line, text, cap, dimH, dimV, hatch, path, arrow } from '../../ui/drawing.js';

const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);
const sel = (key, label, step, def, options, extra) => Object.assign({ key, label, type: 'select', step, default: def, options }, extra);

function fields(mode, method, val, ed) {
  const shapes = [{ value: 'strip', label: 'Strip (continuous)' }, { value: 'square', label: 'Square' }, { value: 'circular', label: 'Circular' }];
  if (mode === 'general') shapes.push({ value: 'rectangular', label: 'Rectangular' });
  const strip = val.shape === 'strip';
  const f = [sel('shape', 'Footing shape', 'Footing', 'square', shapes), num('B', val.shape === 'circular' ? 'diameter' : 'width', 'B', 'length_m', 'Footing', 1.5)];
  if (val.shape === 'rectangular' && mode === 'general') f.push(num('Lf', 'length', 'L', 'length_m', 'Footing', 3.0));
  f.push(num('Df', 'depth of the base below ground', 'Df', 'length_m', 'Footing', 1.0, { min: 0 }),
    num('FS', 'factor of safety', 'FS', 'ratio', 'Footing', ed.found.defaults.FS, { min: 1 }),
    num('Q', strip ? 'applied load per unit length (optional)' : 'applied load (optional)', 'Q', strip ? 'lineload' : 'force', 'Footing', null, { optional: true }),
    num('e', 'eccentricity along B (optional)', 'e', 'length_m', 'Footing', null, { optional: true }));
  if (mode === 'general') f.push(num('beta', 'load inclination from vertical', 'β', 'angle_deg', 'Footing', 0, { min: 0 }));
  f.push(num('c', 'cohesion', "c'", 'pressure', 'Soil', 0, { min: 0 }), num('phi', 'friction angle', "φ'", 'angle_deg', 'Soil', 30, { min: 0, max: 50 }), num('gamma', 'moist unit weight', 'γ', 'unitweight', 'Soil', 18));
  f.push(sel('water', 'Water table', 'Water table', 'none', [{ value: 'none', label: 'None (no effect)' }, { value: 'depth', label: 'At a depth below ground' }], { wide: true }));
  if (val.water === 'depth') f.push(num('Dw', 'depth of the water table below ground', 'Dw', 'length_m', 'Water table', 1.5, { min: 0 }), num('gammaSat', 'saturated unit weight', 'γsat', 'unitweight', 'Water table', 20));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 250, 'Footing in the ground with its depth, width and the water table', o);
  if (!(D.B > 0)) return svg;
  const Df = Math.max(D.Df, 0.05 * D.B), depth = Df + 1.6 * D.B, wide = 3.6 * D.B;
  const F = fit(wide, depth + 0.5 * D.B, 60, 14, 400, 200), k = F.k, yg = F.y(0.5 * D.B), yb = yg + Df * k, cx = F.x(wide / 2), bx0 = cx - D.B * k / 2, bx1 = cx + D.B * k / 2, th = Math.min(0.28 * D.B * k, Df * k);
  svg.add(rect(F.x(0), yg, wide * k, depth * k, 'soil'));
  if (D.Dw != null && D.Dw < depth) { const yw = yg + D.Dw * k; svg.add(rect(F.x(0), yw, wide * k, (depth - D.Dw) * k, 'waterfill'), line(F.x(0), yw, F.x(wide), yw, 'water'), text(F.x(wide) - 4, yw - 5, 'water table', 'end')); }
  svg.add(line(F.x(0), yg, F.x(wide), yg, 'ax'), hatch(F.x(0) + 8, bx0 - 30, yg));
  svg.add(rect(bx0, yb - th, D.B * k, th, 'conc'), rect(cx - D.B * k * 0.12, yg - 14, D.B * k * 0.24, yb - th - yg + 14, 'conc'));
  svg.add(path(`M${bx0},${yb} L${cx},${yb + D.B * k * 0.7} L${bx1},${yb} M${bx1},${yb} Q${bx1 + D.B * k * 0.9},${yb + D.B * k * 0.9} ${bx1 + D.B * k * 1.25},${yg} M${bx0},${yb} Q${bx0 - D.B * k * 0.9},${yb + D.B * k * 0.9} ${bx0 - D.B * k * 1.25},${yg}`, 'dash'));
  svg.add(arrow(cx + (D.e || 0) * k, yg - 44, cx + (D.e || 0) * k, yg - 16, 'markline'), text(cx + (D.e || 0) * k + 6, yg - 34, 'Q'));
  svg.add(line(bx0, yb, bx0, yg + depth * k - 22, 'dash'), line(bx1, yb, bx1, yg + depth * k - 22, 'dash'), dimH(bx0, bx1, yg + depth * k - 22, 'B = ' + o.fq(D.B, 'length_m')), dimV(F.x(0) + 26, yg, yb, 'Df = ' + o.fq(D.Df, 'length_m'), true));
  svg.add(cap(cx, 244, 'Section through the footing (failure surface sketched)'));
  return svg;
}

export default {
  id: 'found/bearing', group: 'found', title: 'Bearing capacity',
  methods: [],
  modes: [{ id: 'terzaghi', label: 'Terzaghi', icon: 'soil' }, { id: 'general', label: 'General equation', icon: 'soilg' }],
  modeHeading: 'Method',
  steps: ['Setup', 'Footing', 'Soil', 'Water table', 'Results'],
  fields, presets, solve, draw,
  stepHelp(step, mode) {
    if (step === 'Soil') return "Use c' = cu and φ' = 0 for the undrained (φ = 0) case.";
    if (step === 'Footing' && mode === 'terzaghi') return 'Terzaghi mode covers strip, square and circular footings with general shear failure. Use the General equation mode for rectangular footings and inclined loads.';
    return '';
  }
};
