// Settlement: module definition and live drawings.
import { solve as solveCalc } from './settlement.calc.js';
import presetsFile from '../../../presets/found-settlement.js';
import { canvas, rect, line, text, cap, dimH, dimV, pline, circle, hatch } from '../../ui/drawing.js';

const num = (key, label, symbol, quantity, step, def, extra) => Object.assign({ key, label, symbol, quantity, step, default: def }, extra);
const sel = (key, label, step, def, options, extra) => Object.assign({ key, label, type: 'select', step, default: def, options }, extra);

// The test presets keep the clay as one object (as the calc takes it); the page edits it as flat fields.
const CLAY = { Hc: 'clayHc', gammaSat: 'clayGammaSat', e0: 'e0', Cc: 'Cc', Cs: 'Cs', sigc: 'sigc' };
const presets = presetsFile.map((p) => {
  if (!p.inputs.clay) return p;
  const flat = Object.assign({}, p.inputs);
  delete flat.clay;
  Object.keys(CLAY).forEach((k) => { flat[CLAY[k]] = p.inputs.clay[k]; });
  return Object.assign({}, p, { inputs: flat });
});
function solve(input, ctx) {
  if (input.mode !== 'consolidation' || input.clay) return solveCalc(input, ctx);
  const clay = {};
  Object.keys(CLAY).forEach((k) => { clay[k] = input[CLAY[k]]; });
  return solveCalc(Object.assign({}, input, { clay }), ctx);
}

function fields(mode) {
  const allow = num('allow', "allowable settlement (owner's or designer's limit, optional)", 'Sa', 'length_mm', 'Footing', null, { optional: true });
  if (mode === 'elastic') {
    return [num('B', 'footing width', 'B', 'length_m', 'Footing', 1), num('L', 'footing length', 'L', 'length_m', 'Footing', 2), num('q0', 'net pressure on the soil', 'q0', 'pressure', 'Footing', 150),
      sel('point', 'Settlement at', 'Footing', 'center', [{ value: 'center', label: 'Centre (flexible)' }, { value: 'corner', label: 'Corner (flexible)' }]),
      num('If', "depth factor (Fox's chart, Das Ch. 9; 1.0 ignores embedment)", 'If', 'ratio', 'Footing', 1, { min: 0.5, max: 1 }),
      { key: 'rigid', type: 'check', label: 'Also show the rigid footing estimate (0.93 × centre)', step: 'Footing', default: false }, allow,
      num('H', 'depth to a rigid layer below the base', 'H', 'length_m', 'Soil', 6), num('mu', "Poisson's ratio of the soil", 'μ', 'ratio', 'Soil', 0.3, { min: 0, max: 0.5 }),
      { key: 'layers', type: 'list', label: 'Soil layers from the base down', step: 'Soil', minRows: 1, maxRows: 20, default: [{ t: 2, Es: 10000 }, { t: 1, Es: 8000 }, { t: 2, Es: 12000 }],
        columns: [{ key: 't', label: 't', quantity: 'length_m' }, { key: 'Es', label: 'Es', quantity: 'pressure' }] }];
  }
  return [num('B', 'footing width', 'B', 'length_m', 'Footing', 1), num('L', 'footing length', 'L', 'length_m', 'Footing', 2), num('Df', 'depth of the base below the ground', 'Df', 'length_m', 'Footing', 1),
    num('q0', 'net pressure on the soil', 'q0', 'pressure', 'Footing', 150),
    sel('stress', 'Stress increase by', 'Footing', 'boussinesq', [{ value: 'boussinesq', label: 'Boussinesq (below the centre)' }, { value: '2to1', label: '2:1 method' }]), allow,
    num('gw', 'depth of the water table below the ground', 'zw', 'length_m', 'Soil', 2.5, { min: 0 }),
    { key: 'layers', type: 'list', label: 'Soil above the clay, from the ground surface down', step: 'Soil', minRows: 1, maxRows: 20, default: [{ t: 2.5, gamma: 16.5, gammaSat: 17.5 }, { t: 0.5, gamma: 16.5, gammaSat: 17.5 }],
      columns: [{ key: 't', label: 't', quantity: 'length_m' }, { key: 'gamma', label: 'γ', quantity: 'unitweight' }, { key: 'gammaSat', label: 'γsat', quantity: 'unitweight' }] },
    num('clayHc', 'clay thickness', 'Hc', 'length_m', 'Clay', 2.5), num('clayGammaSat', 'saturated unit weight of the clay', 'γsat', 'unitweight', 'Clay', 16),
    num('e0', 'initial void ratio', 'e0', 'ratio', 'Clay', 0.8), num('Cc', 'compression index', 'Cc', 'ratio', 'Clay', 0.32), num('Cs', 'swell index', 'Cs', 'ratio', 'Clay', 0.09),
    num('sigc', 'preconsolidation pressure (blank: normally consolidated)', "σ'c", 'pressure', 'Clay', null, { optional: true })];
}

