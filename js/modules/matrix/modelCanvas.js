// UI: the model drawing shared by the Matrix Analysis calculators (hand-off 7.3): the structure to
// scale with joints, members, supports, loads, reactions, hinges and dimensions; the result views
// (deflected shape, axial force, shear, moment); and input on the drawing (add joints and members,
// select, delete). Every edit goes through the workspace's onChange, so the tables stay the source.
import { h, s } from '../../ui/dom.js';
import { canvas, line, circle, poly, pline, text, rect, g, dimH, dimV } from '../../ui/drawing.js';
import { fmt } from '../../core/format.js';
import { unitLabel } from '../../core/units.js';

const W = 640, H = 430;
const VIEWS = {
  truss: [['model', 'Model'], ['deflected', 'Deflected shape'], ['forces', 'Member forces']],
  beam: [['model', 'Model'], ['deflected', 'Deflected shape'], ['V', 'Shear V'], ['M', 'Moment M']],
  frame: [['model', 'Model'], ['deflected', 'Deflected shape'], ['N', 'Axial N'], ['V', 'Shear V'], ['M', 'Moment M']],
  bar: [['model', 'Model'], ['u', 'Displacement u'], ['N', 'Axial N']]
};
export const newCanvasState = (kind) => ({ kind, tool: 'select', grid: null, view: 'model', mside: kind === 'beam' ? 'tension' : 'tension', sel: null, pending: null, lock: null });

const finiteJ = (kind, j) => isFinite(j.x) && (kind === 'beam' || kind === 'bar' || isFinite(j.y));
const nice = (x) => { const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; };

