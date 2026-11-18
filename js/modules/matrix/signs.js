// UI: the sign conventions of the Matrix Analysis calculators, drawn (Setup step). Each figure shows
// the positive direction of the names used in the tables and results (Kassimali, as the Excel programs).
import { h } from '../../ui/dom.js';
import { canvas, line, pline, text, rect, g } from '../../ui/drawing.js';
import { arrowEl, momentEl, supportEl, tagEl } from './modelCanvas.js';
import { SIGNS } from './mxui.js';

const FW = 300, FH = 190;
const fig = (label) => { const svg = canvas(FW, FH, label, null); svg.classList.add('mxs'); return svg; };
const t = (x, y, str, cls, anchor) => text(x, y, str, anchor || 'start', cls || 'sg-tx');
const node = (x, y, str) => tagEl(x, y, str, 'mx-ntag');
const member = (x1, y1, x2, y2, cls) => line(x1, y1, x2, y2, cls || 'mx-mem');
// Global axes at (x, y): +X right, +Y up.
const axes = (x, y, a = 34, lx = 'X', ly = 'Y') => g('sg-axes', arrowEl(x, y, x + a, y, 'sg-ax', 6), arrowEl(x, y, x, y - a, 'sg-ax', 6), t(x + a + 4, y + 4, '+' + lx, 'sg-axt'), t(x - 4, y - a - 4, '+' + ly, 'sg-axt', 'middle'));
function card(title, svg, cap) { return h('figure', { class: 'mx-sfig' }, h('figcaption', { class: 'mx-ptitle' }, title), svg, cap ? h('p', { class: 'muted small mx-scap' }, cap) : null); }

// ---------------------------------------------------------------- shared pieces
function jointDofs(withRot, names) {
  // names: { h: ['Uh', 'Fh', 'FX'], v: [...], r: [...] }
  const s = fig('Positive joint displacements, reactions and loads');
  s.add(axes(26, 170));
  const x = 150, y = 100;
  s.add(member(60, y, x, y, 'mx-mem sg-faint'));
  s.add(arrowEl(x + 12, y, x + 70, y, 'sg-pos'), t(x + 74, y + 4, names.h.join(', ') + ' +', 'sg-pos-t'));
  s.add(arrowEl(x, y - 12, x, y - 70, 'sg-pos'), t(x + 8, y - 62, names.v.join(', ') + ' +', 'sg-pos-t'));
  if (withRot) { s.add(momentEl(x, y, 26, true, 'sg-rot')); s.add(t(x - 34, y + 46, names.r.join(', ') + ' + counterclockwise', 'sg-rot-t')); }
  s.add(node(x, y, 'N2'));
  return s;
}
function axialForce() {
  const s = fig('Positive axial force: tension');
  const y1 = 62, y2 = 142;
  s.add(member(80, y1, 220, y1, 'mx-mem mx-ten'), arrowEl(80, y1, 36, y1, 'sg-ten'), arrowEl(220, y1, 264, y1, 'sg-ten'));
  s.add(t(150, y1 - 14, 'N > 0: tension (T)', 'sg-ten-t', 'middle'));
  s.add(member(80, y2, 220, y2, 'mx-mem mx-com'), arrowEl(36, y2, 78, y2, 'sg-com'), arrowEl(264, y2, 222, y2, 'sg-com'));
  s.add(t(150, y2 - 14, 'N < 0: compression (C)', 'sg-com-t', 'middle'));
  return s;
}

