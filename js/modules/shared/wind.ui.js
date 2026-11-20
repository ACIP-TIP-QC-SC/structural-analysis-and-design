// Wind loads (NSCP 2015 Sec. 207A and 207B Part 1): module definition and drawings.
import { solve, kzTable, kzFormula, topography } from './wind.calc.js';
import presetsFile from '../../../presets/shared-wind.js';
import { h } from '../../ui/dom.js';
import { canvas, rect, line, text, poly, pline, g, dimH, dimV, arrow, lineChart } from '../../ui/drawing.js';
import { fromSI, unitLabel } from '../../core/units.js';
import { fmt } from '../../core/format.js';
import { rad } from './angles.js';

const MAPS = { I: 'Fig. 207A.5-1C', II: 'Fig. 207A.5-1B', III: 'Fig. 207A.5-1A', IV: 'Fig. 207A.5-1A', V: 'Fig. 207A.5-1A' };
const view = { gcpi: 'pos' };          // the internal pressure shown in the pressures drawing

function fields(mode, method, val, ed) {
  const W = ed.wind, occ = val.occupancy || 'IV';
  const f = [
    { key: 'V', label: 'Basic wind speed', symbol: 'V', quantity: 'speed_kph', step: 'Wind', default: 250, min: 150, max: 400,
      hint: 'Read V from ' + MAPS[occ] + ' for Occupancy ' + occ + '. NSCP 2015 has no province table; interpolate between the map contours.' },
    { key: 'occupancy', label: 'Occupancy category', type: 'select', step: 'Wind', default: 'IV', structural: true,
      options: Object.entries(ed.seismic.importance).map(([value, o]) => ({ value, label: o.label })), hint: 'Only chooses the wind map named under V.' },
    { key: 'exposure', label: 'Exposure category', type: 'select', step: 'Wind', default: 'C', wide: true,
      options: [{ value: 'B', label: 'B: urban and suburban areas, wooded areas' }, { value: 'C', label: 'C: open terrain with scattered obstructions' }, { value: 'D', label: 'D: flat unobstructed areas and water surfaces' }],
      hint: 'B applies where its surface roughness extends upwind for 450 m or 20h; D where flat unobstructed terrain or water extends upwind for 1500 m or 20h; C otherwise (207A.7.3).' },
    { key: 'Kd', label: 'Directionality factor', symbol: 'Kd', type: 'select', step: 'Wind', default: W.Kd[0].value, wide: true,
      options: W.Kd.map((k) => ({ value: k.value, label: k.label + ' · ' + k.value })) },
    { key: 'kzMethod', label: 'Kz from', type: 'select', step: 'Wind', default: 'table', options: [{ value: 'table', label: 'Table 207B.3-1 (interpolated)' }, { value: 'formula', label: 'The formula of the table note' }] },
    { key: 'topo', label: 'Topography', type: 'select', step: 'Topography', default: 'none', structural: true, wide: true,
      options: [{ value: 'none', label: 'None (flat or gently rolling terrain)' }, { value: 'ridge', label: '2-D ridge' }, { value: 'escarpment', label: '2-D escarpment' }, { value: 'hill', label: '3-D axisymmetric hill' }] }
  ];
  if (val.topo && val.topo !== 'none') {
    f.push({ key: 'H', label: 'height of the hill or escarpment', symbol: 'H', quantity: 'length_m', step: 'Topography', default: 30 },
      { key: 'Lh', label: 'horizontal distance from the crest to where the height is H/2', symbol: 'Lh', quantity: 'length_m', step: 'Topography', default: 60 },
      { key: 'x', label: 'distance from the crest to the building', symbol: 'x', quantity: 'length_m', step: 'Topography', default: 30 },
      { key: 'side', label: 'Building position', type: 'select', step: 'Topography', default: 'downwind', options: [{ value: 'downwind', label: 'Downwind of the crest' }, { value: 'upwind', label: 'Upwind of the crest' }] });
  }
  if (mode === 'velocity') {
    f.push({ key: 'heights', type: 'list', label: 'Heights above the ground', step: 'Heights', minRows: 1, maxRows: 40, default: [{ z: 3 }, { z: 6 }, { z: 9 }, { z: 12 }],
      columns: [{ key: 'z', label: 'z', quantity: 'length_m' }] });
    return f;
  }
  const gable = val.roof === 'gable';
  f.push({ key: 'B', label: 'building width normal to the wind', symbol: 'B', quantity: 'length_m', step: 'Building', default: 30 },
    { key: 'L', label: 'building length parallel to the wind', symbol: 'L', quantity: 'length_m', step: 'Building', default: 20 },
    { key: 'roof', label: 'Roof', type: 'select', step: 'Building', default: 'flat', structural: true, options: [{ value: 'flat', label: 'Flat (θ < 10°)' }, { value: 'gable', label: 'Gable' }] });
  if (gable) {
    f.push({ key: 'theta', label: 'roof slope', symbol: 'θ', quantity: 'angle_deg', step: 'Building', default: 20, min: 0, max: 60 },
      { key: 'direction', label: 'Wind direction', type: 'select', step: 'Building', default: 'normal', options: [{ value: 'normal', label: 'Normal to the ridge' }, { value: 'parallel', label: 'Parallel to the ridge' }] });
  }
  f.push({ key: 'eave', label: mode === 'storeys' ? 'eave height (blank = the top level)' : 'eave height', symbol: 'he', quantity: 'length_m', step: 'Building', default: mode === 'storeys' ? '' : 12, optional: mode === 'storeys' },
    { key: 'enclosure', label: 'Enclosure', type: 'select', step: 'Building', default: 'enclosed', wide: true,
      options: [{ value: 'enclosed', label: 'Enclosed' }, { value: 'partial', label: 'Partially enclosed' }, { value: 'open', label: 'Open' }],
      hint: 'Partially enclosed: the openings in one wall exceed those in the rest of the envelope by more than 10% and exceed 0.37 m² or 1% of that wall, and the rest of the envelope is at most 20% open. Open: each wall at least 80% open (207A.2).' },
    { key: 'G', label: 'Gust-effect factor', symbol: 'G', quantity: 'ratio', step: 'Building', default: W.G, readonly: true, hint: 'Rigid building, 207A.9.1.' },
    { key: 'levels', type: 'list', label: mode === 'storeys' ? 'Floor levels above the base' : 'Levels for the windward wall pressures', step: 'Building', minRows: 1, maxRows: 40,
      default: [{ z: 4 }, { z: 8 }, { z: 12 }], columns: [{ key: 'z', label: 'z', quantity: 'length_m' }] });
  return f;
}