function arrowEl(x1, y1, x2, y2, cls, head = 7) {
  const a = Math.atan2(y2 - y1, x2 - x1), w = 0.45;
  return g(cls, line(x1, y1, x2, y2, 'mx-al'), poly([[x2, y2], [x2 - head * Math.cos(a - w), y2 - head * Math.sin(a - w)], [x2 - head * Math.cos(a + w), y2 - head * Math.sin(a + w)]], 'mx-ah'));
}
// Moment arc around (x, y), arrowhead at the end: counterclockwise as seen when positive.
// (Screen y runs down, so a visually counterclockwise sweep has a decreasing screen angle.)
function momentEl(x, y, r, ccw, cls) {
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
function supportEl(type, x, y, rot, opts) {
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
function supportOf(kind, j, members, J) {
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
    const xs = [...J.values()].map((q) => q.x), left = j.x <= Math.min(...xs) + 1e-12, right = j.x >= Math.max(...xs) - 1e-12;
    if (t === 'pin') return ['pin', 0];
    if (t === 'fixed') return ['fixed', left ? 90 : right ? -90 : 0];
    if (t === 'guided') return ['guided', left ? 90 : right ? -90 : 0];
  }
  return null;
}

export function drawModel(result, o, state, kind, extra) {
  const D = (result && result.diagram) || {};
  const svg = canvas(W, H, 'Model of the ' + kind + ' with its supports and loads', o);
  svg.classList.add('mxc');
  const units = D.units || 'SI', sys = o.sys, lf = units === 'US' ? 1 / 0.3048 : 1;
  const lu = units === 'consistent' ? '' : ' ' + unitLabel('length_m', sys);
  const joints = (D.joints || []).filter((j) => finiteJ(kind, j)).map((j) => Object.assign({}, j, { X: j.x * lf, Y: (j.y || 0) * lf }));
  const J = new Map(joints.map((j) => [j.id, j]));
  const members = (D.members || []).filter((m) => J.has(m.i) && J.has(m.j) && m.i !== m.j);
  // parallel bar elements between the same two nodes are drawn in lanes (screen offset in px)
  const lane = new Map();
  if (kind === 'bar') {
    const groups = new Map();
    members.forEach((m) => { const key = Math.min(m.i, m.j) + '-' + Math.max(m.i, m.j); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m.id); });
    groups.forEach((ids) => ids.forEach((id, k) => lane.set(id, (k - (ids.length - 1) / 2) * 18)));
  }
  const lo = (id) => lane.get(id) || 0;
  // ---- extents
  let x0 = Math.min(...joints.map((j) => j.X)), x1 = Math.max(...joints.map((j) => j.X));
  let y0 = Math.min(...joints.map((j) => j.Y)), y1 = Math.max(...joints.map((j) => j.Y));
  if (!joints.length) { x0 = 0; x1 = 10; y0 = 0; y1 = 6; }
  const span = Math.max(x1 - x0, y1 - y0, 1e-9);
  if (kind === 'beam' || kind === 'bar') { y0 = -0.18 * span; y1 = 0.18 * span; }
  if (x1 - x0 < 0.25 * span) { const c = (x0 + x1) / 2; x0 = c - 0.125 * span; x1 = c + 0.125 * span; }
  if (y1 - y0 < 0.25 * span) { const c = (y0 + y1) / 2; y0 = c - 0.125 * span; y1 = c + 0.125 * span; }
  const grid = state.grid || 1;
  if (state.tool === 'joint' || state.tool === 'member') {
    const pad = Math.max(2 * grid, 0.15 * span);
    x0 -= pad; x1 += pad; if (kind !== 'beam' && kind !== 'bar') { y0 -= pad; y1 += pad; }
  }
  if (state.lock) ({ x0, x1, y0, y1 } = state.lock);
  const bx = 84, by = 46, bw = W - 154, bh = H - 120;
  const k = Math.min(bw / (x1 - x0), bh / (y1 - y0));
  const ox = bx + (bw - (x1 - x0) * k) / 2, oy = by + (bh - (y1 - y0) * k) / 2;
  const X = (x) => ox + (x - x0) * k, Y = (y) => oy + (y1 - y) * k;
  svg.__mx = { X, Y, k, inv: (sx, sy) => [x0 + (sx - ox) / k, y1 - (sy - oy) / k], joints, members, lf, ext: { x0, x1, y0, y1 } };
  const lay = { boxes: [] };
  const free = (bx0, by0, w, hh) => !lay.boxes.some((b) => bx0 < b[0] + b[2] && bx0 + w > b[0] && by0 < b[1] + b[3] && by0 + hh > b[1]);
  const label = (x, y, str, cls, anchor, force) => {
    const w = str.length * 6.6 + 4, hh = 13;
    let lx = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    // keep the label inside the canvas
    const shift = lx < 3 ? 3 - lx : lx + w > W - 3 ? W - 3 - (lx + w) : 0;
    lx += shift; x += shift;
    y = Math.max(12, Math.min(H - 4, y));
    if (!force && !free(lx, y - 10, w, hh)) return null;
    lay.boxes.push([lx, y - 10, w, hh]);
    return text(x, y, str, anchor || 'start', cls);
  };
  // ---- grid while adding
  if ((state.tool === 'joint' || state.tool === 'member') && grid > 0) {
    const nx = (x1 - x0) / grid, ny = (y1 - y0) / grid;
    if (nx < 160 && ny < 160) {
      const gl = [];
      for (let x = Math.ceil(x0 / grid) * grid; x <= x1 + 1e-9; x += grid) gl.push(line(X(x), Y(y1), X(x), Y(y0), 'mx-grid'));
      if (kind !== 'beam' && kind !== 'bar') for (let y = Math.ceil(y0 / grid) * grid; y <= y1 + 1e-9; y += grid) gl.push(line(X(x0), Y(y), X(x1), Y(y), 'mx-grid'));
      svg.add(g('mx-gridg', gl));
    }
  }
  if (!joints.length) { svg.add(text(W / 2, H / 2, state.tool === 'joint' ? 'Click to place the first joint.' : 'Add joints in the table or with Add joint.', 'middle', 'mx-hint')); return svg; }
  // ---- dimensions
  if (o.show.dim !== false && joints.length > 1) {
    const jx0 = Math.min(...joints.map((j) => j.X)), jx1 = Math.max(...joints.map((j) => j.X)), jy0 = Math.min(...joints.map((j) => j.Y)), jy1 = Math.max(...joints.map((j) => j.Y));
    if (jx1 > jx0) svg.add(dimH(X(jx0), X(jx1), H - 22, fmt(jx1 - jx0) + lu));
    if (jy1 > jy0 && kind !== 'beam' && kind !== 'bar') {
      const str = fmt(jy1 - jy0) + lu, lw = str.length * 6.6 + 8;
      svg.add(dimV(Math.max(lw + 8, Math.min(X(jx0) - 30, 70)), Y(jy1), Y(jy0), str));
    }
  }
  // joints and support symbols keep labels clear of them
  joints.forEach((j) => { lay.boxes.push([X(j.X) - 10, Y(j.Y) - 10, 20, 20]); if (j.support && j.support !== 'free') lay.boxes.push([X(j.X) - 18, Y(j.Y), 36, 24]); });
  const solved = result && result.ok && D.res;
  const R = solved ? new Map(D.res.map((m) => [m.id, m])) : new Map();
  const view = solved && result.verdict && result.verdict.pass ? state.view : 'model';
  // ---- members
  const nMax = solved && D.res[0].N != null ? Math.max(...D.res.map((m) => Math.abs(m.N || 0))) : 0;
  const memG = [];
  members.forEach((m) => {
    const a = J.get(m.i), b = J.get(m.j);
    let cls = 'mx-mem';
    if (view === 'forces' && R.has(m.id)) { const N = R.get(m.id).N; cls = Math.abs(N) <= 1e-6 * nMax ? 'mx-mem mx-zero' : N > 0 ? 'mx-mem mx-ten' : 'mx-mem mx-com'; }
    if (view === 'deflected' || ['N', 'V', 'M', 'u'].includes(view)) cls = 'mx-mem mx-orig';
    const dl = lo(m.id);
    if (state.sel && state.sel.type === 'member' && state.sel.id === m.id) memG.push(line(X(a.X), Y(a.Y) + dl, X(b.X), Y(b.Y) + dl, 'mx-selm'));
    memG.push(line(X(a.X), Y(a.Y) + dl, X(b.X), Y(b.Y) + dl, cls));
    if (dl) memG.push(line(X(a.X), Y(a.Y), X(a.X), Y(a.Y) + dl, 'mx-mem'), line(X(b.X), Y(b.Y), X(b.X), Y(b.Y) + dl, 'mx-mem'));
  });
  svg.add(g('mx-members', memG));
  // ---- result overlays
  if (solved && view === 'deflected') drawDeflected(svg, D, J, X, Y, lf, k, span);
  if (solved && ['N', 'V', 'M', 'u'].includes(view)) drawDiagram(svg, D, J, X, Y, view, state, label, o, kind, lo);
  // ---- member numbers and hinges (model view)
  if (view === 'model') {
    members.forEach((m) => {
      const a = J.get(m.i), b = J.get(m.j), mx = (X(a.X) + X(b.X)) / 2, my = (Y(a.Y) + Y(b.Y)) / 2 + lo(m.id);
      const str = String(m.id), w = str.length * 7 + 8;
      lay.boxes.push([mx - w / 2, my - 8, w, 16]);
      svg.add(g('mx-mnum', rect(mx - w / 2, my - 8, w, 16, 'mx-mbox'), text(mx, my + 4, str, 'middle', 'mx-mtx')));
    });
  }
  members.forEach((m) => {
    const rel = m.release || 'none';
    if (rel === 'none') return;
    const a = J.get(m.i), b = J.get(m.j), dx = X(b.X) - X(a.X), dy = Y(b.Y) - Y(a.Y), L = Math.hypot(dx, dy) || 1;
    if (rel === 'i' || rel === 'both') svg.add(circle(X(a.X) + dx / L * 11, Y(a.Y) + dy / L * 11, 4.5, 'mx-hinge'));
    if (rel === 'j' || rel === 'both') svg.add(circle(X(b.X) - dx / L * 11, Y(b.Y) - dy / L * 11, 4.5, 'mx-hinge'));
  });
  // ---- supports
  joints.forEach((j) => {
    const sp = supportOf(kind, j, members, J);
    if (sp) svg.add(supportEl(sp[0], X(j.X), Y(j.Y), sp[1], { title: 'Joint ' + j.id }));
    if (D.clamps && D.clamps.includes(j.id)) svg.add(supportEl('clamp', X(j.X), Y(j.Y) - 14, 0, { title: 'Imaginary clamp at joint ' + j.id }));
  });
  // ---- member loads (true direction), joint loads and reactions
  if (o.show.loads !== false && (view === 'model' || view === 'forces')) {
    drawMemberLoads(svg, { D, J, X, Y, k, label, o, members, lo });
    joints.forEach((j) => {
      const fx = j.FX || 0, fy = j.FY || 0, mz = j.M || 0;
      if (fx && kind === 'bar') { const d = Math.sign(fx), yy = Y(j.Y) - 26; svg.add(arrowEl(X(j.X) - d * 40, yy, X(j.X) - d * 4, yy, 'mx-pt'), line(X(j.X), yy, X(j.X), Y(j.Y) - 9, 'mx-lead')); const el = label(X(j.X) - d * 42, yy - 6, fmtForce(Math.abs(fx), D, o), 'mx-ptx', d > 0 ? 'end' : 'start', true); if (el) svg.add(el); }
      else if (fx) { const d = Math.sign(fx); svg.add(arrowEl(X(j.X) - d * 44, Y(j.Y), X(j.X) - d * 8, Y(j.Y), 'mx-pt')); const el = label(X(j.X) - d * 46, Y(j.Y) - 6, fmtForce(Math.abs(fx), D, o), 'mx-ptx', d > 0 ? 'end' : 'start', true); if (el) svg.add(el); }
      if (fy) { const d = Math.sign(fy); svg.add(arrowEl(X(j.X), Y(j.Y) + d * 44, X(j.X), Y(j.Y) + d * 8, 'mx-pt')); const el = label(X(j.X) + 6, Y(j.Y) + d * 40 + (d > 0 ? 8 : 0), fmtForce(Math.abs(fy), D, o), 'mx-ptx', 'start', true); if (el) svg.add(el); }
      if (mz) { svg.add(momentEl(X(j.X), Y(j.Y), 17, mz > 0, 'mx-mo')); const el = label(X(j.X) + 18, Y(j.Y) - 18, fmtMoment(Math.abs(mz), D, o) + (mz > 0 ? ' ccw' : ' cw'), 'mx-motx', 'start', true); if (el) svg.add(el); }
    });
  }
  if (solved && o.show.reactions !== false && (view === 'model' || view === 'forces')) drawReactions(svg, D, J, X, Y, label, o, kind);
  if (solved && view === 'forces') {
    D.res.forEach((m) => {
      const a = J.get(m.i), b = J.get(m.j);
      if (!a || !b) return;
      const st = Math.abs(m.N) <= 1e-6 * nMax ? 'zero' : m.N > 0 ? 'T' : 'C';
      const str = st === 'zero' ? '0' : fmtForce(Math.abs(m.N), D, o) + ' (' + st + ')';
      const dx = X(b.X) - X(a.X), dy = Y(b.Y) - Y(a.Y), L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      for (const t of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        let done = false;
        for (const sd of [1, -1]) {
          const px = X(a.X) + dx * t + nx * 11 * sd, py = Y(a.Y) + dy * t + ny * 11 * sd + 4;
          const el = label(px, py, str, 'mx-ntx mx-' + st, 'middle');
          if (el) { svg.add(el); done = true; break; }
        }
        if (done) break;
      }
    });
  }
  // ---- joints
  joints.forEach((j) => {
    const on = state.sel && state.sel.type === 'joint' && state.sel.id === j.id, pend = state.pending === j.id;
    svg.add(g('mx-jg', circle(X(j.X), Y(j.Y), 8, 'mx-jt' + (on || pend ? ' mx-jton' : '')), text(X(j.X), Y(j.Y) + 3.5, String(j.id), 'middle', 'mx-jtx')));
    lay.boxes.push([X(j.X) - 9, Y(j.Y) - 9, 18, 18]);
  });
  // ---- validation marks and the mechanism
  const marks = D.marks || { joints: [], members: [] };
  marks.joints.forEach((id) => { const j = J.get(id); if (j) svg.add(circle(X(j.X), Y(j.Y), 14, 'mx-bad')); });
  marks.members.forEach((id) => { const m = members.find((x) => x.id === id); if (!m) return; const a = J.get(m.i), b = J.get(m.j); svg.add(circle((X(a.X) + X(b.X)) / 2, (Y(a.Y) + Y(b.Y)) / 2, 13, 'mx-bad')); });
  if (D.unstable) { const j = J.get(D.unstable.joint); if (j) svg.add(text(X(j.X) + 16, Y(j.Y) - 14, 'mechanism at ' + D.unstable.name, 'start', 'mx-badtx')); }
  if (view !== state.view && state.view !== 'model' && result && result.ok && !(result.verdict && result.verdict.pass)) svg.add(text(W / 2, 20, 'The diagrams are not drawn: an equilibrium check failed.', 'middle', 'mx-badtx'));
  return svg;
}