// ---------------------------------------------------------------- truss
function trussFigs() {
  const angle = (() => {
    const s = fig('Member direction from joint b to joint e');
    s.add(axes(24, 52));
    const bx = 70, by = 150, ex = 240, ey = 50;
    s.add(line(bx, by, bx + 120, by, 'sg-guide'), member(bx, by, ex, ey));
    const th = Math.atan2(by - ey, ex - bx), pts = [];
    for (let k = 0; k <= 12; k++) { const a = th * k / 12; pts.push([bx + 52 * Math.cos(a), by - 52 * Math.sin(a)]); }
    s.add(pline(pts, 'sg-arc'), t(bx + 58, by - 12, 'θ', 'sg-th'));
    s.add(arrowEl(bx + 20, by - 30, bx + 20 + 60 * Math.cos(th), by - 30 - 60 * Math.sin(th), 'sg-loc', 6), t(bx + 30, by - 72, 'x (b → e)', 'sg-loc-t'));
    s.add(node(bx, by, 'b'), node(ex, ey, 'e'));
    s.add(t(150, 182, 'cos θ = ΔX / L,  sin θ = ΔY / L', 'sg-tx', 'middle'));
    return s;
  })();
  const incl = (() => {
    const s = fig('Inclined roller');
    const x = 150, y = 92, a = 25, r = a * Math.PI / 180;
    const sup = supportEl('inclined', x, y, -a);
    s.add(sup);
    // the rolling surface line and the angle from +X
    const gx = x + 21 * Math.sin(r), gy = y + 21 * Math.cos(r);
    s.add(line(gx - 110, gy, gx + 30, gy, 'sg-guide'));
    s.add(arrowEl(x, y, x + 70 * Math.cos(r), y - 70 * Math.sin(r), 'sg-pos', 6), t(x + 74 * Math.cos(r), y - 74 * Math.sin(r) - 4, 'Ut +', 'sg-pos-t'));
    s.add(arrowEl(x, y, x - 70 * Math.sin(r), y - 70 * Math.cos(r), 'sg-pos', 6), t(x - 74 * Math.sin(r) - 6, y - 74 * Math.cos(r) - 4, 'Un, Fn +', 'sg-pos-t', 'end'));
    // the slope of the rolling surface, measured from +X
    const sx = gx - 21 * Math.sin(r) * 0 - 60, pts = [];
    for (let k = 0; k <= 10; k++) { const q = r * k / 10; pts.push([sx + 46 * Math.cos(q), gy - 46 * Math.sin(q)]); }
    s.add(line(sx, gy, sx + 120 * Math.cos(r), gy - 120 * Math.sin(r), 'sg-surf'), pline(pts, 'sg-arc'), t(sx + 50, gy - 6, 'θ', 'sg-th'));
    s.add(node(x, y, 'N3'));
    s.add(t(150, 182, 'Ut along the surface, Un and Fn normal to it', 'sg-tx', 'middle'));
    return s;
  })();
  return [
    card('Joints: displacements, reactions, loads', jointDofs(false, { h: ['Uh', 'Fh', 'FX'], v: ['Uv', 'Fv', 'FY'] }), 'Global X right, Y up. A gravity load is typed negative (FY = −40).'),
    card('Members: direction and angle', angle, 'Each member runs from its first joint b to its second joint e.'),
    card('Member force', axialForce(), 'Shown in blue (tension), red (compression) and grey (zero force) on the drawing.'),
    card('Inclined roller', incl, 'The angle is the slope of the rolling surface, counterclockwise from +X; the matrices use Ut and Un at that joint.')
  ];
}