// ---------------------------------------------------------------- drawings
const P = (x, o) => (x == null ? '–' : o.fq(x, 'pressure_lo'));

function drawVelocity(result, o, ed) {
  const D = result.diagram || {};
  const svg = canvas(520, 380, 'Velocity pressure against height', o);
  if (!D.rows || !D.rows.length) return svg;
  const sys = o.sys, rows = D.rows, top = Math.max(...rows.map((r) => r.z)) * 1.15;
  const sketch = !!D.topo, cx = sketch ? 270 : 70, cw = sketch ? 230 : 420;
  // the qz profile from z = 0 to above the highest row, at the input's Kz method and Kzt
  const W = ed.wind, last = rows[rows.length - 1], kd = last.qz / (last.Kz * last.Kzt) ;
  const pts = [];
  for (let k = 0; k <= 40; k++) {
    const z = Math.max(top * k / 40, 0.01), Kz = result.diagram.method === 'formula' ? kzFormula(W, z, D.exposure) : kzTable(W, z, D.exposure);
    const kzt = D.kztAt ? D.kztAt(z) : 1;
    pts.push([fromSI(kd * Kz * kzt, 'pressure_lo', sys), fromSI(z, 'length_m', sys)]);
  }
  svg.add(lineChart({ x: cx, y: 30, w: cw, h: 290, xMin: 0, yMin: 0, series: [{ pts, cls: 'line' }],
    markers: rows.map((r) => ({ x: fromSI(r.qz, 'pressure_lo', sys), y: fromSI(r.z, 'length_m', sys), label: fmt(fromSI(r.qz, 'pressure_lo', sys)) })),
    xLabel: 'qz, ' + unitLabel('pressure_lo', sys), yLabel: 'z, ' + unitLabel('length_m', sys), pad: 0.05 }));
  if (sketch) drawTopo(svg, D.topo, o);
  return svg;
}

