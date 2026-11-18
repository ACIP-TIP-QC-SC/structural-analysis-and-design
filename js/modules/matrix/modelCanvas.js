// UI: the model drawing shared by the Matrix Analysis calculators. It follows the diagram the Excel
// programs draw on their tabs: the structure to scale with supports, applied loads (purple, couples
// orange, distributed loads blue), reactions (green, "Fv1 = … kN"), node tags N# and element tags;
// a solved truss shows tension blue, compression red and zero force grey with the words on the
// members. The result diagrams (elastic curve, SFD, BMD, N, V, M, u) are drawn by diagrams.js.
// Input on the drawing (add joints and members, select, delete) goes through the workspace's
// onChange, so the tables stay the source.
import { h, s } from '../../ui/dom.js';
import { canvas, line, circle, poly, pline, text, rect, g, dimH } from '../../ui/drawing.js';
import { fmt } from '../../core/format.js';
import { unitLabel } from '../../core/units.js';

export const W = 640, H = 430;
export const newCanvasState = (kind) => ({ kind, tool: 'select', grid: null, mside: 'tension', sel: null, pending: null, lock: null });

const finiteJ = (kind, j) => isFinite(j.x) && (kind === 'beam' || kind === 'bar' || isFinite(j.y));
export const isLine = (kind) => kind === 'beam' || kind === 'bar';

// Title of each drawing, as in the Excel programs (units: the display units of the forces and lengths).
const TITLES = {
  truss: ['Truss diagram', 'members to scale, arrows not'],
  beam: ['Free body diagram', 'beam, supports and load positions to scale; arrow lengths not to scale'],
  frame: ['Frame, loads and reactions', 'members to scale, arrows not'],
  bar: ['Bar, loads and reactions', 'lengths to scale along the bar; arrows not to scale']
};
export function unitWords(D, sys) { return D.units === 'consistent' ? '' : unitLabel('force', sys) + ', ' + unitLabel('length_m', sys); }
export function titleText(kind, D, sys) { const t = TITLES[kind], u = unitWords(D, sys); return t[0] + (u ? ': ' + u : '') + ' (' + t[1] + ')'; }

export function arrowEl(x1, y1, x2, y2, cls, head = 7) {
  const a = Math.atan2(y2 - y1, x2 - x1), w = 0.45;
  return g(cls, line(x1, y1, x2, y2, 'mx-al'), poly([[x2, y2], [x2 - head * Math.cos(a - w), y2 - head * Math.sin(a - w)], [x2 - head * Math.cos(a + w), y2 - head * Math.sin(a + w)]], 'mx-ah'));
}
// Moment arc around (x, y), arrowhead at the end: counterclockwise as seen when positive.
// (Screen y runs down, so a visually counterclockwise sweep has a decreasing screen angle.)
export function momentEl(x, y, r, ccw, cls) {
  const a0 = ccw ? 0.6 * Math.PI : 0.4 * Math.PI, sg = ccw ? -1 : 1, pts = [];
  for (let k = 0; k <= 18; k++) { const t = a0 + sg * 1.5 * Math.PI * k / 18; pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]); }
  const [px, py] = pts[pts.length - 1], [qx, qy] = pts[pts.length - 2];
  return g(cls, pline(pts, 'mx-al'), arrowHead(qx, qy, px, py));
}
function arrowHead(x1, y1, x2, y2, head = 7) {
  const a = Math.atan2(y2 - y1, x2 - x1), w = 0.45;
  return poly([[x2, y2], [x2 - head * Math.cos(a - w), y2 - head * Math.sin(a - w)], [x2 - head * Math.cos(a + w), y2 - head * Math.sin(a + w)]], 'mx-ah');
}

// Support symbol in a local frame: origin at the joint, local +y (screen) away from the structure;
// rot = screen rotation in degrees.
export function supportEl(type, x, y, rot, opts) {
  const kids = [];
  const hatch = (y0, x0 = -16, x1 = 16) => { for (let u = x0; u <= x1; u += 6) kids.push(line(u, y0, u - 5, y0 + 6, 'mx-hatch')); };
  if (type === 'pin' || type === 'hinge') { kids.push(poly([[0, 0], [-10, 16], [10, 16]], 'mx-sup'), line(-17, 16, 17, 16, 'mx-gnd')); hatch(16); }
  else if (type === 'roller' || type === 'rollerY' || type === 'inclined') { kids.push(poly([[0, 0], [-10, 13], [10, 13]], 'mx-sup'), circle(-5.5, 17, 3.5, 'mx-sup'), circle(5.5, 17, 3.5, 'mx-sup'), line(-17, 21, 17, 21, 'mx-gnd')); hatch(21); }
  else if (type === 'fixed') { kids.push(line(-17, 0, 17, 0, 'mx-wall')); hatch(1, -17, 17); }
  else if (type === 'guided') { kids.push(rect(-7, -7, 14, 14, 'mx-sup'), circle(-4, 10.5, 3.5, 'mx-sup'), circle(4, 10.5, 3.5, 'mx-sup'), line(-17, 14, 17, 14, 'mx-gnd')); hatch(14); }
  else if (type === 'rotation') { kids.push(rect(-7, -7, 14, 14, 'mx-sup'), line(-7, -7, 7, 7, 'mx-gnd'), line(-7, 7, 7, -7, 'mx-gnd')); }
  else if (type === 'clamp') { kids.push(rect(-6, -6, 12, 12, 'mx-clamp')); }
  const el = g('mx-supg', kids);
  el.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + (rot || 0).toFixed(2) + ')');
  if (opts && opts.title) el.appendChild(s('title', null, opts.title));
  return el;
}

