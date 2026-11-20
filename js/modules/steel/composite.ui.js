// Composite members: module definition and live drawings.
import { solve } from './composite.calc.js';
import presets from '../../../presets/steel-composite.js';
import { num, sel, prop } from './fields.js';
import { bar } from '../rc/fields.js';
import { canvas, fit, line, text, cap, rect, circle, poly, pline, path, iShape, hatch, arrow, dimH, dimV } from '../../ui/drawing.js';

const W450x60 = { As: 7613, dsec: 455, bf: 153, tf: 13.3, tw: 8.0, htw: 50.9, Ix: 254.73e6, Iy: 7.95e6 };
const W250x73 = { As: 9290, dsec: 254, bf: 254, tf: 14.2, tw: 8.6, htw: 23.1, Ix: 113.21e6, Iy: 38.88e6 };
const P = {
  As: ['A', 'steel area', 'As', 'area'], dsec: ['d', 'depth', 'd', 'length_mm'], bf: ['bf', 'flange width', 'bf', 'length_mm'], tf: ['tf', 'flange thickness', 'tf', 'length_mm'],
  tw: ['tw', 'web thickness', 'tw', 'length_mm'], htw: ['h_tw', 'web slenderness', 'h/tw', 'ratio'], Ix: ['Ix', 'moment of inertia, major axis', 'Ix', 'inertia'], Iy: ['Iy', 'moment of inertia, minor axis', 'Iy', 'inertia']
};
const props = (keys, def, optional = []) => keys.map((k) => prop(k, P[k][0], P[k][1], P[k][2], P[k][3], def[k], optional.includes(k) ? { optional: true } : null));

const N1_OPTIONS = [{ value: 'full', label: 'Full composite' }].concat(Array.from({ length: 100 }, (x, i) => ({ value: i + 1, label: (i + 1) + (i ? ' studs' : ' stud') })));