// The hill, ridge or escarpment with H, Lh, x and the building.
function drawTopo(svg, T, o) {
  const x0 = 20, x1 = 230, yb = 300, Hs = 90, span = Math.max(T.Lh * 2.6, Math.abs(T.x) * 1.6 + T.Lh, 1);
  const k = (x1 - x0) / span, crest = x0 + (x1 - x0) * 0.42;
  const X = (d) => crest + d * k;
  let ground;
  if (T.shape === 'escarpment') ground = [[x0, yb], [X(-T.Lh * 1.2), yb], [X(-T.Lh * 0.1), yb - Hs * 0.92], [X(0), yb - Hs], [x1, yb - Hs]];
  else ground = [[x0, yb], [X(-T.Lh * 1.6), yb], [X(-T.Lh), yb - Hs / 2], [X(0), yb - Hs], [X(T.Lh), yb - Hs / 2], [X(T.Lh * 1.6), yb], [x1, yb]];
  svg.add(poly(ground.concat([[x1, yb + 12], [x0, yb + 12]]), 'soil'), pline(ground, 'ax'));
  const bx = X(T.side === 'upwind' ? -Math.abs(T.x) : Math.abs(T.x));
  const gy = (xx) => { for (let i = 0; i + 1 < ground.length; i++) { const [a, b] = [ground[i], ground[i + 1]]; if (xx >= a[0] && xx <= b[0]) return a[1] + (b[1] - a[1]) * (xx - a[0]) / (b[0] - a[0] || 1); } return yb; };
  const by = gy(bx);
  svg.add(rect(bx - 7, by - 22, 14, 22, 'conc'));
  svg.add(dimV(X(0) + 8, yb - Hs, yb, 'H = ' + o.fq(T.H, 'length_m'), true));
  svg.add(dimH(X(-T.Lh), X(0), yb - Hs - 14, 'Lh', true));
  svg.add(text(bx, by - 28, 'x = ' + o.fq(T.x, 'length_m'), 'middle'));
  svg.add(arrow(x0 + 4, 60, x0 + 54, 60), text(x0 + 4, 52, 'wind'));
  svg.add(text((x0 + x1) / 2, yb + 30, T.shape === 'escarpment' ? '2-D escarpment' : T.shape === 'ridge' ? '2-D ridge' : '3-D hill', 'middle', 'cap'));
}

// Pressure arrow on a surface: (x, y) a point on the surface, (nx, ny) its outward normal (screen axes),
// p the pressure (positive toward the surface), k the arrow scale.
function pArrow(x, y, nx, ny, p, k, lab, svg) {
  const len = Math.max(Math.abs(p) * k, 6);
  if (p >= 0) svg.add(arrow(x + nx * (len + 2), y + ny * (len + 2), x + nx * 2, y + ny * 2));
  else svg.add(arrow(x + nx * 2, y + ny * 2, x + nx * (len + 2), y + ny * (len + 2)));
  if (lab) svg.add(text(x + nx * (len + 10), y + ny * (len + 10) + 4, lab, nx < -0.5 ? 'end' : nx > 0.5 ? 'start' : 'middle'));
}

