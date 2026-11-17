// Tension members: module definition and live drawing.
import { solve } from './tension.calc.js';
import presets from '../../../presets/steel-tension.js';
import { num, sel, gradeFields, prop } from './fields.js';
import { canvas, fit, rect, line, text, cap, dimH, circle, arrow } from '../../ui/drawing.js';

const rmin = (shape, val) => { const list = ['rx', 'ry', 'rz'].map((k) => val(shape, k)).filter((x) => typeof x === 'number'); return list.length ? Math.min(...list) : null; };

function fields(mode, method, val, ed) {
  const bolts = ed.steel.bolts.map((b) => ({ value: b, label: 'M' + b }));
  const P = num('P', 'required tensile strength (' + (method || 'LRFD') + ')', method === 'ASD' ? 'Pa' : 'Pu', 'force', 'Loads', mode === 'block' ? 600 : 1500);
  if (mode === 'block') {
    const f = gradeFields(ed, val, 'Material', 'A36', true);
    f.push(sel('bsFrom', 'Areas', 'Connection', 'pattern', [{ value: 'pattern', label: 'From a rectangular bolt pattern' }, { value: 'typed', label: 'Typed Agv, Anv and Ant' }], { wide: true }));
    if (val.bsFrom === 'typed') f.push(num('Agv', 'gross area in shear', 'Agv', 'area', 'Connection', 4560), num('Anv', 'net area in shear', 'Anv', 'area', 'Connection', 3120), num('Ant', 'net area in tension', 'Ant', 'area', 'Connection', 612));
    else f.push(num('lines', 'lines of bolts along the load', '', 'count', 'Connection', 2, { min: 2 }), num('nPerLine', 'bolts per line', 'n', 'count', 'Connection', 3, { min: 1 }),
      num('pitch', 'pitch', 's', 'length_mm', 'Connection', 75), num('end', 'end distance', 'Le', 'length_mm', 'Connection', 40), num('gauge', 'gauge between lines', 'g', 'length_mm', 'Connection', 75),
      num('t', 'thickness', 't', 'length_mm', 'Connection', 12), sel('bolt', 'Bolt size', 'Connection', 20, bolts));
    f.push(sel('Ubs', 'Tension stress factor Ubs', 'Connection', 1.0, ed.steel.blockShear.ubs, { wide: true }), P);
    return f;
  }
  const f = [{ type: 'shape', key: 'shape', label: 'Section', step: 'Section', default: 'W250x67', types: ['W', 'S', 'C', 'L'], props: [
    prop('Ag', 'A', 'gross area', 'Ag', 'area', 8581), prop('dsec', 'd', 'depth (for Case 7)', 'd', 'length_mm', 257, { optional: true }),
    prop('bf', 'bf', 'flange width (for Case 7)', 'bf', 'length_mm', 204, { optional: true }), prop('rmin', null, 'least radius of gyration', 'r', 'length_mm', 51.1, { optional: true, from: rmin })] }];
  f.push(...gradeFields(ed, val, 'Material', 'A36', true));
  f.push(sel('conn', 'Connection type', 'Connection', 'bolted', [{ value: 'bolted', label: 'Bolted' }, { value: 'welded', label: 'Welded' }]));
  if (val.conn !== 'welded') f.push(sel('bolt', 'Bolt size (standard holes)', 'Connection', 20, bolts), num('nHoles', 'holes in the critical section', '', 'count', 'Connection', 4, { min: 0 }),
    num('t', 'thickness of the element with the holes', 't', 'length_mm', 'Connection', 15.7), num('nGauge', 'staggered gauge spaces (0 = no stagger)', '', 'count', 'Connection', 0, { min: 0 }),
    num('sStag', 'stagger pitch', 's', 'length_mm', 'Connection', 75), num('gStag', 'stagger gauge', 'g', 'length_mm', 'Connection', 75));
  f.push(sel('Ucase', 'Shear lag factor U (' + ed.clauses['steel.tension.shearLag'].nscp + ')', 'Connection', 'case7f', ed.steel.shearLag, { wide: true }));
  if (val.Ucase === 'typed') f.push(num('Utyped', 'shear lag factor', 'U', 'ratio', 'Connection', 0.85, { min: 0.1, max: 1 }));
  if (val.Ucase === 'case2') f.push(num('xbar', 'connection eccentricity', 'x̄', 'length_mm', 'Connection', 25), num('Lconn', 'length of connection', 'ℓ', 'length_mm', 'Connection', 150));
  if (val.Ucase === 'case4') f.push(num('Lweld', 'length of each weld', 'ℓ', 'length_mm', 'Connection', 200), num('wPlate', 'plate width', 'w', 'length_mm', 'Connection', 150));
  f.push(P, num('Lmem', 'member length (optional, for L/r)', 'L', 'length_mm', 'Loads', null, { optional: true }));
  return f;
}