function fields(mode, method, val) {
  const m = method || 'LRFD', asd = m === 'ASD';
  const concrete = (step) => [num('fc', 'concrete strength', "f'c", 'stress', step, mode === 'beam' ? 28 : 35, { min: 21, max: 70 }), num('wc', 'concrete density', 'wc', 'density', step, 2400, { min: 1500, max: 2500 })];
  if (mode === 'beam') {
    const deck = val.deck || 'none', f = [
      { type: 'shape', key: 'shape', label: 'Steel beam (W shapes)', step: 'Section', default: 'W450x60', types: ['W'], props: props(['As', 'dsec', 'bf', 'tf', 'tw', 'htw', 'Ix', 'Iy'], W450x60, ['Ix', 'Iy']) },
      num('Fy', 'steel yield strength', 'Fy', 'stress', 'Section', 345, { max: 525 }),
      num('span', 'simple span', 'L', 'length_mm', 'Slab', 9000),
      num('spacingL', 'distance to the adjacent beam, left', 'sL', 'length_mm', 'Slab', 3000),
      num('edge', 'distance to the slab edge, right side (blank for an interior beam)', 'e', 'length_mm', 'Slab', null, { optional: true })];
    if (!(val.edge > 0)) f.push(num('spacingR', 'distance to the adjacent beam, right', 'sR', 'length_mm', 'Slab', 3000));
    f.push(sel('deck', 'Slab type', 'Slab', 'none', [{ value: 'none', label: 'Solid slab' }, { value: 'perpendicular', label: 'Steel deck, ribs perpendicular to the beam' }, { value: 'parallel', label: 'Steel deck, ribs parallel to the beam' }], { wide: true }));
    f.push(num('tc', deck === 'none' ? 'slab thickness' : 'concrete above the deck', 'tc', 'length_mm', 'Slab', 125));
    if (deck !== 'none') f.push(num('hr', 'deck rib height', 'hr', 'length_mm', 'Slab', 75, { max: 75 }), num('wr', 'average rib width' + (deck === 'parallel' ? '' : ' (optional)'), 'wr', 'length_mm', 'Slab', 150, deck === 'parallel' ? { min: 50 } : { min: 50, optional: true }));
    f.push(...concrete('Slab'));
    f.push(sel('stud', 'Stud diameter', 'Studs', 19, [{ value: 16, label: '16 mm' }, { value: 19, label: '19 mm' }, { value: 22, label: '22 mm (above the 20 mm limit through a deck)' }]),
      num('Fu', 'stud tensile strength', 'Fu', 'stress', 'Studs', 450));
    if (deck === 'perpendicular') f.push(sel('studsPerRib', 'Studs per rib', 'Studs', 1, [{ value: 1, label: '1 stud' }, { value: 2, label: '2 studs' }, { value: 3, label: '3 studs' }]),
      { key: 'emid50', type: 'check', label: 'Stud placed with e mid-ht ≥ 50 mm (Rp = 0.75)', step: 'Studs', default: false });
    f.push(sel('N1', 'Studs from the point of maximum moment to zero moment (N1)', 'Studs', 'full', N1_OPTIONS, { wide: true }));
    f.push(num('Mu', 'required flexural strength (' + m + ')', asd ? 'Ma' : 'Mu', 'moment', 'Loads', 600, { min: 0 }));
    return f;
  }
  const load = [num('KL', 'effective length (both axes)', 'KL', 'length_mm', 'Loads', mode === 'encased' ? 4000 : 5000), num('Pu', 'required compressive strength (' + m + ')', asd ? 'Pa' : 'Pu', 'force', 'Loads', mode === 'encased' ? 6000 : 4000, { min: 0 })];
  if (mode === 'encased') {
    return [
      { type: 'shape', key: 'shape', label: 'Encased steel core (W shapes)', step: 'Section', default: 'W250x73', types: ['W'], props: props(['As', 'dsec', 'bf', 'tf', 'tw', 'Ix', 'Iy'], W250x73) },
      num('Fy', 'steel yield strength', 'Fy', 'stress', 'Section', 345, { max: 525 }),
      num('b', 'concrete width (along x)', 'b', 'length_mm', 'Concrete', 450), num('h', 'concrete depth (along the web)', 'h', 'length_mm', 'Concrete', 450),
      ...concrete('Concrete'),
      num('barsPerFace', 'longitudinal bars per face (corner bars counted on both faces)', 'n', 'count', 'Bars', 2, { min: 2 }),
      bar('db', 'Longitudinal bar', 'Bars', 25), num('Fyr', 'bar yield strength', 'Fysr', 'stress', 'Bars', 420),
      bar('tie', 'Tie bar', 'Bars', 10), num('cover', 'clear cover to the ties', 'cc', 'length_mm', 'Bars', 40, { min: 40 }),
      num('sTie', 'tie spacing (optional)', 's', 'length_mm', 'Bars', null, { optional: true }),
      ...load];
  }
  const hss = val.hss === 'round' ? 'round' : 'rect';
  const f = [sel('hss', 'Tube', 'Section', 'rect', [{ value: 'rect', label: 'Rectangular HSS' }, { value: 'round', label: 'Round HSS' }])];
  if (hss === 'rect') f.push(num('B', 'tube width', 'B', 'length_mm', 'Section', 300), num('H', 'tube depth', 'H', 'length_mm', 'Section', 300));
  else f.push(num('D', 'outside diameter', 'D', 'length_mm', 'Section', 400));
  f.push(num('t', 'design wall thickness', 't', 'length_mm', 'Section', 10), num('Fy', 'steel yield strength', 'Fy', 'stress', 'Section', 345, { max: 525 }), ...concrete('Concrete'), ...load);
  return f;
}