function drawPressures(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 400, 'Building elevation with the design wind pressures', o);
  if (!(D.L > 0)) return svg;
  const neg = view.gcpi === 'neg', key = neg ? 'pNeg' : 'pPos';
  const all = [].concat(D.windward.map((r) => r[key]), [D.leeward[key]], D.roof ? D.roof.map((r) => r[key]) : [],
    D.roofWW ? [neg ? D.roofWW.pBNeg : D.roofWW.pAPos, neg ? D.roofWW.pANeg : D.roofWW.pBPos].filter((x) => x != null) : [], D.roofLW ? [D.roofLW[key]] : []);
  const pmax = Math.max(...all.map(Math.abs), 1e-9), k = 46 / pmax;
  const gable = D.gable && D.theta > 0 && D.direction === 'normal', ht = D.eave + (gable ? D.rise : D.gable && D.direction === 'parallel' ? 0 : 0);
  const sc = Math.min(220 / D.L, 220 / Math.max(ht, 1e-9)), x0 = 150, yb = 330, X = (x) => x0 + x * sc, Y = (y) => yb - y * sc;
  // building outline (section along the wind)
  const outline = gable ? [[X(0), Y(0)], [X(0), Y(D.eave)], [X(D.L / 2), Y(D.eave + D.rise)], [X(D.L), Y(D.eave)], [X(D.L), Y(0)]] : [[X(0), Y(0)], [X(0), Y(D.eave)], [X(D.L), Y(D.eave)], [X(D.L), Y(0)]];
  svg.add(poly(outline, 'conc'), line(X(-0.3 * D.L), yb, X(1.3 * D.L), yb, 'ax'));
  // windward wall, one arrow per level band
  const zs = D.windward.map((r) => r.z);
  D.windward.forEach((r, i) => { const y = Math.min(r.z, D.eave) - (Math.min(r.z, D.eave) - (i ? Math.min(zs[i - 1], D.eave) : 0)) / 2; pArrow(X(0), Y(y), -1, 0, r[key], k, P(r[key], o), svg); });
  pArrow(X(D.L), Y(D.eave / 2), 1, 0, D.leeward[key], k, P(D.leeward[key], o), svg);
  if (D.roof) {
    // labels alternate in height so that narrow zones do not overlap
    D.roof.forEach((z, i) => { const xm = (z.x1 + Math.min(z.x2, D.L)) / 2; pArrow(X(xm), Y(D.eave), 0, -1, z[key], k, null, svg); svg.add(line(X(z.x2), Y(D.eave) - 4, X(z.x2), Y(D.eave) + 4, 'thin'), text(X(xm), Y(D.eave) - Math.max(Math.abs(z[key]) * k, 6) - 12 - (i % 2) * 14, P(z[key], o), 'middle')); });
  } else if (D.roofWW) {
    const t = rad(D.theta), nW = [-Math.sin(t), -Math.cos(t)], nL = [Math.sin(t), -Math.cos(t)];
    const pw = neg ? (D.roofWW.pANeg != null ? D.roofWW.pANeg : D.roofWW.pBNeg) : (D.roofWW.pAPos != null ? D.roofWW.pAPos : D.roofWW.pBPos);
    pArrow(X(D.L / 4), Y(D.eave + D.rise / 2), nW[0], nW[1], pw, k, P(pw, o), svg);
    pArrow(X(3 * D.L / 4), Y(D.eave + D.rise / 2), nL[0], nL[1], D.roofLW[key], k, P(D.roofLW[key], o), svg);
  }
  // wind arrow, dimensions
  svg.add(arrow(20, 40, 90, 40, 'markline'), text(20, 30, 'wind'));
  if (o.show.dim !== false) {
    svg.add(dimH(X(0), X(D.L), yb + 22, 'L = ' + o.fq(D.L, 'length_m')));
    // heights are dimensioned inside the outline, clear of the pressure labels outside it
    svg.add(dimV(X(D.L) - 12, Y(D.eave), Y(0), (D.h === D.eave ? 'h = eave = ' : 'eave ') + o.fq(D.eave, 'length_m')));
    if (D.h !== D.eave) svg.add(dimV(X(D.L * 0.5) - 12, Y(D.h), Y(0), 'h = ' + o.fq(D.h, 'length_m')));
    if (gable) svg.add(text(X(D.L * 0.08), Y(D.eave) + 16, 'θ = ' + fmt(D.theta) + '°'));
  }
  svg.add(text(260, 18, (neg ? 'Internal pressure −GCpi' : 'Internal pressure +GCpi') + ' · qh = ' + P(D.qh, o), 'middle', 'cap'));
  // small plan B x L with the wind arrow
  const ps = Math.min(70 / D.L, 70 / D.B), px = 430, py = 40;
  svg.add(rect(px, py, D.L * ps, D.B * ps, 'conc'), arrow(px - 30, py + D.B * ps / 2, px - 6, py + D.B * ps / 2, 'markline'));
  svg.add(text(px + D.L * ps / 2, py + D.B * ps + 14, 'plan', 'middle'), text(px + D.L * ps + 4, py + D.B * ps / 2 + 4, 'B'));
  return svg;
}