function draw(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 220, D.kind === 'block' ? 'Plate with the block shear failure path' : 'Tension member with its end connection', o);
  if (D.kind === 'block' && D.lines) {
    const len = D.end + (D.nPerLine - 1) * D.pitch + D.pitch * 1.2, wid = (D.lines - 1) * D.gauge + D.gauge * 1.6;
    const F = fit(len, wid, 90, 30, 300, 140), k = F.k, x0 = F.x(0), y0 = F.y(0), ya = F.y(D.gauge * 0.8), yb = F.y(D.gauge * 0.8 + (D.lines - 1) * D.gauge), xe = F.x(D.end + (D.nPerLine - 1) * D.pitch);
    svg.add(rect(x0, y0, len * k, wid * k, 'steel'));
    svg.add(rect(x0, ya, xe - x0, yb - ya, 'comp'));
    svg.add(line(x0, ya, xe, ya, 'na'), line(x0, yb, xe, yb, 'na'), line(xe, ya, xe, yb, 'markline'));
    for (let i = 0; i < D.lines; i++) for (let j = 0; j < D.nPerLine; j++) svg.add(circle(F.x(D.end + j * D.pitch), F.y(D.gauge * 0.8 + i * D.gauge), Math.max(3, D.bolt * k / 2)));
    svg.add(dimH(x0, F.x(D.end), y0 + wid * k + 8, o.fq(D.end, 'length_mm', false)), dimH(F.x(D.end), F.x(D.end + D.pitch), y0 + wid * k + 8, o.fq(D.pitch, 'length_mm')));
    svg.add(arrow(x0 - 8, (ya + yb) / 2, x0 - 50, (ya + yb) / 2, 'markline'), text(x0 - 54, (ya + yb) / 2 - 8, 'T', 'end'));
    svg.add(text(xe + 8, (ya + yb) / 2 + 4, 'tension plane'), text(x0 + 6, ya - 5, 'shear planes (dashed)'));
    svg.add(cap(x0 + len * k / 2, 214, 'Block shear path'));
    return svg;
  }
  if (D.kind === 'block') { svg.add(text(260, 110, 'Areas typed directly: no bolt pattern to draw.', 'middle')); return svg; }
  svg.add(rect(60, 80, 330, 50, 'steel'), rect(300, 55, 170, 100, 'conc'));
  svg.add(line(60, 105, 20, 105, 'markline'), arrow(60, 105, 18, 105, 'markline'), text(24, 96, 'T'));
  if (D.bolted) { const n = Math.max(2, Math.min(4, Math.ceil((D.nHoles || 2) / 2) + 1)); for (let i = 0; i < n; i++) { svg.add(circle(320 + i * 22, 93, 4), circle(320 + i * 22, 117, 4)); } svg.add(line(320, 70, 320, 140, 'na'), text(324, 68, 'critical net section')); }
  else svg.add(line(300, 80, 388, 80, 'markline'), line(300, 130, 388, 130, 'markline'), text(304, 72, 'welds'));
  svg.add(text(120, 150, 'gross section: yielding'), cap(260, 214, 'Member and end connection (schematic)'));
  return svg;
}

export default {
  id: 'steel/tension', group: 'steel', title: 'Tension members',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'member', label: 'Yielding and rupture', icon: 'tension' }, { id: 'block', label: 'Block shear', icon: 'block' }],
  steps: (mode) => (mode === 'block' ? ['Setup', 'Material', 'Connection', 'Loads', 'Results'] : ['Setup', 'Section', 'Material', 'Connection', 'Loads', 'Results']),
  fields, presets, solve, draw,
  stepHelp: (step, mode) => (step === 'Connection' && mode === 'member' ? 'Hole width for net area is the standard hole plus 2 mm. For a staggered chain, enter the number of gauge spaces crossed and its pitch and gauge.' : '')
};