// Symbol and its screen rotation for a support type.
export function supportOf(kind, j, J) {
  const t = j.support;
  if (!t || t === 'free') return null;
  if (kind === 'truss') {
    if (t === 'pin') return ['pin', 0];
    if (t === 'rollerY') return ['roller', 0];
    if (t === 'rollerX') return ['roller', 90];
    if (t === 'inclined') return ['inclined', -(j.angle || 0)];
  }
  if (kind === 'frame') {
    if (t === 'hinge') return ['pin', 0];
    if (t === 'fixed') return ['fixed', 0];
    if (t === 'rollerY') return ['roller', 0];
    if (t === 'rollerX') return ['roller', 90];
    if (t === 'guidedX') return ['guided', 0];
    if (t === 'guidedY') return ['guided', 90];
    if (t === 'rotation') return ['rotation', 0];
    if (t === 'inclined') return ['inclined', -(j.angle || 0)];
  }
  if (kind === 'beam' || kind === 'bar') {
    // a wall faces the beam: at the left end it stands on the left, at the right end on the right
    const xs = [...J.values()].map((q) => q.X), left = j.X <= Math.min(...xs) + 1e-12, right = j.X >= Math.max(...xs) - 1e-12;
    if (t === 'pin') return ['pin', 0];
    if (t === 'fixed') return ['fixed', left ? 90 : right ? -90 : 0];
    if (t === 'guided') return ['guided', left ? 90 : right ? -90 : 0];
  }
  return null;
}

// Screen mapping of a model, shared by the model drawing and the result diagrams (so the beam's
// FBD, elastic curve, SFD and BMD line up). Lengths in the display unit (lf = 1/0.3048 in English).
export function layoutOf(kind, D, state) {
  const units = D.units || 'SI', lf = units === 'US' ? 1 / 0.3048 : 1;
  const joints = (D.joints || []).filter((j) => finiteJ(kind, j)).map((j) => Object.assign({}, j, { X: j.x * lf, Y: (j.y || 0) * lf }));
  const J = new Map(joints.map((j) => [j.id, j]));
  const members = (D.members || []).filter((m) => J.has(m.i) && J.has(m.j) && m.i !== m.j);
  // parallel bar elements between the same two nodes are drawn in lanes (screen offset in px)
  const lane = new Map(), laneNo = new Map();
  if (kind === 'bar') {
    const groups = new Map();
    members.forEach((m) => { const key = Math.min(m.i, m.j) + '-' + Math.max(m.i, m.j); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m.id); });
    groups.forEach((ids) => ids.forEach((id, k) => { lane.set(id, (k - (ids.length - 1) / 2) * 18); laneNo.set(id, k); }));
  }
  const lo = (id) => lane.get(id) || 0;
  let x0 = Math.min(...joints.map((j) => j.X)), x1 = Math.max(...joints.map((j) => j.X));
  let y0 = Math.min(...joints.map((j) => j.Y)), y1 = Math.max(...joints.map((j) => j.Y));
  if (!joints.length) { x0 = 0; x1 = 10; y0 = 0; y1 = 6; }
  const span = Math.max(x1 - x0, y1 - y0, 1e-9);
  if (isLine(kind)) { y0 = -0.18 * span; y1 = 0.18 * span; }
  if (x1 - x0 < 0.25 * span) { const c = (x0 + x1) / 2; x0 = c - 0.125 * span; x1 = c + 0.125 * span; }
  if (y1 - y0 < 0.25 * span) { const c = (y0 + y1) / 2; y0 = c - 0.125 * span; y1 = c + 0.125 * span; }
  const grid = (state && state.grid) || 1;
  if (state && (state.tool === 'joint' || state.tool === 'member')) {
    const pad = Math.max(2 * grid, 0.15 * span);
    x0 -= pad; x1 += pad; if (!isLine(kind)) { y0 -= pad; y1 += pad; }
  }
  if (state && state.lock) ({ x0, x1, y0, y1 } = state.lock);
  // frames and trusses keep a band on the left for the height dimension
  const bx = isLine(kind) ? 84 : 130, by = isLine(kind) ? 64 : 80, bw = W - 2 * bx, bh = H - by - 76;
  const k = Math.min(bw / (x1 - x0), bh / (y1 - y0));
  const ox = bx + (bw - (x1 - x0) * k) / 2, oy = by + (bh - (y1 - y0) * k) / 2;
  const X = (x) => ox + (x - x0) * k, Y = (y) => oy + (y1 - y) * k;
  return { X, Y, k, lf, joints, J, members, lo, laneNo, span, ext: { x0, x1, y0, y1 }, inv: (sx, sy) => [x0 + (sx - ox) / k, y1 - (sy - oy) / k] };
}

// Label placement: boxes already used; a label is skipped (unless forced) when it would overlap one.
export function labeller(lay, Wd, Hd) {
  const hit = (bx0, by0, w, hh) => (b) => bx0 < b[0] + b[2] && bx0 + w > b[0] && by0 < b[1] + b[3] && by0 + hh > b[1];
  const free = (bx0, by0, w, hh) => !lay.boxes.some(hit(bx0, by0, w, hh)) && !(lay.mem || []).some(hit(bx0, by0, w, hh));
  const label = (x, y, str, cls, anchor, force) => {
    const w = str.length * 6.6 + 4, hh = 13, minX = lay.minX || 3;
    let lx = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    const shift = lx < minX ? minX - lx : lx + w > Wd - 3 ? Wd - 3 - (lx + w) : 0;
    lx += shift; x += shift;
    y = Math.max(12, Math.min(Hd - 4, y));
    if (!force && !free(lx, y - 10, w, hh)) return null;
    lay.boxes.push([lx, y - 10, w, hh]);
    return text(x, y, str, anchor || 'start', cls);
  };
  return { label, free };
}