// ---- drawings
function drawBeam(D, o) {
  const svg = canvas(520, 340, 'Composite beam cross-section with the plastic stress blocks, and the beam elevation with the stud layout', o);
  if (!(D.dsec > 0 && D.bf > 0 && D.tc > 0 && D.be > 0)) return svg;
  const tot = D.tc + D.hr + D.dsec, F = fit(D.be, tot, 30, 22, 330, 176), k = F.k, x0 = F.x(0), y0 = F.y(0), cx = F.x(D.be / 2);
  const ySteel = y0 + (D.tc + D.hr) * k;
  // Slab and deck profile (rib pitch illustrative, about twice the rib width; concrete in the ribs is neglected)
  svg.add(rect(x0, y0, D.be * k, D.tc * k, 'conc'));
  if (D.hr > 0) {
    const wr = (D.wr > 0 ? D.wr : 150) * k, pitch = 2 * wr + 4, pts = [[x0, y0 + D.tc * k]];
    for (let x = x0; x < x0 + D.be * k - pitch / 2; x += pitch) pts.push([x + pitch * 0.2, y0 + D.tc * k], [x + pitch * 0.3, ySteel], [x + pitch * 0.7, ySteel], [x + pitch * 0.8, y0 + D.tc * k]);
    pts.push([x0 + D.be * k, y0 + D.tc * k]);
    svg.add(pline(pts, 'ax'));
    svg.add(text(x0 + D.be * k + 4, y0 + (D.tc + D.hr / 2) * k + 4, D.deck === 'parallel' ? 'ribs ∥' : 'ribs ⊥'));
  }
  svg.add(iShape(cx, ySteel, D.dsec * k, D.bf * k, Math.max(D.tf * k, 1.5), Math.max(D.tw * k, 1)));
  // Studs on the top flange
  const nStud = D.hr > 0 && D.studsPerRib > 1 ? D.studsPerRib : 1, hs = Math.max((D.hr > 0 ? D.hr + 0.6 * D.tc : 0.7 * D.tc) * k, 4), ws = Math.max(D.stud * k, 1.5);
  for (let i = 0; i < nStud; i++) { const sx = cx + (i - (nStud - 1) / 2) * Math.max(3 * ws, 5); svg.add(rect(sx - ws / 2, ySteel - hs, ws, hs, 'steel'), rect(sx - ws, ySteel - hs - 2, ws * 2, 2, 'steel')); }
  // Plastic neutral axis and the effective width
  const yPNA = D.PNA === 'slab' ? y0 + D.a * k : ySteel + D.ybar * k;
  svg.add(line(x0 - 6, yPNA, x0 + D.be * k + 6, yPNA, 'na'), text(x0 + D.be * k, yPNA - 4, 'PNA', 'end'));
  svg.add(dimH(x0, x0 + D.be * k, y0 - 8, 'be = ' + o.fq(D.be, 'length_mm'), true));
  svg.add(dimV(x0 - 8, y0, y0 + D.tc * k, 'tc', false));
  // Stress blocks (to the same vertical scale)
  const sx = 446, wB = 24, yBot = ySteel + D.dsec * k;
  svg.add(line(sx, y0, sx, yBot, 'ax'));
  svg.add(rect(sx - wB, y0, wB, Math.max(D.a * k, 1), 'poly'), text(sx - wB - 3, y0 + Math.max(D.a * k, 8) / 2 + 4, "0.85f'c", 'end'));
  if (D.PNA !== 'slab' && D.ybar > 0) svg.add(rect(sx - wB, ySteel, wB, D.ybar * k, 'poly'), text(sx - wB - 3, ySteel + D.ybar * k / 2 + 4, 'Fy', 'end'));
  const yT = D.PNA === 'slab' ? ySteel : ySteel + D.ybar * k;
  svg.add(rect(sx, yT, wB, yBot - yT, 'comp'), text(sx + wB + 3, (yT + yBot) / 2 + 4, 'Fy'));
  svg.add(text(sx - wB, y0 - 6, 'C', 'middle'), text(sx + wB / 2, yBot + 13, 'T', 'middle'));
  svg.add(cap(F.x(D.be / 2), 216, 'Section at maximum moment'), cap(sx, 216, 'Plastic stresses (illustrative)'));
  // Elevation with the studs
  const ex0 = 40, ex1 = 480, ey = 276, ew = ex1 - ex0;
  svg.add(rect(ex0, ey - 10, ew, 6, 'conc'), rect(ex0, ey - 4, ew, 10, 'steel'));
  svg.add(poly([[ex0, ey + 6], [ex0 - 7, ey + 18], [ex0 + 7, ey + 18]], 'ax'), poly([[ex1, ey + 6], [ex1 - 7, ey + 18], [ex1 + 7, ey + 18]], 'ax'), hatch(ex0 - 10, ex0 + 10, ey + 18, 5, 6), hatch(ex1 - 10, ex1 + 10, ey + 18, 5, 6));
  const n = Math.min(Math.max(Math.round(D.N) || 1, 1), 40);
  for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) { const x = s ? ex1 - (i + 0.5) * (ew / 2) / n : ex0 + (i + 0.5) * (ew / 2) / n; svg.add(line(x, ey - 10, x, ey - 17, 'markline')); }
  svg.add(line((ex0 + ex1) / 2, ey - 26, (ex0 + ex1) / 2, ey + 8, 'dash'), text((ex0 + ex1) / 2, ey - 30, 'maximum moment', 'middle'));
  svg.add(text(ex0 + ew / 4, ey - 22, (D.full ? 'full: ' : '') + D.N + ' studs', 'middle'), text(ex1 - ew / 4, ey - 22, D.N + ' studs', 'middle'));
  if (D.N > n) svg.add(text((ex0 + ex1) / 2, ey + 22, 'stud marks capped at 40 per half span', 'middle'));
  svg.add(dimH(ex0, ex1, ey + 24, 'L = ' + o.fq(D.span, 'length_mm')));
  svg.add(cap(260, 336, 'Elevation (studs at the average spacing ' + o.fq(D.sAvg, 'length_mm') + ')'));
  return svg;
}