// ---------------------------------------------------------------- beam
function beamFigs() {
  const ends = (() => {
    const s = fig('Element end forces and displacements');
    const y = 104, x1 = 70, x2 = 230;
    s.add(member(x1, y, x2, y, 'mx-mem mx-thick'));
    s.add(arrowEl(x1, y + 52, x1, y + 12, 'sg-pos', 6), t(x1 - 8, y + 50, 'V1, Uv1', 'sg-pos-t', 'end'));
    s.add(arrowEl(x2, y + 52, x2, y + 12, 'sg-pos', 6), t(x2 + 8, y + 50, 'V2, Uv2', 'sg-pos-t'));
    s.add(momentEl(x1, y, 22, true, 'sg-rot'), t(x1 - 6, y - 32, 'M1, D1', 'sg-rot-t', 'middle'));
    s.add(momentEl(x2, y, 22, true, 'sg-rot'), t(x2 + 6, y - 32, 'M2, D2', 'sg-rot-t', 'middle'));
    s.add(node(x1, y, '1st'), node(x2, y, '2nd'), tagEl(150, y + 16, 'E1', 'mx-etag'));
    s.add(t(150, 182, 'up and counterclockwise +; 1st joint = left end', 'sg-tx', 'middle'));
    return s;
  })();
  const loads = (() => {
    const s = fig('Load signs');
    const y = 112, x1 = 40, x2 = 180;
    s.add(member(x1, y, x2, y, 'mx-mem mx-thick'));
    for (let x = x1; x <= x2 + 0.1; x += 20) s.add(arrowEl(x, y - 40, x, y - 5, 'mx-ds', 5));
    s.add(line(x1, y - 40, x2, y - 40, 'mx-dsl'), t((x1 + x2) / 2, y - 48, 'w = −20 (down)', 'mx-dstx', 'middle'));
    s.add(arrowEl(222, y - 46, 222, y - 6, 'mx-pt'), t(228, y - 40, 'P = −50', 'mx-ptx'));
    s.add(arrowEl(262, y + 48, 262, y + 6, 'mx-pt'), t(268, y + 46, 'P = +30', 'mx-ptx'));
    s.add(momentEl(110, y, 16, true, 'mx-mo'), t(110, y + 34, 'couple + ccw', 'mx-motx', 'middle'));
    s.add(t(150, 182, 'loads + up: a downward load is negative', 'sg-tx', 'middle'));
    return s;
  })();
  const internal = (() => {
    const s = fig('Positive shear and moment');
    // shear: a short segment, left face up, right face down
    const y = 64, a = 40, b = 120;
    s.add(rect(a, y - 10, b - a, 20, 'sg-seg'));
    s.add(arrowEl(a - 8, y + 26, a - 8, y - 8, 'sg-pos', 6), arrowEl(b + 8, y - 26, b + 8, y + 8, 'sg-pos', 6));
    s.add(t((a + b) / 2, y + 34, 'V +', 'sg-pos-t', 'middle'));
    // moment: sagging
    const c = 180, d = 270;
    s.add(pline([[c, y - 6], [(c + d) / 2, y + 6], [d, y - 6]], 'sg-sag'), pline([[c, y + 8], [(c + d) / 2, y + 20], [d, y + 8]], 'sg-sag'));
    s.add(momentEl(c - 4, y + 7, 13, false, 'sg-rot'), momentEl(d + 4, y + 7, 13, true, 'sg-rot'));
    s.add(t((c + d) / 2, y + 40, 'M + sagging', 'sg-rot-t', 'middle'));
    // the diagrams
    s.add(t(150, 128, 'SFD: V + above the axis', 'sg-tx', 'middle'), t(150, 148, 'BMD: drawn on the tension side by default', 'sg-tx', 'middle'), t(150, 168, '(sagging below the axis)', 'sg-tx', 'middle'));
    return s;
  })();
  return [
    card('Joints: displacements, reactions, loads', jointBeam(), 'Settlements + up; prescribed rotations + counterclockwise.'),
    card('Elements: end forces Q = [V1, M1, V2, M2]', ends, 'The member end forces of each element, as in the Matrices card.'),
    card('Member loads', loads, 'Point loads and couples at a from the 1st joint; distributed loads from a to b.'),
    card('Shear and moment diagrams', internal, 'V positive when the left face is pushed up; M positive when the beam sags.')
  ];
}
function jointBeam() {
  const s = fig('Positive joint displacements, reactions and loads');
  const x = 150, y = 104;
  s.add(member(40, y, 260, y, 'mx-mem mx-thick'));
  s.add(arrowEl(x, y - 14, x, y - 76, 'sg-pos'), t(x + 8, y - 64, 'Uv, Fv, FY +', 'sg-pos-t'));
  s.add(momentEl(x, y, 26, true, 'sg-rot'), t(x, y + 50, 'D, M + counterclockwise', 'sg-rot-t', 'middle'));
  s.add(node(x, y, 'N2'));
  return s;
}

