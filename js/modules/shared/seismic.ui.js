// Seismic loads (NSCP 2015 Sec. 208, static force procedure): module definition and drawings.
import { solve } from './seismic.calc.js';
import presets from '../../../presets/shared-seismic.js';
import { canvas, rect, line, text, pline, g, dimV, arrow, lineChart } from '../../ui/drawing.js';
import { unitLabel } from '../../core/units.js';
import { fmt } from '../../core/format.js';

const SOILS = { SA: 'SA: hard rock', SB: 'SB: rock', SC: 'SC: very dense soil and soft rock', SD: 'SD: stiff soil', SE: 'SE: soft soil' };
const matOf = (ed, id) => { const r = ed.seismic.systems.find((x) => x.id === id); return r ? r.material : ''; };
const limitText = (x) => (x === 'NP' ? 'not permitted' : x == null ? 'no limit' : x + ' m');

function fields(mode, method, val, ed) {
  const SE = ed.seismic, f = [];
  const zone = Number(val.zone) === 2 ? 2 : 4;
  if (mode !== 'drift') {
    f.push({ key: 'zone', label: 'Seismic zone', type: 'select', step: 'Site', default: 4, structural: true, wide: true,
      options: [{ value: 4, label: 'Zone 4 (Z = ' + SE.zones[4] + ')' }, { value: 2, label: 'Zone 2 (Z = ' + SE.zones[2] + ')' }], hint: SE.zone2Note });
    f.push({ key: 'soil', label: 'Soil profile', type: 'select', step: 'Site', default: 'SD', wide: true,
      options: SE.soils.map((s) => ({ value: s, label: SOILS[s] || s })).concat([{ value: 'unknown', label: 'Not known in enough detail' }]),
      hint: 'Not known: SD (208.4.3); the simplified method uses SD in Zone 4 and SE in Zone 2 (208.5.1.1). Profile SF needs a site-specific evaluation and is not offered.' });
    if (zone === 4) {
      f.push({ key: 'source', label: 'Seismic source type', type: 'select', step: 'Site', default: 'A', wide: true, options: Object.entries(SE.sources).map(([value, label]) => ({ value, label })) },
        { key: 'dist', label: 'Closest distance to the seismic source', quantity: 'dist_km', step: 'Site', default: 10, min: 0, hint: 'Use the largest Na and Nv of all sources within 15 km (Table 208-5 note).' });
    }
  }
  if (mode === 'static' || mode === 'distribution') {
    f.push({ key: 'occupancy', label: 'Occupancy category', type: 'select', step: 'Site', default: 'IV', wide: true,
      options: Object.entries(SE.importance).map(([value, o]) => ({ value, label: o.label + ' (I = ' + o.I + ')' })) });
  }
  // Table 208-11 as two selects: material, then the system and row (the current material is listed first)
  const mats = [...new Set(SE.systems.map((r) => r.material))];
  const cur = val.sysMat || matOf(ed, val.system) || mats[0];
  const rows = SE.systems.filter((r) => r.material === cur);
  const sys = rows.find((r) => r.id === val.system) || rows[0];
  f.push({ key: 'sysMat', label: 'Material', type: 'select', step: 'System', default: '', structural: true, noReport: true,
    options: [cur].concat(mats.filter((m) => m !== cur)).map((m) => ({ value: m, label: m })) });
  f.push({ key: 'system', label: 'Structural system (Table 208-11)', type: 'select', step: 'System', default: 'A-C1', structural: true, wide: true,
    options: rows.map((r) => ({ value: r.id, label: r.system + ': ' + r.name })),
    hint: 'R = ' + sys.R + ', Ω0 = ' + sys.Omega0 + '; height limit Zone 4: ' + limitText(sys.hmaxZone4) + ', Zone 2: ' + limitText(sys.hmaxZone2) + '.' +
      (sys.id === 'A-B2' ? ' Printed in NSCP 2015 with R 5.6 and Ω0 2.2, higher than the special walls; used as printed.' : '') });
  if (mode === 'static' || mode === 'distribution') {
    f.push({ key: 'ct', label: 'Period coefficient Ct (Method A)', type: 'select', step: 'System', default: 'rc-mrf', structural: true, wide: true,
      options: [{ value: 'steel-mrf', label: 'Steel moment-resisting frames (' + SE.Ct['steel-mrf'] + ')' }, { value: 'rc-mrf', label: 'RC moment-resisting frames and eccentrically braced frames (' + SE.Ct['rc-mrf'] + ')' },
        { value: 'other', label: 'All other buildings (' + SE.Ct.other + ')' }, { value: 'walls', label: 'Concrete or masonry shear walls: Ct = ' + SE.CtWalls.coef + '/√Ac' }] });
    if (val.ct === 'walls') f.push({ key: 'Ac', label: 'combined effective area of the shear walls, Ac = Σ Ae[0.2 + (De/hn)²]', symbol: 'Ac', quantity: 'area_m2', step: 'System', default: 10 });
    f.push({ key: 'TB', label: 'period by Method B (optional)', symbol: 'TB', quantity: 'time_s', step: 'System', optional: true, hint: 'Capped at ' + SE.periodBCap[4] + ' TA in Zone 4 and ' + SE.periodBCap[2] + ' TA in Zone 2. Blank: Method A only.' },
      { key: 'regular', label: 'Regular structure (208.4.8 procedure check)', type: 'check', step: 'System', default: true },
      { key: 'rmax', label: 'largest element-storey shear ratio for ρ (optional)', symbol: 'rmax', quantity: 'ratio', step: 'System', optional: true, hint: 'Blank: ρ = 1.0.' },
      { key: 'AB', label: 'ground floor area for ρ', symbol: 'AB', quantity: 'area_m2', step: 'System', optional: true },
      { key: 'D', label: 'dead load effect for Ev = ' + SE.Ev + ' Ca I D (optional)', symbol: 'D', quantity: 'force', step: 'System', optional: true });
  }
  if (mode === 'simplified') f.push({ key: 'light', label: 'Light-frame construction (allows ' + SE.procedure.simplifiedLight + ' storeys instead of ' + SE.procedure.simplifiedOther + ')', type: 'check', step: 'System', default: false });
  if (mode === 'static') {
    f.push({ key: 'hn', label: 'height of the roof above the base', symbol: 'hn', quantity: 'length_m', step: 'Building', default: 18 },
      { key: 'W', label: 'total seismic dead load', symbol: 'W', quantity: 'force', step: 'Building', default: 20000 });
  } else if (mode === 'drift') {
    f.push({ key: 'T', label: 'fundamental period', symbol: 'T', quantity: 'time_s', step: 'Building', default: 0.65 },
      { key: 'levels', type: 'list', label: 'Levels: height above the base and elastic displacement δS under the design forces', step: 'Building', minRows: 1, maxRows: 60,
        default: [{ h: 3.5, dS: 5 }, { h: 7, dS: 11 }, { h: 10.5, dS: 16 }], columns: [{ key: 'h', label: 'h', quantity: 'length_m' }, { key: 'dS', label: 'δS', quantity: 'disp' }] });
  } else {
    f.push({ key: 'levels', type: 'list', label: 'Levels: height above the base and seismic weight', step: 'Building', minRows: 1, maxRows: 60,
      default: [{ h: 3.5, w: 1000 }, { h: 7, w: 1000 }, { h: 10.5, w: 800 }], columns: [{ key: 'h', label: 'h', quantity: 'length_m' }, { key: 'w', label: 'w', quantity: 'force' }] });
  }
  return f;
}