function drawColumn(D, o) {
  const svg = canvas(520, 270, 'Composite column cross-section and elevation with the effective length', o);
  const enc = D.mode === 'encased';
  const W = enc ? D.b : D.hss === 'round' ? D.D : D.B, H = enc ? D.h : D.hss === 'round' ? D.D : D.H;
  if (!(W > 0 && H > 0)) return svg;
  const F = fit(W, H, 40, 22, 220, 190), k = F.k, cx = F.x(W / 2), cy = F.y(H / 2);
  if (enc) {
    svg.add(rect(F.x(0), F.y(0), W * k, H * k, 'conc'));
    const ti = (D.cover + D.tie / 2) * k;
    svg.add(rect(F.x(0) + ti, F.y(0) + ti, W * k - 2 * ti, H * k - 2 * ti, 'barline'));
    (D.bars || []).forEach((p) => svg.add(circle(cx + p[0] * k, cy - p[1] * k, Math.max(D.db * k / 2, 2))));
    if (D.dsec > 0 && D.bf > 0) svg.add(iShape(cx, cy - D.dsec * k / 2, D.dsec * k, D.bf * k, Math.max(D.tf * k, 1.5), Math.max(D.tw * k, 1)));
    svg.add(dimV(F.x(W) + 10, F.y(0), F.y(0) + D.cover * k, 'cover ' + o.fq(D.cover, 'length_mm'), true));
  } else if (D.hss === 'round') {
    svg.add(circle(cx, cy, W * k / 2, 'steel'), circle(cx, cy, (W - 2 * D.t) * k / 2, 'conc'));
  } else {
    svg.add(rect(F.x(0), F.y(0), W * k, H * k, 'steel'), rect(F.x(0) + D.t * k, F.y(0) + D.t * k, (W - 2 * D.t) * k, (H - 2 * D.t) * k, 'conc'));
  }
  if (!enc) svg.add(text(cx, cy + 22, 'concrete fill', 'middle'), text(F.x(W) + 8, F.y(0) + 10, 't = ' + o.fq(D.t, 'length_mm')));
  svg.add(line(F.x(0) - 10, cy, F.x(W) + 10, cy, 'dash'), text(F.x(0) - 14, cy + 4, 'x', 'end'), line(cx, F.y(0) - 10, cx, F.y(H) + 10, 'dash'));
  svg.add(dimH(F.x(0), F.x(W), F.y(H) + 12, (enc ? 'b = ' : D.hss === 'round' ? 'D = ' : 'B = ') + o.fq(W, 'length_mm')));
  if (D.hss !== 'round') svg.add(dimV(F.x(0) - 22, F.y(0), F.y(H), (enc ? 'h' : 'H'), false));
  svg.add(cap(cx, 264, enc ? 'Encased section' : 'Filled section'));
  // Elevation
  const ex = 400, top = 34, bot = 222;
  svg.add(line(ex - 30, top, ex + 30, top, 'ax'), line(ex - 30, bot, ex + 30, bot, 'ax'), hatch(ex - 30, ex + 30, bot), rect(ex - 9, top, 18, bot - top, 'conc'));
  svg.add(path('M' + ex + ',' + top + ' Q' + (ex + 50) + ',' + ((top + bot) / 2) + ' ' + ex + ',' + bot, 'markline'), arrow(ex, 6, ex, top - 2), text(ex + 8, 16, D.Pu != null ? 'P = ' + o.fq(D.Pu, 'force') : 'P'));
  svg.add(dimV(ex - 40, top, bot, 'KL = ' + o.fq(D.KL, 'length_mm'), false));
  if (D.Pa > 0) svg.add(text(ex + 46, (top + bot) / 2 + 4, D.inelastic ? 'inelastic' : 'elastic'), text(ex + 46, (top + bot) / 2 + 18, 'buckling'));
  svg.add(cap(ex, 264, 'Elevation'));
  return svg;
}