// A dark tag with white text (element tags E#) or a navy pill (node tags N#), centred on (x, y).
export function tagEl(x, y, str, cls) {
  const w = str.length * 6.4 + 8, hh = 15;
  return g(cls, rect(x - w / 2, y - hh / 2, w, hh, 'mx-tagbox'), text(x, y + 3.8, str, 'middle', 'mx-tagtx'));
}
export const tagW = (str) => str.length * 6.4 + 8;

// Vertical dimension with the label turned along the line (the band left of the structure).
function dimVrot(x, y1, y2, label) {
  const t = text(0, 0, label, 'middle');
  t.setAttribute('transform', 'translate(' + (x - 6).toFixed(1) + ',' + ((y1 + y2) / 2).toFixed(1) + ') rotate(-90)');
  return g('dimg', line(x, y1, x, y2, 'dim'), line(x - 4, y1, x + 4, y1, 'dim'), line(x - 4, y2, x + 4, y2, 'dim'), t);
}

// Dimension line along the bottom (beams and bars, as the Excel FBD): ticks at the nodes, the length
// of each piece, and the node tags N# on the line.
function chainDim(svg, xs, X, y, lu, lay) {
  const pos = [...new Set(xs.map((x) => Number(x.toPrecision(12))))].sort((a, b) => a - b);
  if (pos.length < 2) return;
  const kids = [line(X(pos[0]), y, X(pos[pos.length - 1]), y, 'dim')];
  pos.forEach((x) => kids.push(line(X(x), y - 6, X(x), y + 6, 'dim')));
  for (let k = 0; k + 1 < pos.length; k++) {
    const a = X(pos[k]), b = X(pos[k + 1]), str = fmt(pos[k + 1] - pos[k]) + lu, w = str.length * 6.6;
    if (w <= b - a - 26) kids.push(text((a + b) / 2, y - 6, str, 'middle'));
    else if (w <= b - a + 8) kids.push(text((a + b) / 2, y + 20, str, 'middle'));
  }
  lay.boxes.push([X(pos[0]) - 10, y - 18, X(pos[pos.length - 1]) - X(pos[0]) + 20, 30]);
  svg.add(g('dimg', kids));
}