// The material select picks the first system of that material until a system is chosen.
function solveUI(input, ctx) {
  const ed = ctx.edition;
  if (input.sysMat && matOf(ed, input.system) !== input.sysMat) {
    const r = ed.seismic.systems.find((x) => x.material === input.sysMat);
    if (r) input = Object.assign({}, input, { system: r.id });
  }
  return solve(input, ctx);
}

// ---------------------------------------------------------------- drawings
function drawStatic(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 430, 'Design response spectrum and the base shear limits', o);
  if (!(D.Ca > 0)) return svg;
  const Tend = Math.max(3, (D.T || 0) * 1.6, D.Ts * 2), pts = [[0, D.Ca], [D.To, 2.5 * D.Ca], [D.Ts, 2.5 * D.Ca]];
  for (let k = 1; k <= 30; k++) { const T = D.Ts + (Tend - D.Ts) * k / 30; pts.push([T, D.Cv / T]); }
  const Sa = Math.min(2.5 * D.Ca, D.Cv / D.T);
  svg.add(lineChart({ x: 70, y: 24, w: 420, h: 200, xMin: 0, xMax: Tend, yMin: 0, series: [{ pts, cls: 'line' }], vlines: [{ x: D.T, label: 'T = ' + fmt(D.T) + ' s, ' + fmt(Sa) }, { x: D.Ts, label: Math.abs(D.T - D.Ts) < 0.15 * Tend ? '' : 'Ts = ' + fmt(D.Ts) + ' s' }],
    markers: [{ x: D.T, y: Sa }], xLabel: 'Period T, s', yLabel: 'Spectral coefficient (Ca, 2.5Ca, Cv/T)', pad: 0.08 }));
  // base shear limits
  const bars = [['Eq. 208-8', D.V8], ['Eq. 208-9', D.V9], ['Eq. 208-10', D.V10]].concat(D.V11 > 0 ? [['Eq. 208-11', D.V11]] : []);
  const vmax = Math.max(...bars.map((b) => b[1])), x0 = 150, w = 260, y0 = 290;
  bars.forEach(([lab, val], i) => {
    const y = y0 + i * 26, gov = lab === D.governs;
    svg.add(text(x0 - 8, y + 13, lab, 'end'), rect(x0, y, val / vmax * w, 18, gov ? 'mark' : 'comp'));
    svg.add(text(x0 + val / vmax * w + 6, y + 13, o.fq(val, 'force') + (gov ? '  governs' : '')));
  });
  svg.add(text(x0 - 8, y0 - 10, 'Base shear limits', 'end', 'cap'));
  return svg;
}