// ---- drawings
function drawElastic(D, o) {
  const svg = canvas(520, 260, 'Footing plan with the settlement point, and the soil layers with Es and the averaging depth', o);
  if (!(D.B > 0 && D.L > 0)) return svg;
  const k = Math.min(150 / D.L, 150 / D.B), x0 = 40, y0 = 40, w = D.L * k, hh = D.B * k;
  svg.add(rect(x0, y0, w, hh, 'conc'), dimH(x0, x0 + w, y0 + hh + 12, 'L = ' + o.fq(D.L, 'length_m')), dimV(x0 - 10, y0, y0 + hh, 'B', false));
  const px = D.point === 'corner' ? x0 : x0 + w / 2, py = D.point === 'corner' ? y0 : y0 + hh / 2;
  svg.add(circle(px, py, 5, 'mark'), text(px + 8, py - 6, D.point === 'corner' ? 'corner' : 'centre'), cap(x0 + w / 2, 250, 'Plan'));
  // Layer column
  const cx = 290, cw = 130, top = 20, depth = Math.max(D.H, D.layers.reduce((s, r) => s + r.t, 0), D.zbar), kz = 200 / depth;
  svg.add(rect(cx - 10, top - 8, cw + 20, 8, 'conc'), text(cx + cw + 14, top - 2, 'footing'));
  let z = 0;
  D.layers.forEach((r, i) => {
    const t = Math.min(r.t, depth - z);
    if (t <= 0) return;
    svg.add(rect(cx, top + z * kz, cw, t * kz, i % 2 ? 'conc' : 'soil'), text(cx + cw / 2, top + (z + t / 2) * kz + 4, 'Es ' + o.fq(r.Es, 'pressure'), 'middle'));
    z += t;
  });
  svg.add(line(cx - 14, top + D.zbar * kz, cx + cw + 14, top + D.zbar * kz, 'na'), text(cx + cw + 16, top + D.zbar * kz + 4, 'z̄ = ' + o.fq(D.zbar, 'length_m')));
  svg.add(line(cx - 14, top + D.H * kz, cx + cw + 14, top + D.H * kz, 'ax'), hatch(cx - 14, cx + cw + 14, top + D.H * kz), text(cx - 16, top + D.H * kz + 4, 'rigid', 'end'));
  svg.add(cap(cx + cw / 2, 250, 'Soil below the base'));
  return svg;
}