export function drawModel(result, o, state, kind) {
  const D = (result && result.diagram) || {};
  const svg = canvas(W, H, 'Model of the ' + kind + ' with its supports and loads', o);
  svg.classList.add('mxc', 'mxc-' + kind);
  const sys = o.sys, lu = D.units === 'consistent' ? '' : ' ' + unitLabel('length_m', sys);
  const L = layoutOf(kind, D, state), { X, Y, k, joints, J, members, lo } = L;
  svg.__mx = { X, Y, k, inv: L.inv, joints, members, lf: L.lf, ext: L.ext };
  const lay = { boxes: [], mem: [] };
  const { label } = labeller(lay, W, H);
  const line1 = isLine(kind);
  // ---- title (Excel wording)
  const ttl = titleText(kind, D, sys);
  svg.add(text(10, 17, ttl, 'start', 'mx-ttl'));
  lay.boxes.push([6, 6, ttl.length * 5.9 + 8, 15]);
  // ---- grid while adding
  const grid = state.grid || 1, { x0, x1, y0, y1 } = L.ext;
  if ((state.tool === 'joint' || state.tool === 'member') && grid > 0) {
    const nx = (x1 - x0) / grid, ny = (y1 - y0) / grid;
    if (nx < 160 && ny < 160) {
      const gl = [];
      for (let x = Math.ceil(x0 / grid) * grid; x <= x1 + 1e-9; x += grid) gl.push(line(X(x), Y(y1), X(x), Y(y0), 'mx-grid'));
      if (!line1) for (let y = Math.ceil(y0 / grid) * grid; y <= y1 + 1e-9; y += grid) gl.push(line(X(x0), Y(y), X(x1), Y(y), 'mx-grid'));
      svg.add(g('mx-gridg', gl));
    }
  }
  if (!joints.length) { svg.add(text(W / 2, H / 2, state.tool === 'joint' ? 'Click to place the first joint.' : 'Add joints in the table or with Add joint.', 'middle', 'mx-hint')); return svg; }
  const solved = !!(result && result.ok && D.res);
  const pass = solved && result.verdict && result.verdict.pass;
  const R = solved ? new Map(D.res.map((m) => [m.id, m])) : new Map();
  // ---- dimensions
  const dims = o.show.dim !== false && joints.length > 1;
  if (dims) {
    const jx0 = Math.min(...joints.map((j) => j.X)), jx1 = Math.max(...joints.map((j) => j.X)), jy0 = Math.min(...joints.map((j) => j.Y)), jy1 = Math.max(...joints.map((j) => j.Y));
    if (line1) chainDim(svg, joints.map((j) => j.X), X, H - 34, lu, lay);
    else {
      if (jx1 > jx0) svg.add(dimH(X(jx0), X(jx1), H - 22, fmt(jx1 - jx0) + lu));
      // the height: a band at the far left, clear of the members, loads and reactions
      if (jy1 > jy0) { svg.add(dimVrot(24, Y(jy1), Y(jy0), fmt(jy1 - jy0) + lu)); lay.minX = 34; }
    }
  }
  // joints and support symbols keep labels clear of them
  joints.forEach((j) => { lay.boxes.push([X(j.X) - 10, Y(j.Y) - 10, 20, 20]); if (j.support && j.support !== 'free') lay.boxes.push([X(j.X) - 18, Y(j.Y), 36, 24]); });
  // ---- members (a solved truss: tension blue, compression red, zero force grey)
  const nMax = solved && kind === 'truss' ? Math.max(...D.res.map((m) => Math.abs(m.N || 0))) : 0;
  const tc = (m) => { const r = R.get(m.id); if (!r || kind !== 'truss') return null; return Math.abs(r.N) <= 1e-6 * nMax ? 'zero' : r.N > 0 ? 'T' : 'C'; };
  const memG = [];
  members.forEach((m) => {
    const a = J.get(m.i), b = J.get(m.j), st = tc(m);
    const cls = 'mx-mem' + (line1 ? ' mx-thick' : '') + (st === 'T' ? ' mx-ten' : st === 'C' ? ' mx-com' : st === 'zero' ? ' mx-zero' : '');
    const dl = lo(m.id);
    if (state.sel && state.sel.type === 'member' && state.sel.id === m.id) memG.push(line(X(a.X), Y(a.Y) + dl, X(b.X), Y(b.Y) + dl, 'mx-selm'));
    memG.push(line(X(a.X), Y(a.Y) + dl, X(b.X), Y(b.Y) + dl, cls));
    if (dl) memG.push(line(X(a.X), Y(a.Y), X(a.X), Y(a.Y) + dl, 'mx-mem'), line(X(b.X), Y(b.Y), X(b.X), Y(b.Y) + dl, 'mx-mem'));
    // the member line keeps labels off it (sampled boxes)
    const n = Math.max(1, Math.round(Math.hypot(X(b.X) - X(a.X), Y(b.Y) - Y(a.Y)) / 14));
    for (let q = 1; q < n; q++) { const px = X(a.X) + (X(b.X) - X(a.X)) * q / n, py = Y(a.Y) + (Y(b.Y) - Y(a.Y)) * q / n + dl; lay.mem.push([px - 3, py - 3, 6, 6]); }
  });
  svg.add(g('mx-members', memG));
  // ---- hinges (member end releases)
  members.forEach((m) => {
    const rel = m.release || 'none';
    if (rel === 'none') return;
    const a = J.get(m.i), b = J.get(m.j), dx = X(b.X) - X(a.X), dy = Y(b.Y) - Y(a.Y), Ln = Math.hypot(dx, dy) || 1;
    if (rel === 'i' || rel === 'both') svg.add(circle(X(a.X) + dx / Ln * 11, Y(a.Y) + dy / Ln * 11, 5, 'mx-hinge'));
    if (rel === 'j' || rel === 'both') svg.add(circle(X(b.X) - dx / Ln * 11, Y(b.Y) - dy / Ln * 11, 5, 'mx-hinge'));
  });
  // ---- supports
  joints.forEach((j) => {
    const sp = supportOf(kind, j, J);
    if (sp) svg.add(supportEl(sp[0], X(j.X), Y(j.Y), sp[1], { title: (kind === 'bar' ? 'Node ' : 'Joint ') + j.id }));
    if (D.clamps && D.clamps.includes(j.id)) svg.add(supportEl('clamp', X(j.X), Y(j.Y) - 14, 0, { title: 'Imaginary clamp at joint ' + j.id }));
  });
  // ---- element tags of beams and bars: below the beam at mid-length (Excel FBD)
  if (line1) members.forEach((m) => {
    const a = J.get(m.i), b = J.get(m.j), mx = (X(a.X) + X(b.X)) / 2, my = Y(0) + lo(m.id) + (lo(m.id) < 0 ? -16 : 16);
    const str = kind === 'bar' ? '[' + m.id + ']' : 'E' + m.id;
    svg.add(tagEl(mx, my, str, 'mx-etag'));
    lay.boxes.push([mx - tagW(str) / 2, my - 8, tagW(str), 16]);
  });
  // ---- member loads (true direction), joint loads, reactions and support movements
  if (o.show.loads !== false) {
    drawMemberLoads(svg, { D, J, X, Y, k, label, o, members, lo, lay });
    joints.forEach((j) => {
      const fx = j.FX || 0, fy = j.FY || 0, mz = j.M || 0, x = X(j.X), y = Y(j.Y);
      if (fx && kind === 'bar') { const d = Math.sign(fx), yy = y - 30; svg.add(arrowEl(x - d * 44, yy, x - d * 4, yy, 'mx-pt'), line(x, yy, x, y - 9, 'mx-lead')); const el = label(x - d * 46, yy - 6, fmtForce(Math.abs(fx), D, o), 'mx-ptx', d > 0 ? 'end' : 'start', true); if (el) svg.add(el); }
      else if (fx) { const d = Math.sign(fx); svg.add(arrowEl(x - d * 44, y, x - d * 8, y, 'mx-pt')); lay.boxes.push([Math.min(x, x - d * 44), y - 4, 44, 8]); const el = label(x - d * 46, y - 6, fmtForce(Math.abs(fx), D, o), 'mx-ptx', d > 0 ? 'end' : 'start', true); if (el) svg.add(el); }
      if (fy) { const d = Math.sign(fy); svg.add(arrowEl(x, y + d * 44, x, y + d * 8, 'mx-pt')); lay.boxes.push([x - 4, Math.min(y, y + d * 44), 8, 44]); const el = label(x + 6, y + d * 40 + (d > 0 ? 8 : 0), fmtForce(Math.abs(fy), D, o), 'mx-ptx', 'start', true); if (el) svg.add(el); }
      if (mz) { svg.add(momentEl(x, y, 17, mz > 0, 'mx-mo')); const el = label(x + 18, y - 18, fmtMoment(Math.abs(mz), D, o), 'mx-motx', 'start', true); if (el) svg.add(el); }
    });
  }
  if (solved && o.show.reactions !== false) drawReactions(svg, D, J, X, Y, label, o, kind);
  if (solved) drawMovements(svg, D, J, X, Y, label, o, kind);
  // ---- truss: element tag E# with the state word along the member (Excel); frame: M# beside the member
  if (kind === 'truss') members.forEach((m) => trussTag(svg, m, J.get(m.i), J.get(m.j), X, Y, tc(m), lay));
  if (kind === 'frame') members.forEach((m) => {
    const a = J.get(m.i), b = J.get(m.j), dx = X(b.X) - X(a.X), dy = Y(b.Y) - Y(a.Y), Ln = Math.hypot(dx, dy) || 1, nx = -dy / Ln, ny = dx / Ln;
    const str = 'M' + m.id;
    for (const t of [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8]) {
      let el = null;
      for (const sd of [1, -1]) { el = label(X(a.X) + dx * t + nx * 14 * sd, Y(a.Y) + dy * t + ny * 14 * sd + 4, str, 'mx-mlab', 'middle'); if (el) break; }
      if (el) { svg.add(el); break; }
    }
  });
  // ---- joints: navy node tags (beams and bars: small dots, the tags sit on the dimension line)
  joints.forEach((j) => {
    const on = state.sel && state.sel.type === 'joint' && state.sel.id === j.id, pend = state.pending === j.id;
    const x = X(j.X), y = Y(j.Y), str = 'N' + j.id;
    if (line1) {
      svg.add(circle(x, y, on || pend ? 7 : 3.2, 'mx-jdot' + (on || pend ? ' mx-jton' : '')));
      if (dims) svg.add(tagEl(x, H - 34, str, 'mx-ntag'));
      else svg.add(tagEl(x, y - 16, str, 'mx-ntag'));
    } else {
      if (on || pend) svg.add(circle(x, y, 13, 'mx-jring'));
      svg.add(g('mx-jg', tagEl(x, y, str, 'mx-ntag')));
    }
  });
  // ---- validation marks and the mechanism
  const marks = D.marks || { joints: [], members: [] };
  marks.joints.forEach((id) => { const j = J.get(id); if (j) svg.add(circle(X(j.X), Y(j.Y), 14, 'mx-bad')); });
  marks.members.forEach((id) => { const m = members.find((x) => x.id === id); if (!m) return; const a = J.get(m.i), b = J.get(m.j); svg.add(circle((X(a.X) + X(b.X)) / 2, (Y(a.Y) + Y(b.Y)) / 2, 13, 'mx-bad')); });
  if (D.unstable) { const j = J.get(D.unstable.joint); if (j) svg.add(text(X(j.X) + 16, Y(j.Y) - 14, 'mechanism at ' + D.unstable.name, 'start', 'mx-badtx')); }
  if (solved && !pass) svg.add(text(W / 2, 36, 'An equilibrium check failed: check the inputs.', 'middle', 'mx-badtx'));
  return svg;
}