function drawLevels(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 420, 'Lateral forces at the levels and the storey shear', o);
  const L = D.levels || [];
  if (!L.length) return svg;
  const hn = L[L.length - 1].h, sc = 300 / hn, yb = 390, Y = (y) => yb - y * sc, x0 = 170, bw = 90;
  svg.add(line(x0 - 30, yb, x0 + bw + 30, yb, 'ax'));
  L.forEach((r, i) => { const y1 = i ? L[i - 1].h : 0; svg.add(rect(x0, Y(r.h), bw, (r.h - y1) * sc, 'conc')); });
  const Fmax = Math.max(...L.map((r) => r.Ftotal)), k = 90 / Fmax;
  L.forEach((r, i) => {
    const top = i === L.length - 1 && D.Ft > 0;
    const F = top ? r.F : r.Ftotal;
    // the label sits left of the arrow's tail
    svg.add(arrow(x0 - 6 - F * k, Y(r.h), x0 - 2, Y(r.h)), text(x0 - 10 - F * k, Y(r.h) + 4, o.fq(F, 'force'), 'end'));
    if (top) svg.add(arrow(x0 - 6 - D.Ft * k, Y(r.h) - 18, x0 - 2, Y(r.h) - 18, 'markline'), text(x0 - 10 - D.Ft * k, Y(r.h) - 14, 'Ft = ' + o.fq(D.Ft, 'force'), 'end'));
  });
  // storey shear diagram (steps)
  const sx = 330, sw = 110, Vm = Math.max(...L.map((r) => r.V)), pts = [];
  L.forEach((r, i) => { const y1 = i ? L[i - 1].h : 0; pts.push([sx + r.V / Vm * sw, Y(y1)], [sx + r.V / Vm * sw, Y(r.h)]); });
  svg.add(line(sx, yb, sx, Y(hn), 'ax'), pline([[sx, yb]].concat(pts, [[sx, Y(hn)]]), 'line'));
  L.forEach((r, i) => { const y1 = i ? L[i - 1].h : 0; svg.add(text(sx + r.V / Vm * sw + 4, (Y(y1) + Y(r.h)) / 2 + 4, o.fq(r.V, 'force'))); });
  svg.add(text(sx, Y(hn) - 36, 'Storey shear', 'start', 'cap'), text(x0, Y(hn) - 36, 'V = ' + o.fq(D.V, 'force'), 'start', 'cap'));
  if (o.show.dim !== false) svg.add(dimV(x0 + bw + 18, Y(hn), yb, o.fq(hn, 'length_m'), true));
  return svg;
}