export function fmtForce(x, D, o) { return D.units === 'consistent' ? fmt(x) : o.fq(x, 'force'); }
export function fmtMoment(x, D, o) { return D.units === 'consistent' ? fmt(x) : o.fq(x, 'moment'); }

function drawReactions(svg, D, J, X, Y, label, o, kind) {
  (D.reactions || []).forEach((r) => {
    const j = J.get(r.joint);
    if (!j || !r.value || r.clamp) return;
    const x = X(j.X), y = Y(j.Y), d = Math.sign(r.value);
    let el = null;
    if (/^Fh\d/.test(r.name) && !r.incl) { svg.add(arrowEl(x - d * 70, y + 10, x - d * 26, y + 10, 'mx-rx')); el = label(x - d * 72, y + 24, fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', d > 0 ? 'end' : 'start', true); }
    else if ((/^Fv\d/.test(r.name) || /^F\d/.test(r.name)) && !r.incl) {
      if (/^F\d/.test(r.name)) { svg.add(arrowEl(x - d * 70, y + 30, x - d * 26, y + 30, 'mx-rx')); el = label(x - d * 72, y + 44, fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', d > 0 ? 'end' : 'start', true); }
      else { svg.add(arrowEl(x, y + d * 74, x, y + d * 30, 'mx-rx')); el = label(x + 6, y + (d > 0 ? 70 : -60), fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', 'start', true); }
    } else if (r.normal) {
      const inc = (D.incl || []).find((q) => q.id === r.joint), th = (inc ? inc.angle : 0) * Math.PI / 180;
      const nx = -Math.sin(th) * d, ny = -Math.cos(th) * d;      // screen direction of +n
      svg.add(arrowEl(x - nx * 74, y - ny * 74, x - nx * 30, y - ny * 30, 'mx-rx'));
      el = label(x - nx * 78 + 4, y - ny * 78, 'Fn = ' + fmtForce(Math.abs(r.value), D, o), 'mx-rxtx', 'start', true);
    } else if (/^M\d/.test(r.name)) { svg.add(momentEl(x, y, 24, r.value > 0, 'mx-rx')); el = label(x - 26, y - 26, fmtMoment(Math.abs(r.value), D, o) + (r.value > 0 ? ' ccw' : ' cw'), 'mx-rxtx', 'end', true); }
    if (el) svg.add(el);
  });
}

function drawDeflected(svg, D, J, X, Y, lf, k, span) {
  let dmax = 0;
  D.res.forEach((m) => m.st.dx.forEach((dx, q) => { dmax = Math.max(dmax, Math.hypot(dx, m.st.dy[q])); }));
  if (!(dmax > 0)) { svg.add(text(W / 2, 22, 'No movement: every joint is held.', 'middle', 'mx-hint')); return; }
  const scale = nice(0.1 * span / (dmax * lf));
  D.res.forEach((m) => {
    const a = J.get(m.i);
    if (!a) return;
    const pts = m.st.x.map((x, q) => [X(a.X + (m.c * x + scale * m.st.dx[q]) * lf), Y(a.Y + (m.s * x + scale * m.st.dy[q]) * lf)]);
    svg.add(pline(pts, 'mx-defl'));
  });
  D.ids.forEach((id) => {
    const j = J.get(id), q = D.dofNames.findIndex((nm, kk) => D.dofJoint[kk] === id);
    if (!j) return;
    const ux = D.kind === 'beam' ? 0 : D.U[q], uy = D.kind === 'beam' ? D.U[q] : D.kind === 'bar' ? 0 : D.U[q + 1];
    svg.add(circle(X(j.X + scale * ux * lf), Y(j.Y + scale * uy * lf), 3.5, 'mx-dj'));
  });
  svg.add(text(W - 12, 22, 'Deflections × ' + fmt(scale), 'end', 'mx-scale'));
}

// N, V or M along the members, drawn perpendicular to each member, with end and extreme values.
function drawDiagram(svg, D, J, X, Y, view, state, label, o, kind, lo) {
  const laneOf = lo || (() => 0);
  const key = view;
  let vmax = 0;
  D.res.forEach((m) => m.st[key].forEach((x) => { vmax = Math.max(vmax, Math.abs(x)); }));
  if (!(vmax > 0)) { svg.add(text(W / 2, 22, (view === 'N' ? 'Axial force' : view === 'V' ? 'Shear' : view === 'u' ? 'Displacement' : 'Moment') + ' is zero everywhere.', 'middle', 'mx-hint')); return; }
  const sc = (kind === 'beam' || kind === 'bar' ? 75 : 42) / vmax;
  // the caption first, so value labels keep clear of it
  const cap = label(W - 12, 22, view === 'M' ? 'M drawn on the ' + (state.mside === 'compression' ? 'compression' : 'tension') + ' side' : view === 'N' ? 'N: tension +' : view === 'u' ? 'u: + to the right' : 'V: + left face up', 'mx-scale', 'end', true);
  if (cap) svg.add(cap);
  // sign of the offset along local +y: N and V positive on +y; M on the tension side (sagging + -> −y)
  const flip = view === 'M' ? (state.mside === 'compression' ? 1 : -1) : 1;
  const lbls = [];
  D.res.forEach((m) => {
    const a = J.get(m.i);
    if (!a) return;
    const st = m.st, n = st.x.length - 1;
    const dl = laneOf(m.id);
    const base = (x) => [X(a.X + m.c * x * (D.units === 'US' ? 1 / 0.3048 : 1)), Y(a.Y + m.s * x * (D.units === 'US' ? 1 / 0.3048 : 1)) + dl];
    const nx = -m.s, ny = -m.c;          // screen direction of local +y
    const pt = (q) => { const [bx, by] = base(st.x[q]); const off = flip * st[key][q] * sc; return [bx + nx * off, by + ny * off]; };
    // filled runs of one sign
    let run = [], sgn = 0;
    const flush = () => { if (run.length > 1) { const [b0x, b0y] = base(run[0][0]), [b1x, b1y] = base(run[run.length - 1][0]); svg.add(poly([[b0x, b0y]].concat(run.map((r) => r[1]), [[b1x, b1y]]), sgn > 0 ? 'mx-posf' : 'mx-negf')); } run = []; };
    for (let q = 0; q <= n; q++) {
      const val = st[key][q], sg = val > 0 ? 1 : val < 0 ? -1 : 0;
      if (sg && sgn && sg !== sgn) {
        // zero crossing between q-1 and q
        const v0 = st[key][q - 1], x0 = st.x[q - 1], x1 = st.x[q], xc = x0 + (x1 - x0) * v0 / (v0 - val);
        run.push([xc, base(xc)]); flush(); run.push([xc, base(xc)]);
      }
      if (sg) sgn = sg;
      run.push([st.x[q], pt(q)]);
    }
    flush();
    svg.add(pline(st.x.map((x, q) => pt(q)), 'mx-dline'));
    // labels: extremes first, then the ends
    const ex = st.ext, cand = [];
    if (key === 'M') { cand.push(ex.Mmax, ex.Mmin); } else if (key === 'N') { cand.push(ex.Nmax, ex.Nmin); }
    else if (key === 'u') { let hi = 0, lo2 = 0; st.u.forEach((x, q) => { if (x > st.u[hi]) hi = q; if (x < st.u[lo2]) lo2 = q; }); cand.push({ v: st.u[hi], x: st.x[hi] }, { v: st.u[lo2], x: st.x[lo2] }); }
    else cand.push(ex.Vabs);
    cand.forEach((e) => { if (e && Math.abs(e.v) > 1e-9 * vmax) lbls.push({ p: 2, x: e.x, v: e.v, m, base, nx, ny }); });
    [0, n].forEach((q) => { if (Math.abs(st[key][q]) > 1e-9 * vmax) lbls.push({ p: 1, x: st.x[q], v: st[key][q], m, base, nx, ny }); });
  });
  lbls.sort((p, q) => q.p - p.p).forEach((l) => {
    const [bx, by] = l.base(l.x), off = flip * l.v * sc;
    const tx = bx + l.nx * (off + Math.sign(off || 1) * 10), ty = by + l.ny * (off + Math.sign(off || 1) * 10) + 4;
    const str = key === 'M' ? fmtMoment(l.v, D, o) : key === 'u' ? (D.units === 'consistent' ? fmt(l.v) : o.fq(l.v * 1000, 'disp')) : fmtForce(l.v, D, o);
    const el = label(tx, ty, str.replace('-', '−'), 'mx-dtx', 'middle');
    if (el) svg.add(el);
  });
}

// Member loads in their true direction (beams and frames). D.loads rows: local item fields (kind
// wy/wx distributed, py/px point, m couple; a, b along the member from b) plus dir = the global
// direction [x, y] of a positive value.
export function drawMemberLoads(svg, c) {
  const { D, J, X, Y, label, o } = c, laneOf = c.lo || (() => 0);
  const rows = D.loads || [];
  if (!rows.length) return;
  const lf = D.units === 'US' ? 1 / 0.3048 : 1;
  const wmax = Math.max(1e-30, ...rows.filter((r) => r.kind === 'wy' || r.kind === 'wx').flatMap((r) => [Math.abs(r.w1), Math.abs(r.w2)]));
  const mem = new Map((D.members || []).map((m) => [m.id, m]));
  const cls = D.units === 'consistent' ? (x) => fmt(x) : (x) => o.fq(x, 'lineload');
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
      const tails = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, w = r.w1 + (r.w2 - r.w1) * t, l = 8 + 24 * Math.abs(w) / wmax, sg = w >= 0 ? 1 : -1;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        // the arrow points along the load; its tail sits on the side the load comes from
        const tx = px - ds[0] * sg * l, ty = py - ds[1] * sg * l;
        tails.push([tx, ty]);
        if (Math.abs(w) > 1e-12 * wmax) svg.add(arrowEl(tx, ty, px - ds[0] * sg * 2, py - ds[1] * sg * 2, 'mx-ds', 5));
      }
      svg.add(pline(tails, 'mx-dsl'));
      const e1 = label(tails[0][0], tails[0][1] - 4, cls(Math.abs(r.w1)), 'mx-dstx', 'middle');
      if (e1) svg.add(e1);
      if (Math.abs(r.w2 - r.w1) > 1e-9 * wmax) { const e2 = label(tails[n][0], tails[n][1] - 4, cls(Math.abs(r.w2)), 'mx-dstx', 'middle'); if (e2) svg.add(e2); }
    } else if (r.kind === 'py' || r.kind === 'px') {
      const [px, py] = at(r.a), sg = r.P >= 0 ? 1 : -1;
      svg.add(arrowEl(px - ds[0] * sg * 44, py - ds[1] * sg * 44, px - ds[0] * sg * 3, py - ds[1] * sg * 3, 'mx-pt'));
      const el = label(px - ds[0] * sg * 46 + 4, py - ds[1] * sg * 46, fmtForce(Math.abs(r.P), D, o), 'mx-ptx', 'start');
      if (el) svg.add(el);
    } else if (r.kind === 'strain') {
      // above the element (below it for the lower lane of parallel elements), clear of its number box
      const mx = (X(a.X) + X(b.X)) / 2, my = (Y(a.Y) + Y(b.Y)) / 2 + dl, parts = [];
      if (r.dT) parts.push('ΔT = ' + fmt(r.dT) + '°');
      if (r.e0) parts.push('e0 = ' + (D.units === 'consistent' ? fmt(r.e0) : o.fq(r.e0 * 1000, 'disp')));
      const el = label(mx, dl > 0 ? my + 26 : my - 22, parts.join(', '), 'mx-motx', 'middle');
      if (el) svg.add(el);
    } else if (r.kind === 'm') {
      const [px, py] = at(r.a);
      svg.add(momentEl(px, py, 14, r.M > 0, 'mx-mo'));
      const el = label(px + 14, py - 16, fmtMoment(Math.abs(r.M), D, o) + (r.M > 0 ? ' ccw' : ' cw'), 'mx-motx', 'start');
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
      onChange: (e) => { const v = Number(e.target.value); if (v > 0) { st.grid = v; ctx.refresh(); } } }), cons ? '' : ' ' + lu),
    h('label', { class: 'mx-viewf' }, h('span', { class: 'sr' }, 'Diagram'), h('select', { class: 'sel', 'aria-label': 'Diagram shown', onChange: (e) => { st.view = e.target.value; ctx.refresh(); } },
      VIEWS[kind].map(([v, l]) => h('option', { value: v, selected: st.view === v }, l)))),
    st.view === 'M' ? h('label', { class: 'mx-viewf' }, 'Draw M on: ', h('select', { class: 'sel', 'aria-label': 'Draw M on', onChange: (e) => { st.mside = e.target.value; ctx.refresh(); } },
      [['tension', 'Tension side'], ['compression', 'Compression side']].map(([v, l]) => h('option', { value: v, selected: st.mside === v }, l)))) : null);
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

export { VIEWS };