// ---------------------------------------------------------------- frame
function frameFigs() {
  const th = 30 * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
  const local = (() => {
    const s = fig('Member local axes');
    s.add(axes(24, 52));
    const bx = 76, by = 140, L = 170, ex = bx + L * c, ey = by - L * sn;
    s.add(member(bx, by, ex, ey));
    const mx = bx + 0.45 * L * c, my = by - 0.45 * L * sn;
    s.add(arrowEl(mx, my, mx + 56 * c, my - 56 * sn, 'sg-loc', 6), t(mx + 60 * c + 2, my - 60 * sn + 12, 'x', 'sg-loc-t'));
    s.add(arrowEl(mx, my, mx - 56 * sn, my - 56 * c, 'sg-loc', 6), t(mx - 60 * sn - 4, my - 60 * c, 'y', 'sg-loc-t', 'end'));
    s.add(line(bx, by, bx + 70, by, 'sg-guide'));
    const pts = []; for (let k = 0; k <= 10; k++) { const a = th * k / 10; pts.push([bx + 44 * Math.cos(a), by - 44 * Math.sin(a)]); }
    s.add(pline(pts, 'sg-arc'), t(bx + 50, by - 6, 'θ', 'sg-th'));
    s.add(node(bx, by, 'b'), node(ex, ey, 'e'));
    s.add(t(150, 182, 'x from b to e; y = x turned 90° counterclockwise', 'sg-tx', 'middle'));
    return s;
  })();
  const endF = (() => {
    const s = fig('Member end forces Q1 to Q6');
    const bx = 60, by = 120, ex = 240, ey = 120;
    s.add(member(bx, by, ex, ey));
    s.add(arrowEl(bx + 8, by, bx + 52, by, 'sg-pos', 6), t(bx + 30, by + 16, 'Q1', 'sg-pos-t', 'middle'));
    s.add(arrowEl(bx, by - 10, bx, by - 58, 'sg-pos', 6), t(bx + 6, by - 52, 'Q2', 'sg-pos-t'));
    s.add(momentEl(bx, by, 20, true, 'sg-rot'), t(bx - 26, by + 30, 'Q3', 'sg-rot-t', 'middle'));
    s.add(arrowEl(ex + 8, ey, ex + 52, ey, 'sg-pos', 6), t(ex + 30, ey + 16, 'Q4', 'sg-pos-t', 'middle'));
    s.add(arrowEl(ex, ey - 10, ex, ey - 58, 'sg-pos', 6), t(ex + 6, ey - 52, 'Q5', 'sg-pos-t'));
    s.add(momentEl(ex, ey, 20, true, 'sg-rot'), t(ex - 26, ey + 30, 'Q6', 'sg-rot-t', 'middle'));
    s.add(node(bx, by, 'b'), node(ex, ey, 'e'));
    s.add(t(150, 182, 'along local x, local y, and counterclockwise', 'sg-tx', 'middle'));
    return s;
  })();
  const loads = (() => {
    const s = fig('Member load signs');
    const bx = 30, by = 70, ex = 200, ey = 70;
    s.add(member(bx, by, ex, ey));
    for (let x = bx + 10; x <= ex - 10 + 0.1; x += 20) s.add(arrowEl(x, by - 34, x, by - 5, 'mx-ds', 5));
    s.add(t((bx + ex) / 2, by - 40, 'local w +: toward −y', 'mx-dstx', 'middle'));
    s.add(arrowEl(ex - 30, by + 18, ex - 70, by + 18, 'mx-pt', 6), t(ex - 50, by + 34, 'axial +: toward −x', 'mx-ptx', 'middle'));
    s.add(momentEl(258, by - 14, 15, false, 'mx-mo'), t(258, by + 16, 'couple +: cw', 'mx-motx', 'middle'));
    s.add(t(150, 130, 'Global loads (Y or X): + along +Y or +X,', 'sg-tx', 'middle'), t(150, 148, 'so gravity is negative; global couples + ccw.', 'sg-tx', 'middle'),
      t(150, 168, 'Projected: w per horizontal (or vertical) length.', 'sg-tx', 'middle'));
    return s;
  })();
  const internal = (() => {
    const s = fig('Positive N, V and M');
    const y = 60, a = 46, b = 126;
    s.add(rect(a, y - 10, b - a, 20, 'sg-seg'));
    s.add(arrowEl(a - 4, y, a - 40, y, 'sg-ten', 6), arrowEl(b + 4, y, b + 40, y, 'sg-ten', 6), t((a + b) / 2, y + 30, 'N + tension', 'sg-ten-t', 'middle'));
    const c2 = 190, d2 = 270;
    s.add(pline([[c2, y - 6], [(c2 + d2) / 2, y + 6], [d2, y - 6]], 'sg-sag'), pline([[c2, y + 8], [(c2 + d2) / 2, y + 20], [d2, y + 8]], 'sg-sag'));
    s.add(momentEl(c2 - 4, y + 7, 13, false, 'sg-rot'), momentEl(d2 + 4, y + 7, 13, true, 'sg-rot'), t((c2 + d2) / 2, y + 40, 'M + sagging', 'sg-rot-t', 'middle'));
    s.add(t(150, 126, 'V = Q2 at b (beam convention along b → e)', 'sg-tx', 'middle'), t(150, 146, 'sagging: tension on the local −y face', 'sg-tx', 'middle'),
      t(150, 166, 'M drawn on the tension side by default', 'sg-tx', 'middle'));
    return s;
  })();
  return [
    card('Joints: displacements, reactions, loads', jointDofs(true, { h: ['Uh', 'Fh', 'FX'], v: ['Uv', 'Fv', 'FY'], r: ['D', 'M'] }), 'Global X right, Y up; joint moments and rotations + counterclockwise.'),
    card('Members: local axes', local, 'Local x runs from the member\'s joint b to joint e.'),
    card('Members: end forces', endF, 'Q = [Q1 … Q6] in local axes, as in the Matrices card (Kassimali).'),
    card('Member loads', loads, 'Local member loads keep the book\'s signs.'),
    card('Axial force, shear and moment', internal, 'Blue fills: positive; red fills: negative.')
  ];
}