function drawDrift(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 400, 'Storey drift against the limit', o);
  const L = D.levels || [];
  if (!L.length) return svg;
  const sys = o.sys;
  // dM and the limit of each storey as bars
  const hn = L[L.length - 1].h, x0 = 110, w = 220, yb = 360, sc = 320 / hn, Y = (y) => yb - y * sc;
  const m = Math.max(...L.map((r) => Math.max(r.dM, r.limit)));
  svg.add(line(x0, yb, x0, Y(hn), 'ax'), line(x0, yb, x0 + w, yb, 'ax'));
  L.forEach((r, i) => {
    const y1 = i ? L[i - 1].h : 0, ym = (Y(y1) + Y(r.h)) / 2;
    svg.add(rect(x0, ym - 8, r.dM / m * w, 16, r.ratio > 1 ? 'mark' : 'comp'), line(x0 + r.limit / m * w, ym - 12, x0 + r.limit / m * w, ym + 12, 'markline'));
    svg.add(text(x0 - 6, ym + 4, 'storey ' + (i + 1), 'end'), text(x0 + Math.max(r.dM, r.limit) / m * w + 6, ym + 4, 'ΔM ' + o.fq(r.dM, 'disp') + ' / ' + o.fq(r.limit, 'disp')));
  });
  svg.add(text(x0, 20, 'ΔM = 0.7 R ΔS against the limit (orange tick) · R = ' + D.R + ', T = ' + fmt(D.T) + ' s', 'start', 'cap'));
  svg.add(text(x0 + w / 2, yb + 22, 'drift, ' + unitLabel('disp', sys), 'middle'));
  return svg;
}

function draw(result, o) {
  const D = (result && result.diagram) || {};
  if (D.mode === 'drift') return drawDrift(result, o);
  if (D.mode === 'distribution' || D.mode === 'simplified') return drawLevels(result, o);
  return drawStatic(result, o);
}

export default {
  id: 'shared/seismic', group: 'shared', title: 'Seismic loads',
  methods: [],
  modes: [{ id: 'static', label: 'Static force', icon: 'combo' }, { id: 'distribution', label: 'Vertical distribution', icon: 'combo' },
    { id: 'simplified', label: 'Simplified static', icon: 'combo' }, { id: 'drift', label: 'Storey drift', icon: 'combo' }],
  modeHeading: 'Calculation',
  steps: (mode) => (mode === 'drift' ? ['Setup', 'System', 'Building', 'Results'] : ['Setup', 'Site', 'System', 'Building', 'Results']),
  fields, presets, solve: solveUI, draw,
  setupNote: 'Static force procedure of 208.5 within the limits of 208.4.8, the simplified static method, redundancy and the storey drift check. The dynamic lateral-force procedure (208.5.3) is not covered.',
  signNote: 'Forces act in the direction of the earthquake considered; E and Em act in either direction in the load combinations.',
  stepHelp: (step, mode) => (step === 'Building' && mode !== 'static' && mode !== 'drift' ? 'List the levels from the first floor above the base to the roof. W is the sum of the level weights; hn is the top level.' : '')
};