function drawStoreys(result, o) {
  const D = result.diagram || {};
  const svg = canvas(520, 400, 'Storey forces of the main wind-force resisting system', o);
  if (!D.storeys || !D.storeys.length) return svg;
  const top = Math.max(D.h, ...D.storeys.map((s) => s.z)), sc = Math.min(260 / top, 160 / D.L), x0 = 190, yb = 340;
  const X = (x) => x0 + x * sc, Y = (y) => yb - y * sc;
  svg.add(rect(X(0), Y(D.eave), D.L * sc, D.eave * sc, 'conc'), line(X(-0.6 * D.L), yb, X(1.4 * D.L), yb, 'ax'));
  const Fmax = Math.max(...D.storeys.map((s) => s.F)), k = 90 / Fmax;
  D.storeys.forEach((s) => {
    svg.add(line(X(0), Y(s.z), X(D.L), Y(s.z), 'dash'));
    svg.add(arrow(X(0) - 8 - s.F * k, Y(s.z), X(0) - 4, Y(s.z)));
    svg.add(text(X(0) - 12 - s.F * k, Y(s.z) - 5, o.fq(s.F, 'force'), 'start'));
  });
  svg.add(arrow(X(D.L / 2) + 50, yb + 22, X(D.L / 2) - 50, yb + 22, 'markline'));
  svg.add(text(X(D.L / 2), yb + 40, 'Vbase = ' + o.fq(D.Vbase, 'force') + '   Mbase = ' + o.fq(D.Mbase, 'moment'), 'middle'));
  if (o.show.dim !== false) svg.add(dimV(X(D.L) + 18, Y(top), Y(0), o.fq(top, 'length_m'), true));
  // plan with the Case 2 eccentricity
  const ps = Math.min(80 / D.L, 80 / D.B), px = 370, py = 60, cy = py + D.B * ps / 2, e = D.ecc * D.B * ps;
  svg.add(rect(px, py, D.L * ps, D.B * ps, 'conc'), line(px - 6, cy, px + D.L * ps + 6, cy, 'dash'));
  svg.add(arrow(px - 34, cy + e, px - 6, cy + e, 'markline'), text(px + D.L * ps / 2, py + D.B * ps + 14, 'plan, Case 2', 'middle'));
  svg.add(dimV(px + D.L * ps + 14, cy, cy + e, 'e = ' + D.ecc + 'B', true));
  svg.add(arrow(20, 40, 90, 40, 'markline'), text(20, 30, 'wind'));
  return svg;
}

function draw(result, o) {
  const D = (result && result.diagram) || {};
  if (D.mode === 'velocity') return drawVelocity(result, o, o.edition);
  if (D.mode === 'storeys') return drawStoreys(result, o);
  return drawPressures(result, o);
}

// The +GCpi / −GCpi switch over the pressures drawing.
function drawInteractive(svg, ctx) {
  if (!ctx.result || !ctx.result.diagram || ctx.result.diagram.mode !== 'pressures') return null;
  const b = (k, label) => h('button', { type: 'button', class: view.gcpi === k ? 'on' : '', 'aria-pressed': String(view.gcpi === k), onClick: () => { view.gcpi = k; ctx.refresh(); } }, label);
  return h('div', { class: 'row', style: 'gap:8px;margin:0 0 8px' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Internal pressure shown' }, b('pos', '+GCpi'), b('neg', '−GCpi')));
}

// The calc reads plain numbers or rows; the list fields of the page need rows.
const asRows = (list) => (Array.isArray(list) ? list.map((z) => (typeof z === 'number' ? { z } : z)) : list);
const presets = presetsFile.map((p) => Object.assign({}, p, { inputs: Object.assign({}, p.inputs, p.inputs.heights ? { heights: asRows(p.inputs.heights) } : {}, p.inputs.levels ? { levels: asRows(p.inputs.levels) } : {}) }));

// Topography data for the profile drawing (Kzt at any height).
function solveWithProfile(input, ctx) {
  const r = solve(input, ctx);
  if (r.ok && r.diagram.mode === 'velocity') {
    const t = topography(ctx.edition.wind, Object.assign({ exposure: 'C', topo: 'none' }, input));
    Object.assign(r.diagram, { exposure: input.exposure || 'C', method: input.kzMethod || 'table', kztAt: (z) => t.kzt(z).Kzt });
  }
  return r;
}

export default {
  id: 'shared/wind', group: 'shared', title: 'Wind loads',
  methods: [],
  modes: [{ id: 'velocity', label: 'Velocity pressure', icon: 'combo' }, { id: 'pressures', label: 'Building pressures', icon: 'combo' }, { id: 'storeys', label: 'Storey forces', icon: 'combo' }],
  modeHeading: 'Calculation',
  steps: (mode) => (mode === 'velocity' ? ['Setup', 'Wind', 'Topography', 'Heights', 'Results'] : ['Setup', 'Wind', 'Topography', 'Building', 'Results']),
  fields, presets, solve: solveWithProfile, draw, drawInteractive,
  setupNote: 'Directional procedure of 207B Part 1 for the main wind-force resisting system of rigid enclosed and partially enclosed buildings with flat or gable roofs. Components and cladding, the envelope procedure (207C), flexible buildings and other structures are not covered.',
  signNote: 'Positive pressure acts toward the surface, negative pressure (suction) away from it. Each pressure is given with +GCpi and with −GCpi.',
  stepHelp: (step) => (step === 'Building' ? 'B is the width facing the wind and L the length along it. For a gable roof with the wind parallel to the ridge, the gable spans B.' : '')
};