// ---------------------------------------------------------------- bar
function barFigs() {
  const dofs = (() => {
    const s = fig('Positive node displacements and forces');
    const y = 100, x1 = 50, x2 = 230;
    s.add(member(x1, y, x2, y, 'mx-mem mx-thick'));
    s.add(arrowEl(x2 + 10, y - 26, x2 + 56, y - 26, 'sg-pos', 6), t(x2 - 4, y - 36, 'U2, F2 +', 'sg-pos-t'));
    s.add(arrowEl(x1 + 10, y - 26, x1 + 56, y - 26, 'sg-pos', 6), t(x1 - 4, y - 36, 'U1, F1 +', 'sg-pos-t'));
    s.add(node(x1, y, '1st'), node(x2, y, '2nd'), tagEl(140, y + 16, '[1]', 'mx-etag'));
    s.add(arrowEl(40, 160, 90, 160, 'sg-ax', 6), t(96, 164, '+x', 'sg-axt'));
    s.add(t(150, 182, 'to the right +; 1st node = left end', 'sg-tx', 'middle'));
    return s;
  })();
  const loads = (() => {
    const s = fig('Element loads, temperature and misfit');
    const y = 70, x1 = 30, x2 = 270;
    s.add(member(x1, y, x2, y, 'mx-mem mx-thick'));
    for (let x = x1 + 6; x <= 140; x += 22) s.add(arrowEl(x, y - 14, x + 16, y - 14, 'mx-ds', 4));
    s.add(t(86, y - 24, 'w + to the right', 'mx-dstx', 'middle'));
    s.add(arrowEl(190, y - 16, 230, y - 16, 'mx-pt', 6), t(210, y - 24, 'P +', 'mx-ptx', 'middle'));
    s.add(t(150, 126, 'ΔT +: heating (the element tries to grow)', 'sg-tx', 'middle'), t(150, 146, 'e0 +: the element is too long', 'sg-tx', 'middle'),
      t(150, 166, 'prescribed displacement + to the right', 'sg-tx', 'middle'));
    return s;
  })();
  return [
    card('Nodes: displacements and forces', dofs, 'U, F and reactions are positive to the right.'),
    card('Axial force', axialForce(), 'The N diagram draws tension above the axis and compression below.'),
    card('Element loads', loads, 'w1 at the 1st node, w2 at the 2nd; P at a from the 1st node.')
  ];
}

const FIGS = { truss: trussFigs, beam: beamFigs, frame: frameFigs, bar: barFigs };

// The Setup step's Signs card: the figures, then the same conventions in words.
export function signsFigureCard(kind) {
  return h('section', { class: 'card mx-signs', 'aria-label': 'Sign conventions' }, h('h3', { class: 'h3' }, 'Sign conventions'),
    h('div', { class: 'mx-sgrid' }, FIGS[kind]()),
    h('p', { class: 'small', style: 'margin:10px 0 0' }, SIGNS[kind]));
}