// Truss element tag: "E#" in a dark box and the state word (tension, compression, zero force; T, C, 0
// when the member is short), turned along the member and slid along it to a free spot (Excel).
function trussTag(svg, m, a, b, X, Y, st, lay) {
  const ax = X(a.X), ay = Y(a.Y), bx = X(b.X), by = Y(b.Y), Ls = Math.hypot(bx - ax, by - ay);
  if (!(Ls > 0)) return;
  let ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
  const tag = 'E' + m.id, long = st === 'T' ? 'tension' : st === 'C' ? 'compression' : st === 'zero' ? 'zero force' : '';
  const word = long && tagW(tag) + long.length * 6.2 + 30 <= Ls ? long : long ? { T: 'T', C: 'C', zero: '0' }[st] : '';
  const wTag = tagW(tag), wWord = word ? word.length * 6.2 + 6 : 0, wAll = wTag + wWord;
  const rad = ang * Math.PI / 180, ca = Math.cos(rad), sa = Math.sin(rad);
  const box = (cx, cy) => { const hw = Math.abs(ca) * wAll / 2 + Math.abs(sa) * 8, hh = Math.abs(sa) * wAll / 2 + Math.abs(ca) * 8; return [cx - hw, cy - hh, 2 * hw, 2 * hh]; };
  let pick = null;
  for (const t of [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8]) {
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, bb = box(cx, cy);
    // the tag sits on its member, so only labels, loads and other tags count (not lay.mem)
    if (!lay.boxes.some((q) => bb[0] < q[0] + q[2] && bb[0] + bb[2] > q[0] && bb[1] < q[1] + q[3] && bb[1] + bb[3] > q[1])) { pick = [cx, cy, bb]; break; }
  }
  if (!pick) { const cx = (ax + bx) / 2, cy = (ay + by) / 2; pick = [cx, cy, box(cx, cy)]; }
  const kids = [rect(-wAll / 2, -7.5, wTag, 15, 'mx-tagbox'), text(-wAll / 2 + wTag / 2, 3.8, tag, 'middle', 'mx-tagtx')];
  if (word) kids.push(rect(-wAll / 2 + wTag, -7.5, wWord, 15, 'mx-wordbox'), text(-wAll / 2 + wTag + 3, 3.8, word, 'start', 'mx-word mx-' + st));
  const el = g('mx-etag mx-ttag', kids);
  el.setAttribute('transform', 'translate(' + pick[0].toFixed(1) + ',' + pick[1].toFixed(1) + ') rotate(' + ang.toFixed(2) + ')');
  svg.add(el);
  lay.boxes.push(pick[2]);
}

export function fmtForce(x, D, o) { return D.units === 'consistent' ? fmt(x) : o.fq(x, 'force'); }
export function fmtMoment(x, D, o) { return D.units === 'consistent' ? fmt(x) : o.fq(x, 'moment'); }
export function fmtDisp(x, D, o) { return D.units === 'consistent' ? fmt(x) : o.fq(x * 1000, 'disp'); }