function draw(result, o) {
  const D = result.diagram || {};
  if (D.mode === 'encased' || D.mode === 'filled') return drawColumn(D, o);
  return drawBeam(D, o);
}

export default {
  id: 'steel/composite', group: 'steel', title: 'Composite',
  methods: ['LRFD', 'ASD'],
  modes: [{ id: 'beam', label: 'Composite beam', icon: 'ishape' }, { id: 'encased', label: 'Encased column', icon: 'ishape' }, { id: 'filled', label: 'Filled column', icon: 'ishape' }],
  steps: (mode) => (mode === 'beam' ? ['Setup', 'Section', 'Slab', 'Studs', 'Loads', 'Results'] : mode === 'encased' ? ['Setup', 'Section', 'Concrete', 'Bars', 'Loads', 'Results'] : ['Setup', 'Section', 'Concrete', 'Loads', 'Results']),
  fields, presets, solve, draw,
  setupNote: 'Plastic stress distribution of Section 509 for simply supported composite beams with headed studs (positive moment), and axially loaded encased and filled composite columns. Elastic stress distribution, negative moment, combined axial force and flexure, and the construction stage are not covered.',
  stepHelp: (step, mode) => (step === 'Studs' ? 'N1 is the number of studs between the point of maximum moment and the nearest point of zero moment: for a simple span, the studs on each half span.'
    : step === 'Slab' ? 'The effective width on each side is the least of span/8, half the distance to the next beam and the distance to the slab edge.'
      : step === 'Bars' ? 'Bars are placed with their centres at cover + tie + db/2 from each face.' : mode !== 'beam' && step === 'Loads' ? 'KL is used about both axes; the weaker axis governs.' : '')
};