function drawConsol(D, o) {
  const svg = canvas(520, 300, 'Soil profile with the water table, the footing and the clay layer, and the stress increase in the clay', o);
  if (!(D.B > 0 && D.Hc > 0)) return svg;
  const total = D.clayTop + D.Hc + 0.5, kz = 240 / total, top = 30, x0 = 30, x1 = 300, Y = (z) => top + z * kz;
  svg.add(rect(x0, top, x1 - x0, (D.clayTop) * kz, 'soil'), rect(x0, Y(D.clayTop), x1 - x0, D.Hc * kz, 'conc'));
  for (let x = x0 + 14; x < x1; x += 26) svg.add(line(x, Y(D.clayTop) + 3, x - 10, Y(D.clayTop) + 13, 'hatch'));
  svg.add(text(x0 + 6, Y(D.clayTop + D.Hc) - 6, 'clay, Hc = ' + o.fq(D.Hc, 'length_m')));
  let z = 0;
  D.layers.forEach((r) => { z += r.t; svg.add(line(x0, Y(z), x1, Y(z), 'thin')); });
  svg.add(line(x0 - 6, top, x1 + 6, top, 'ax'));
  if (D.wt != null && D.wt <= total) svg.add(line(x0, Y(D.wt), x1, Y(D.wt), 'water'), text(x1 + 4, Y(D.wt) + 4, '▽ water table'));
  const fx = (x0 + x1) / 2, fw = Math.min(D.B * kz, 120);
  svg.add(rect(fx - fw / 2, Y(D.Df) - 10, fw, 10, 'conc'), rect(fx - 8, top - 8, 16, Y(D.Df) - 10 - top + 8, 'conc'), dimV(x0 - 8, top, Y(D.Df), 'Df', false));
  if (!D.bous) { const zb = D.clayTop + D.Hc, sp = (zb - D.Df) / 2 * kz; svg.add(pline([[fx - fw / 2, Y(D.Df)], [fx - fw / 2 - sp, Y(zb)]], 'dash'), pline([[fx + fw / 2, Y(D.Df)], [fx + fw / 2 + sp, Y(zb)]], 'dash')); }
  // Stress increase profile beside the clay
  const sx = 330, mx = Math.max(...D.ds, 1e-9), ks = 80 / mx, pts = D.zs.map((zz, i) => [sx + D.ds[i] * ks, Y(zz + D.Df)]);
  svg.add(line(sx, Y(D.clayTop) - 10, sx, Y(D.clayTop + D.Hc) + 6, 'ax'), pline(pts, 'line'));
  ['Δσt', 'Δσm', 'Δσb'].forEach((nm, i) => svg.add(circle(pts[i][0], pts[i][1], 3, 'mark'), text(pts[i][0] + 6, pts[i][1] + 4, nm + ' ' + o.fq(D.ds[i], 'pressure'))));
  svg.add(cap(165, 296, 'Soil profile'), cap(sx + 50, 296, 'Stress increase in the clay'));
  return svg;
}

function draw(result, o) {
  const D = result.diagram || {};
  return D.mode === 'consolidation' ? drawConsol(D, o) : drawElastic(D, o);
}

export default {
  id: 'found/settlement', group: 'found', title: 'Settlement',
  methods: [],
  modes: [{ id: 'elastic', label: 'Elastic', icon: 'soil' }, { id: 'consolidation', label: 'Consolidation', icon: 'soil' }],
  steps: (mode) => (mode === 'elastic' ? ['Setup', 'Footing', 'Soil', 'Results'] : ['Setup', 'Footing', 'Soil', 'Clay', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Settlement by soil mechanics theory (Das, Principles of Foundation Engineering): elastic settlement of a flexible footing on layered soil (Steinbrenner), and primary consolidation of a clay layer with the stress increase by Boussinesq or the 2:1 method. The code gives no settlement limit; an allowable value may be typed.',
  stepHelp: (step, mode) => (step === 'Soil' && mode === 'elastic' ? 'Es is averaged over min(5B, H) below the base. The last layer is extended or cut at that depth.'
    : step === 'Soil' ? 'List the soil above the clay from the ground surface. γ applies above the water table and γsat below it.' : step === 'Footing' ? 'q0 is the net pressure on the soil at the base of the footing.' : '')
};