// Reactions in green with their names: "Fh1 = 15 kN", "M1 = 26.4 kN·m" (absolute value; the arrow
// or the arc shows the direction), "Fn3 = …" normal to an inclined surface.
function drawReactions(svg, D, J, X, Y, label, o, kind) {
  (D.reactions || []).forEach((r) => {
    const j = J.get(r.joint);
    if (!j || !r.value || r.clamp) return;
    const x = X(j.X), y = Y(j.Y), d = Math.sign(r.value);
    const nm = r.name + ' = ';
    let el = null;
    if (/^Fh\d/.test(r.name) && !r.incl) { svg.add(arrowEl(x - d * 70, y + 10, x - d * 26, y + 10, 'mx-rx')); el = label(x - d * 24, y + 38, nm + fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', d > 0 ? 'end' : 'start', true); }
    else if ((/^Fv\d/.test(r.name) || /^F\d/.test(r.name)) && !r.incl) {
      if (/^F\d/.test(r.name)) { svg.add(arrowEl(x - d * 70, y + 30, x - d * 26, y + 30, 'mx-rx')); el = label(x - d * 48, y + 46, nm + fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', 'middle', true); }
      else {
        svg.add(arrowEl(x, y + d * 74, x, y + d * 30, 'mx-rx'));
        const str = nm + fmtForce(Math.abs(r.value), D, o), right = x + 6 + str.length * 6.6 + 4 <= W - 3;
        el = label(right ? x + 6 : x - 6, y + (d > 0 ? 70 : -60), str, 'mx-rxtx', right ? 'start' : 'end', true);
      }
    } else if (r.normal) {
      const inc = (D.incl || []).find((q) => q.id === r.joint), th = (inc ? inc.angle : 0) * Math.PI / 180;
      const nx = -Math.sin(th) * d, ny = -Math.cos(th) * d;      // screen direction of +n
      svg.add(arrowEl(x - nx * 74, y - ny * 74, x - nx * 30, y - ny * 30, 'mx-rx'));
      el = label(x - nx * 78 + 4, y - ny * 78, nm + fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', 'start', true);
      const a2 = label(x + 22, y + 34, 'incline ' + fmt(inc ? inc.angle : 0) + '°', 'mx-scale', 'start');
      if (a2) svg.add(a2);
    } else if (/^M\d/.test(r.name)) {
      svg.add(momentEl(x, y, 24, r.value > 0, 'mx-rx'));
      const str = nm + fmtMoment(Math.abs(r.value), D, o);
      el = label(x - 28, y - 28, str, 'mx-rxtx', 'end') || label(x + 28, y - 28, str, 'mx-rxtx', 'start') || label(x - 28, y - 28, str, 'mx-rxtx', 'end', true);
    }
    if (el) svg.add(el);
  });
}

// Prescribed support movements next to the support: "Uv2 = −10 mm (settlement)", "D1 = 0.002 rad
// (imposed rotation)" (Excel FBD notes).
function drawMovements(svg, D, J, X, Y, label, o, kind) {
  (D.dofNames || []).forEach((nm, q) => {
    if (!D.held || !D.held[q] || !D.Us || !D.Us[q]) return;
    const j = J.get(D.dofJoint[q]);
    if (!j) return;
    const rot = /^D\d/.test(nm), v = D.Us[q];
    const str = nm + ' = ' + (rot ? fmt(v) + ' rad (imposed rotation)' : fmtDisp(v, D, o) + (kind === 'bar' ? ' (support moved)' : ' (settlement)'));
    for (const [dx, dy, an] of [[0, 46, 'middle'], [22, -22, 'start'], [-22, -22, 'end'], [0, 60, 'middle']]) {
      const el = label(X(j.X) + dx, Y(j.Y) + dy, str, 'mx-movtx', an);
      if (el) { svg.add(el); break; }
    }
  });
}

// Member loads in their true direction (beams and frames). D.loads rows: local item fields (kind
// wy/wx distributed, py/px point, m couple; a, b along the member from b) plus dir = the global
// direction [x, y] of a positive value. Labels as the Excel programs: "|P| kN", "|w1| to |w2| kN/m",
// "(projected)", "|M| kN·m"; the arrows show the direction.
export function drawMemberLoads(svg, c) {
  const { D, J, X, Y, label, o } = c, laneOf = c.lo || (() => 0), lay = c.lay || { boxes: [] };
  const rows = D.loads || [];
  if (!rows.length) return;
  const lf = D.units === 'US' ? 1 / 0.3048 : 1;
  const wmax = Math.max(1e-30, ...rows.filter((r) => r.kind === 'wy' || r.kind === 'wx').flatMap((r) => [Math.abs(r.w1), Math.abs(r.w2)]));
  const mem = new Map((D.members || []).map((m) => [m.id, m]));
  const fw = D.units === 'consistent' ? (x) => fmt(x) : (x) => o.fq(x, 'lineload');
  const num = D.units === 'consistent' ? (x) => fmt(x) : (x) => o.fq(x, 'lineload', false);
  const box = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); lay.boxes.push([Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) - Math.min(...xs) + 4, Math.max(...ys) - Math.min(...ys) + 4]); };
  rows.forEach((r) => {
    const m = mem.get(r.member), a = m && J.get(m.i), b = m && J.get(m.j);
    if (!a || !b) return;
    const L = Math.hypot(b.X - a.X, b.Y - a.Y) / lf, c0 = (b.X - a.X) / lf / L, s0 = (b.Y - a.Y) / lf / L;
    if (!(L > 0)) return;
    // a load along the member is drawn beside it (offset to the member's left side on screen)
    const axialDir = Math.abs(r.dir[0] * c0 + r.dir[1] * s0) > 0.99;
    const dl = laneOf(r.member), off = axialDir ? [-s0 * 14, -c0 * 14 + dl] : [0, dl];
    const at = (x) => [X(a.X + c0 * x * lf) + off[0], Y(a.Y + s0 * x * lf) + off[1]];
    const ds = [r.dir[0], -r.dir[1]];                     // screen direction of a positive value
    if (r.kind === 'wy' || r.kind === 'wx') {
      const [ax, ay] = at(r.a), [bx, by] = at(r.b), len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(2, Math.min(24, Math.round(len / 16)));
      const tails = [], heads = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, w = r.w1 + (r.w2 - r.w1) * t, l = 8 + 24 * Math.abs(w) / wmax, sg = w >= 0 ? 1 : -1;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        // the arrow points along the load; its tail sits on the side the load comes from
        const tx = px - ds[0] * sg * l, ty = py - ds[1] * sg * l;
        tails.push([tx, ty]); heads.push([px, py]);
        if (Math.abs(w) > 1e-12 * wmax) svg.add(arrowEl(tx, ty, px - ds[0] * sg * 2, py - ds[1] * sg * 2, 'mx-ds', 5));
      }
      svg.add(pline(tails, 'mx-dsl'));
      box(tails.concat(heads));
      const same = Math.abs(r.w2 - r.w1) <= 1e-9 * wmax;
      const str = (same ? fw(Math.abs(r.w1)) : num(Math.abs(r.w1)) + ' to ' + fw(Math.abs(r.w2))) + (r.per === 'projected' ? ' (projected)' : '');
      // the label beyond the arrow tails, at the middle of the band
      const mid = tails[Math.round(n / 2)], away = [-ds[0], -ds[1]];
      const lx = mid[0] + away[0] * 10, ly = mid[1] + away[1] * 10 + (away[1] > 0.5 ? 10 : away[1] < -0.5 ? -2 : 4);
      const el = label(lx, ly, str, 'mx-dstx', Math.abs(away[0]) > 0.5 ? (away[0] > 0 ? 'start' : 'end') : 'middle')
        || label(tails[0][0], tails[0][1] - 6, str, 'mx-dstx', 'middle', true);
      if (el) svg.add(el);
    } else if (r.kind === 'py' || r.kind === 'px') {
      const [px, py] = at(r.a), sg = r.P >= 0 ? 1 : -1, tx = px - ds[0] * sg * 44, ty = py - ds[1] * sg * 44;
      svg.add(arrowEl(tx, ty, px - ds[0] * sg * 3, py - ds[1] * sg * 3, 'mx-pt'));
      box([[tx, ty], [px, py]]);
      const el = label(px - ds[0] * sg * 46 + 4, py - ds[1] * sg * 46 + (ds[1] * sg > 0.5 ? -2 : 4), fmtForce(Math.abs(r.P), D, o), 'mx-ptx', 'start', true);
      if (el) svg.add(el);
    } else if (r.kind === 'strain') {
      // above the element (below it for the lower lane of parallel elements), clear of its tag
      const mx = (X(a.X) + X(b.X)) / 2, my = (Y(a.Y) + Y(b.Y)) / 2 + dl, parts = [];
      if (r.dT) parts.push('ΔT = ' + fmt(r.dT) + '°');
      if (r.e0) parts.push('e0 = ' + (D.units === 'consistent' ? fmt(r.e0) : o.fq(r.e0 * 1000, 'disp')));
      const el = label(mx, dl > 0 ? my + 36 : my - 22, parts.join(', '), 'mx-motx', 'middle');
      if (el) svg.add(el);
    } else if (r.kind === 'm') {
      const [px, py] = at(r.a);
      svg.add(momentEl(px, py, 14, r.M > 0, 'mx-mo'));
      lay.boxes.push([px - 16, py - 16, 32, 32]);
      const el = label(px + 14, py - 16, fmtMoment(Math.abs(r.M), D, o), 'mx-motx', 'start', true);
      if (el) svg.add(el);
    }
  });
}

// ---------------------------------------------------------------- toolbar and input on the drawing
// cfg: { kind, state, jointsKey, membersKey, newJoint(rows, x, y), newMember(rows, i, j), removeJoint(id, ctx) }
export function interactive(svg, ctx, cfg) {
  const st = cfg.state, kind = cfg.kind;
  const lu = unitLabel('length_m', ctx.sys);
  const cons = ctx.vals.units === 'consistent';
  if (!st.grid) st.grid = 1;
  const btn = (tool, label, title) => h('button', { type: 'button', class: st.tool === tool ? 'on' : '', 'aria-pressed': String(st.tool === tool), title,
    onClick: () => { st.tool = tool; st.pending = null; if (tool === 'select') st.lock = null; ctx.refresh(); } }, label);
  const tools = cfg.canEdit === false ? [btn('select', 'Select', 'Click a joint or member to find it in the tables')]
    : [btn('select', 'Select', 'Click a joint or member to find it in the tables; Delete removes it'), btn('joint', 'Add joint', 'Click to place a joint on the grid (hold Alt for no snap)'), btn('member', 'Add member', 'Click a joint, then another')];
  const bar = h('div', { class: 'row mx-tools' },
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Drawing tools' }, tools),
    h('button', { type: 'button', class: 'btn', title: 'Fit the drawing to the structure', onClick: () => { st.lock = null; ctx.refresh(); } }, 'Fit'),
    cfg.canEdit === false ? null : h('label', { class: 'mx-gridf' }, 'Grid ', h('input', { type: 'number', step: 'any', min: '0', value: String(st.grid), 'aria-label': 'Grid spacing',
      onChange: (e) => { const v = Number(e.target.value); if (v > 0) { st.grid = v; ctx.refresh(); } } }), cons ? '' : ' ' + lu));
  if (st.pending != null) bar.appendChild(h('span', { class: 'muted small' }, 'Joint ' + st.pending + ' picked: click the other end.'));
  if (!svg || !svg.__mx) return bar;
  const mp = svg.__mx;
  svg.setAttribute('tabindex', '0');
  svg.classList.add('mx-' + st.tool);
  if (st.focus) { st.focus = false; setTimeout(() => { if (svg.isConnected) svg.focus({ preventScroll: true }); }, 0); }
  const toWorld = (e) => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    return { sx: p.x, sy: p.y, w: mp.inv(p.x, p.y) };
  };
  const hitJoint = (sx, sy) => { let best = null, bd = 13; mp.joints.forEach((j) => { const d = Math.hypot(mp.X(j.X) - sx, mp.Y(j.Y) - sy); if (d < bd) { bd = d; best = j; } }); return best; };
  const hitMember = (sx, sy) => {
    let best = null, bd = 8;
    mp.members.forEach((m) => {
      const a = mp.joints.find((j) => j.id === m.i), b = mp.joints.find((j) => j.id === m.j);
      if (!a || !b) return;
      const ax = mp.X(a.X), ay = mp.Y(a.Y), bx = mp.X(b.X), by = mp.Y(b.Y), L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((sx - ax) * (bx - ax) + (sy - ay) * (by - ay)) / L2));
      const d = Math.hypot(ax + t * (bx - ax) - sx, ay + t * (by - ay) - sy);
      if (d < bd) { bd = d; best = m; }
    });
    return best;
  };
  svg.addEventListener('click', (e) => {
    const { sx, sy, w } = toWorld(e);
    const rowsJ = ctx.vals[cfg.jointsKey] || [], rowsM = ctx.vals[cfg.membersKey] || [];
    if (st.tool === 'joint') {
      const hit = hitJoint(sx, sy);
      if (hit) { select(ctx, cfg, { type: 'joint', id: hit.id }); return; }
      const gr = st.grid || 1, snap = (x) => (e.altKey ? Number(x.toPrecision(6)) : Math.round(x / gr) * gr);
      const x = Number(snap(w[0]).toPrecision(12)), y = kind === 'beam' || kind === 'bar' ? 0 : Number(snap(w[1]).toPrecision(12));
      if (rowsJ.some((r) => Math.abs(r.x - x) < 1e-9 && (kind === 'beam' || kind === 'bar' || Math.abs(r.y - y) < 1e-9))) return;
      st.lock = Object.assign({}, mp.ext);
      ctx.onChange(cfg.jointsKey, rowsJ.concat([cfg.newJoint(rowsJ, x, y)]), true);
    } else if (st.tool === 'member') {
      const hit = hitJoint(sx, sy);
      if (!hit) return;
      if (st.pending == null || st.pending === hit.id) { st.pending = hit.id; ctx.refresh(); return; }
      const a = st.pending;
      st.pending = null;
      const exists = rowsM.some((r) => (r.i === a && r.j === hit.id) || (r.i === hit.id && r.j === a));
      if (exists) { ctx.refresh(); return; }
      ctx.onChange(cfg.membersKey, rowsM.concat([cfg.newMember(rowsM, a, hit.id)]), true);
    } else {
      if (cfg.noSelect) return;
      const j = hitJoint(sx, sy), m = j ? null : hitMember(sx, sy);
      st.focus = true;
      select(ctx, cfg, j ? { type: 'joint', id: j.id } : m ? { type: 'member', id: m.id } : null);
    }
  });
  svg.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) { e.preventDefault(); removeSelected(ctx, cfg); }
    if (e.key === 'Escape') { st.pending = null; st.sel = null; ctx.refresh(); }
  });
  return bar;
}

function select(ctx, cfg, sel) {
  const st = cfg.state;
  st.sel = sel;
  if (!sel) { ctx.refresh(); return; }
  const key = sel.type === 'joint' ? cfg.jointsKey : cfg.membersKey;
  const rows = ctx.vals[key] || [];
  const idx = sel.type === 'joint' ? rows.findIndex((r, i) => (typeof r.id === 'number' ? r.id : i + 1) === sel.id) : sel.id - 1;
  const tr = document.querySelector('tr[data-list="' + key + '"][data-row="' + idx + '"]');
  document.querySelectorAll('tr.selrow').forEach((x) => x.classList.remove('selrow'));
  if (tr) { tr.classList.add('selrow'); tr.scrollIntoView({ block: 'nearest' }); ctx.refresh(); }
  else ctx.goStep(sel.type === 'joint' ? (cfg.jointStep || 'Geometry') : (cfg.memberStep || 'Members'));
}

function removeSelected(ctx, cfg) {
  const st = cfg.state, sel = st.sel;
  if (sel.type === 'joint') {
    const rows = ctx.vals[cfg.jointsKey] || [], idx = rows.findIndex((r, i) => (typeof r.id === 'number' ? r.id : i + 1) === sel.id);
    if (idx < 0) return;
    if (cfg.beforeRemoveJoint && cfg.beforeRemoveJoint(idx, rows, ctx.onChange) === false) return;
    st.sel = null;
    ctx.onChange(cfg.jointsKey, rows.filter((x, i) => i !== idx), true);
  } else {
    const rows = ctx.vals[cfg.membersKey] || [];
    if (!(sel.id >= 1 && sel.id <= rows.length)) return;
    st.sel = null;
    ctx.onChange(cfg.membersKey, rows.filter((x, i) => i !== sel.id - 1), true);
  }
}

