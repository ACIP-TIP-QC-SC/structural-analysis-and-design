// UI: the result diagrams of the Matrix Analysis calculators, drawn the way the Excel programs draw
// them (section 7 of the beam and bar tabs, section 6 of the frame tab), stacked one under another:
//   Beams:  elastic curve, shear force diagram (SFD), bending moment diagram (BMD), on the same x scale
//           as the free body diagram (the live drawing), so the four line up.
//   Frames: deflected shape, axial force N, shear force V, bending moment M.
//   Bars:   axial force N, axial displacement u, and the table of diagram values.
//   Truss:  the truss diagram is the live drawing itself (tension, compression, zero force).
import { h } from '../../ui/dom.js';
import { canvas, line, circle, poly, pline, text, g } from '../../ui/drawing.js';
import { fmt, fmtQ } from '../../core/format.js';
import { unitLabel } from '../../core/units.js';
import { W, layoutOf, supportEl, supportOf, labeller, tagEl, arrowEl } from './modelCanvas.js';

const niceDown = (x) => { if (!(x > 0) || !isFinite(x)) return 1; const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; };
const niceUp = (x) => { const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
const minus = (s) => String(s).replace(/^-/, '−');

// Formatting in the display units (calc values are kN and m; Consistent units print as typed).
function fmts(D, sys) {
  const cons = D.units === 'consistent';
  const q = (v, qq, unit = true) => (cons ? fmt(v) : fmtQ(v, qq, sys, unit));
  return {
    cons,
    F: (v, u = true) => minus(q(v, 'force', u)),
    M: (v, u = true) => minus(q(v, 'moment', u)),
    d: (v, u = true) => minus(cons ? fmt(v) : fmtQ(v * 1000, 'disp', sys, u)),       // m -> mm (in)
    L: (v, u = true) => minus(q(v, 'length_m', u)),
    w: (v, u = true) => minus(q(v, 'lineload', u)),
    uF: cons ? '' : unitLabel('force', sys), uM: cons ? '' : unitLabel('moment', sys), ud: cons ? '' : unitLabel('disp', sys), uL: cons ? '' : unitLabel('length_m', sys),
    dFac: cons ? 1 : (sys === 'US' ? 1000 / 25.4 : 1000)                          // m -> display displacement unit
  };
}
const withU = (u) => (u ? ' (' + u + ')' : '');

function panel(title, svg, notes, extra) {
  return h('figure', { class: 'mx-panel' }, h('figcaption', { class: 'mx-ptitle' }, title), extra || null, svg,
    notes && notes.length ? h('ul', { class: 'mx-notes' }, notes.filter(Boolean).map((n) => h('li', null, n))) : null);
}

// ================================================================ beams
// Stations of the whole beam, left to right: [{ x (global, m), v, dv/dx, V, M, m (element) }].
function beamTrace(D) {
  const jx = new Map(D.joints.map((j) => [j.id, j.x]));
  const els = D.res.slice().sort((p, q) => jx.get(p.i) - jx.get(q.i));
  const pts = [];
  els.forEach((m) => {
    const x0 = jx.get(m.i), st = m.st;
    st.x.forEach((x, k) => pts.push({ x: x0 + x, v: st.dy[k], V: st.V[k], M: st.M[k], m: m.id, end: k === 0 ? 'start' : k === st.x.length - 1 ? 'end' : '' }));
  });
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const sameA = a.m === pts[k].m ? a : pts[k], sameB = b.m === pts[k].m ? b : pts[k];
    pts[k].th = sameB.x > sameA.x ? (sameB.v - sameA.v) / (sameB.x - sameA.x) : 0;
  }
  return { pts, els, jx };
}

function beamPanels(r, sys, state, rerender) {
  const D = r.diagram, f = fmts(D, sys), L = layoutOf('beam', D, null), X = (x) => L.X(x * L.lf);
  const { pts, els, jx } = beamTrace(D);
  const xs0 = Math.min(...D.joints.map((j) => j.x)), xs1 = Math.max(...D.joints.map((j) => j.x));
  const nodes = [...new Set(D.joints.map((j) => j.x))];
  const supp = new Map(D.joints.map((j) => [j.id, j.support && j.support !== 'free']));
  const atX = (x) => f.L(x - xs0);
  const out = [];

  // ---- elastic curve
  {
    const Hh = 230, y0 = 112, svg = canvas(W, Hh, 'Elastic curve of the beam', null);
    svg.classList.add('mxd');
    const lay = { boxes: [] }, { label } = labeller(lay, W, Hh);
    const vmax = Math.max(...pts.map((p) => Math.abs(p.v)));
    const N = vmax > 0 ? niceDown(62 / (vmax * L.lf * L.k)) : 1, sy = L.lf * L.k * N;
    nodes.forEach((x) => svg.add(line(X(x), 18, X(x), Hh - 30, 'mx-guide')));
    svg.add(line(X(xs0), y0, X(xs1), y0, 'mx-axis'));
    els.forEach((m) => svg.add(pline(pts.filter((p) => p.m === m.id).map((p) => [X(p.x), y0 - p.v * sy]), 'mx-ecurve')));
    let lo = null, hi = null, th = null;
    pts.forEach((p) => { if (!lo || p.v < lo.v) lo = p; if (!hi || p.v > hi.v) hi = p; if (!th || Math.abs(p.th) > Math.abs(th.th)) th = p; });
    // inflection points: the curvature (M) changes sign
    const infl = [], Mmax = Math.max(1e-300, ...pts.map((p) => Math.abs(p.M)));
    let last = null;
    pts.forEach((p) => {
      if (Math.abs(p.M) <= 1e-6 * Mmax) return;
      if (last && Math.sign(p.M) !== Math.sign(last.M) && p.x > last.x + 1e-9) {
        const xc = last.x + (p.x - last.x) * last.M / (last.M - p.M), vc = last.v + (p.v - last.v) * (xc - last.x) / (p.x - last.x);
        if (xc > xs0 + 1e-6 * (xs1 - xs0) && xc < xs1 - 1e-6 * (xs1 - xs0)) infl.push({ x: xc, v: vc });
      }
      last = p;
    });
    // the largest movement first (red dots), then the node values
    const tol = 1e-9 * Math.max(vmax, 1e-300);
    if (vmax > 0) {
      [[lo, lo.v < -tol], [hi, hi.v > tol]].forEach(([p, ok]) => {
        if (!ok) return;
        svg.add(circle(X(p.x), y0 - p.v * sy, 4, 'mx-maxdot'));
        const up = p.v > 0, el = label(X(p.x), y0 - p.v * sy + (up ? -9 : 17), 'max ' + f.d(p.v) + ' at x = ' + atX(p.x), 'mx-maxtx', 'middle', true);
        if (el) svg.add(el);
      });
    }
    infl.forEach((p) => svg.add(circle(X(p.x), y0 - p.v * sy, 4, 'mx-infl')));
    const nodeV = D.joints.map((j) => { const q = D.dofNames.findIndex((nm, k) => D.dofJoint[k] === j.id && /^Uv/.test(nm)); return { j, v: q >= 0 ? D.U[q] : 0 }; });
    const big = nodeV.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a), nodeV[0]);
    nodeV.forEach(({ j, v }) => {
      const isMax = vmax > 0 && j === big.j && Math.abs(v) > tol, str = (isMax ? 'max ' : '') + f.d(v, false) + (supp.get(j.id) ? ' (support)' : '');
      const yy = y0 - v * sy, down = v < 0;
      const el = label(X(j.x), yy + (down ? 16 : -8), str, isMax ? 'mx-maxtx' : 'mx-vtx', 'middle') || label(X(j.x), yy + (down ? -8 : 16), str, isMax ? 'mx-maxtx' : 'mx-vtx', 'middle');
      if (el) svg.add(el);
      svg.add(tagEl(X(j.x), Hh - 16, 'N' + j.id, 'mx-ntag'));
    });
    const EI1 = f.cons && D.res.every((m) => m.E * m.I === 1);
    out.push(panel('Elastic curve: deflection in ' + (f.ud || 'length units') + ' (positive = up); vertical scale × ' + fmt(N) + ' (exaggerated)', svg, [
      lo && lo.v < -tol ? 'Max deflection down: ' + f.d(lo.v) + ' at x = ' + atX(lo.x) + ' (element ' + lo.m + ').' : 'No downward deflection.',
      hi && hi.v > tol ? 'Max deflection up: +' + f.d(hi.v).replace(/^\+/, '') + ' at x = ' + atX(hi.x) + ' (element ' + hi.m + ').' : 'No upward deflection.',
      th && Math.abs(th.th) > 0 ? 'Max rotation: ' + minus(fmt(th.th)) + ' rad at x = ' + atX(th.x) + '.' : null,
      'Inflection points: ' + (infl.length ? infl.map((p) => 'x = ' + atX(p.x)).join(', ') : 'none') + '.',
      'Vertical scale × ' + fmt(N) + ': deflections are drawn ' + fmt(N) + ' times larger than the lengths.',
      'Deflection: positive = up. Rotation: positive = counterclockwise. x from the left end.',
      EI1 ? 'E × I = 1 was entered: deflections and rotations are EI times too large (divide by the real EI).' : null
    ]));
  }

  // ---- SFD and BMD: charts on the beam's x scale
  const chart = (key, title, cls, side) => {
    const Hh = 220, top = 22, bot = Hh - 34, svg = canvas(W, Hh, title, null);
    svg.classList.add('mxd');
    const lay = { boxes: [] }, { label } = labeller(lay, W, Hh);
    const vals = pts.map((p) => p[key]);
    const extra = key === 'M' ? els.flatMap((m) => [m.st.ext.Mmax, m.st.ext.Mmin].map((e) => e.v)) : [];
    let vmin = Math.min(0, ...vals, ...extra), vmax = Math.max(0, ...vals, ...extra);
    if (!(vmax - vmin > 0)) { vmin = -1; vmax = 1; }
    const step = niceUp((vmax - vmin) / 5), lo = Math.floor(vmin / step - 1e-9) * step, hi = Math.ceil(vmax / step + 1e-9) * step;
    const inv = side === 'tension';                              // tension side: sagging + below the axis
    const Yv = (v) => (inv ? top + (v - lo) / (hi - lo) * (bot - top) : bot - (v - lo) / (hi - lo) * (bot - top));
    for (let v = lo; v <= hi + step * 1e-6; v += step) {
      const vv = Math.abs(v) < step * 1e-9 ? 0 : v;
      svg.add(line(X(xs0), Yv(vv), X(xs1), Yv(vv), vv === 0 ? 'mx-axis' : 'mx-gridl'));
      svg.add(text(X(xs0) - 6, Yv(vv) + 4, minus(fmt(vv)), 'end', 'mx-tick'));
    }
    nodes.forEach((x) => svg.add(line(X(x), top, X(x), bot, 'mx-gridl')));
    svg.add(pline(pts.map((p) => [X(p.x), Yv(p[key])]), cls));
    // node markers and values at the element ends
    const fv = key === 'M' ? (v) => f.M(v, false) : (v) => f.F(v, false);
    const ends = pts.filter((p) => p.end);
    ends.forEach((p) => svg.add(circle(X(p.x), Yv(p[key]), 3.4, 'mx-nmark')));
    // extremes first (forced), then the end values where there is room
    let mx = null, mn = null;
    pts.forEach((p) => { if (!mx || p[key] > mx[key]) mx = p; if (!mn || p[key] < mn[key]) mn = p; });
    if (key === 'M') els.forEach((m) => { const x0 = jx.get(m.i); [m.st.ext.Mmax, m.st.ext.Mmin].forEach((e) => { const p = { x: x0 + e.x, M: e.v, m: m.id }; if (e.v > mx.M) mx = p; if (e.v < mn.M) mn = p; }); });
    const ext = [];
    if (mx[key] > 0) ext.push(mx); if (mn[key] < 0) ext.push(mn);
    ext.forEach((p) => {
      const yy = Yv(p[key]), above = yy < Yv(0);
      const el = label(X(p.x), yy + (above ? -7 : 15), fv(p[key]), 'mx-dtx mx-strong', 'middle', true);
      if (el) svg.add(el);
    });
    ends.forEach((p) => {
      if (Math.abs(p[key]) <= 1e-9 * Math.max(Math.abs(lo), Math.abs(hi))) return;
      const yy = Yv(p[key]), above = yy < Yv(0), dx = p.end === 'end' ? -4 : 4, an = p.end === 'end' ? 'end' : 'start';
      const el = label(X(p.x) + dx, yy + (above ? -6 : 14), fv(p[key]), 'mx-dtx', an);
      if (el) svg.add(el);
    });
    D.joints.forEach((j) => svg.add(tagEl(X(j.x), Hh - 14, 'N' + j.id, 'mx-ntag')));
    return { svg, mx, mn };
  };
  {
    const c = chart('V', 'Shear force diagram', 'mx-sfd', 'up');
    out.push(panel('Shear force diagram (SFD)' + withU(f.uF), c.svg, [
      'Largest +V = ' + f.F(Math.max(0, c.mx.V)) + ' at x = ' + atX(c.mx.x) + (c.mx.V > 0 ? ' (element ' + c.mx.m + ')' : '') + '; largest −V = ' + f.F(Math.min(0, c.mn.V)) + ' at x = ' + atX(c.mn.x) + (c.mn.V < 0 ? ' (element ' + c.mn.m + ')' : '') + '.',
      'V positive when the left face is pushed up. Dots mark the element ends.'
    ]));
  }
  {
    const side = state.mside === 'compression' ? 'compression' : 'tension';
    const c = chart('M', 'Bending moment diagram', 'mx-bmd', side);
    const sel = h('label', { class: 'mx-viewf' }, 'Draw M on: ', h('select', { class: 'sel', 'aria-label': 'Draw the bending moment on', onChange: (e) => { state.mside = e.target.value; rerender(); } },
      [['tension', 'Tension side'], ['compression', 'Compression side']].map(([v, l]) => h('option', { value: v, selected: side === v }, l))));
    out.push(panel('Bending moment diagram (BMD)' + withU(f.uM), c.svg, [
      'Largest +M (sagging) = ' + f.M(Math.max(0, c.mx.M)) + ' at x = ' + atX(c.mx.x) + '; largest −M (hogging) = ' + f.M(Math.min(0, c.mn.M)) + ' at x = ' + atX(c.mn.x) + '.',
      'M positive when sagging; drawn on the ' + side + ' side (' + (side === 'tension' ? 'sagging below the axis' : 'sagging above the axis') + '). Peaks are exact (at V = 0).'
    ], sel));
  }
  return out;
}

// ================================================================ frames
function frameBase(svg, D, L, solidCls) {
  const { X, Y, J, members } = L;
  members.forEach((m) => { const a = J.get(m.i), b = J.get(m.j); svg.add(line(X(a.X), Y(a.Y), X(b.X), Y(b.Y), solidCls)); });
  L.joints.forEach((j) => { const sp = supportOf('frame', j, J); if (sp) svg.add(supportEl(sp[0], X(j.X), Y(j.Y), sp[1])); });
}

function framePanels(r, sys, state, rerender) {
  const D = r.diagram, f = fmts(D, sys), L = layoutOf('frame', D, null), { X, Y, J } = L, lf = L.lf;
  const Hh = 430, out = [];
  const R = D.res.filter((m) => J.has(m.i) && J.has(m.j));
  const hinges = R.some((m) => m.release && m.release !== 'none');
  // ---- deflected shape
  {
    const svg = canvas(W, Hh, 'Deflected shape of the frame', null);
    svg.classList.add('mxd');
    const lay = { boxes: [] }, { label } = labeller(lay, W, Hh);
    frameBase(svg, D, L, 'mx-ghost');
    let dmax = 0, at = null;
    R.forEach((m) => m.st.dx.forEach((dx, q) => { const d = Math.hypot(dx, m.st.dy[q]); if (d > dmax) { dmax = d; at = { m, q }; } }));
    const N = dmax > 0 ? niceDown(0.1 * L.span / (dmax * lf)) : 1;
    const P = (m, q) => { const a = J.get(m.i); return [X(a.X + (m.c * m.st.x[q] + N * m.st.dx[q]) * lf), Y(a.Y + (m.s * m.st.x[q] + N * m.st.dy[q]) * lf)]; };
    if (dmax > 0) {
      R.forEach((m) => svg.add(pline(m.st.x.map((x, q) => P(m, q)), 'mx-ecurve')));
      R.forEach((m) => {
        const rel = m.release || 'none', n = m.st.x.length - 1;
        if (rel === 'i' || rel === 'both') { const [x, y] = P(m, Math.min(n, 4)); svg.add(circle(x, y, 4.5, 'mx-hinge')); }
        if (rel === 'j' || rel === 'both') { const [x, y] = P(m, Math.max(0, n - 4)); svg.add(circle(x, y, 4.5, 'mx-hinge')); }
      });
      // joints on the deflected shape with their numbers
      D.ids.forEach((id) => {
        const j = J.get(id); if (!j) return;
        const q = D.dofNames.findIndex((nm, k) => D.dofJoint[k] === id);
        const ux = D.U[q] || 0, uy = D.U[q + 1] || 0, x = X(j.X + N * ux * lf), y = Y(j.Y + N * uy * lf);
        svg.add(circle(x, y, 3.2, 'mx-jdot'));
        const el = label(x + 7, y - 7, String(id), 'mx-jnum', 'start');
        if (el) svg.add(el);
      });
      const [mx, my] = P(at.m, at.q);
      svg.add(circle(mx, my, 4.5, 'mx-maxdot'));
      const el = label(mx + 8, my + 16, 'max ' + f.d(dmax), 'mx-maxtx', 'start', true);
      if (el) svg.add(el);
    } else svg.add(text(W / 2, 30, 'No movement: every joint is held.', 'middle', 'mx-hint'));
    const xw = at ? at.m.st.x[at.q] : 0;
    out.push(panel('Deflected shape', svg, [
      'Displacements are drawn ' + fmt(N) + ' times larger than true scale.',
      at ? 'Largest displacement: ' + f.d(dmax) + ' (member ' + at.m.id + ', x = ' + f.L(xw) + ' from joint ' + at.m.i + ').' : null,
      hinges ? 'At a hinge the members on either side turn by different amounts, so the shape has a kink there.' : null
    ]));
  }
  // ---- N, V, M
  const kinds = [
    ['N', 'Axial force diagram N (tension +)', f.F, f.uF],
    ['V', 'Shear force diagram V (V = Q2 at b)', f.F, f.uF],
    ['M', 'Bending moment diagram M (sagging +, drawn on the ' + (state.mside === 'compression' ? 'compression' : 'tension') + ' side)', f.M, f.uM]
  ];
  kinds.forEach(([key, title, fv, un]) => {
    const svg = canvas(W, Hh, title, null);
    svg.classList.add('mxd');
    const lay = { boxes: [] }, { label } = labeller(lay, W, Hh);
    let vmax = 0, big = null;
    R.forEach((m) => m.st[key].forEach((x) => { if (Math.abs(x) > vmax) { vmax = Math.abs(x); big = m; } }));
    const side = key === 'M' ? (state.mside === 'compression' ? 1 : -1) : 1;
    const sc = vmax > 0 ? 42 / vmax : 0, lbls = [];
    R.forEach((m) => {
      const a = J.get(m.i), st = m.st, n = st.x.length - 1;
      const base = (x) => [X(a.X + m.c * x * lf), Y(a.Y + m.s * x * lf)];
      const nx = -m.s * side, ny = -m.c * side;               // screen direction of a positive value
      const pt = (q) => { const [bx, by] = base(st.x[q]); const off = st[key][q] * sc; return [bx + nx * off, by + ny * off]; };
      // filled runs of one sign
      let run = [], sgn = 0;
      const flush = () => { if (run.length > 1) { const [b0x, b0y] = base(run[0][0]), [b1x, b1y] = base(run[run.length - 1][0]); svg.add(poly([[b0x, b0y]].concat(run.map((rr) => rr[1]), [[b1x, b1y]]), sgn > 0 ? 'mx-posf' : 'mx-negf')); } run = []; };
      for (let q = 0; q <= n; q++) {
        const val = st[key][q], sg = Math.abs(val) <= 1e-9 * vmax ? 0 : val > 0 ? 1 : -1;
        if (sg && sgn && sg !== sgn) {
          const v0 = st[key][q - 1], x0 = st.x[q - 1], x1 = st.x[q], xc = x0 + (x1 - x0) * v0 / (v0 - val);
          run.push([xc, base(xc)]); flush(); run.push([xc, base(xc)]);
        }
        if (sg) sgn = sg;
        run.push([st.x[q], pt(q)]);
      }
      flush();
      // outline in the colour of each sign
      for (let q = 1; q <= n; q++) { const v = (st[key][q] + st[key][q - 1]) / 2; svg.add(line(...pt(q - 1), ...pt(q), v >= 0 ? 'mx-posl' : 'mx-negl')); }
      // labels: both ends, plus interior extremes beyond the ends by 1%; a constant member gets one
      const v0 = st[key][0], v1 = st[key][n], tolv = 1e-6 * vmax;
      let lo = 0, hi = 0;
      st[key].forEach((x, q) => { if (x < st[key][lo]) lo = q; if (x > st[key][hi]) hi = q; });
      if (Math.abs(st[key][hi] - st[key][lo]) <= Math.max(tolv, 0.001 * Math.abs(v0))) lbls.push({ p: 1, q: Math.round(n / 2), v: v0, m, base, nx, ny, st });
      else {
        [0, n].forEach((q) => { if (Math.abs(st[key][q]) > tolv) lbls.push({ p: 1, q, v: st[key][q], m, base, nx, ny, st }); });
        const endMax = Math.max(v0, v1), endMin = Math.min(v0, v1), span = Math.max(Math.abs(endMax), Math.abs(endMin), tolv);
        if (st[key][hi] > endMax + 0.01 * span && hi > 0 && hi < n) lbls.push({ p: 2, q: hi, v: st[key][hi], m, base, nx, ny, st });
        if (st[key][lo] < endMin - 0.01 * span && lo > 0 && lo < n) lbls.push({ p: 2, q: lo, v: st[key][lo], m, base, nx, ny, st });
      }
    });
    frameBase(svg, D, L, 'mx-solid');
    if (!(vmax > 0)) svg.add(text(W / 2, 30, (key === 'N' ? 'N' : key === 'V' ? 'V' : 'M') + ' = 0 in every member.', 'middle', 'mx-hint'));
    lbls.sort((p, q) => q.p - p.p).forEach((l) => {
      const str = fv(l.v, false), wl = str.length * 6.6 + 4;
      const [bx, by] = l.base(l.st.x[l.q]), off = l.v * sc, d = off + Math.sign(off || 1) * (8 + Math.abs(l.nx) * wl / 2 + Math.abs(l.ny) * 6);
      const el = label(bx + l.nx * d, by + l.ny * d + 4, str, 'mx-dtx', 'middle');
      if (el) svg.add(el);
    });
    const extra = key === 'M' ? h('label', { class: 'mx-viewf' }, 'Draw M on: ', h('select', { class: 'sel', 'aria-label': 'Draw the bending moment on', onChange: (e) => { state.mside = e.target.value; rerender(); } },
      [['tension', 'Tension side'], ['compression', 'Compression side']].map(([v, lb]) => h('option', { value: v, selected: (state.mside || 'tension') === v }, lb)))) : null;
    out.push(panel(title, svg, [
      vmax > 0 ? 'Largest |' + key + '| = ' + fv(vmax) + ' (member ' + big.id + '). Values in ' + (un || 'the units typed') + '.' : null,
      'Blue: positive, drawn toward the member\'s local +y' + (key === 'M' ? ' side chosen above' : '') + '. Red: negative. The largest value is drawn 42 px from the member.',
      key === 'N' ? 'N positive in tension.' : key === 'V' ? 'V = Q2 at b, the beam convention along the member from b to e.' : 'M positive when sagging (tension on the local −y face).'
    ], extra));
  });
  return out;
}

// ================================================================ bars
function barPanels(r, sys) {
  const D = r.diagram, f = fmts(D, sys), L = layoutOf('bar', D, null), { J } = L, lf = L.lf, X = (x) => L.X(x * lf);
  const R = D.res.filter((m) => J.has(m.i) && J.has(m.j));
  const xOf = (id) => J.get(id).x;
  const xs0 = Math.min(...L.joints.map((j) => j.x)), xs1 = Math.max(...L.joints.map((j) => j.x));
  const lanes = Math.max(1, ...R.map((m) => (L.laneNo.get(m.id) || 0) + 1));
  const out = [];
  // extremes (Excel DIAGRAM VALUES)
  const ex = { T: null, C: null, R: null, Lf: null };
  R.forEach((m) => m.st.x.forEach((x, q) => {
    const gx = xOf(m.i) + x, N = m.st.N[q], u = m.st.u[q];
    if (N > 0 && (!ex.T || N > ex.T.v)) ex.T = { v: N, x: gx, m: m.id };
    if (N < 0 && (!ex.C || N < ex.C.v)) ex.C = { v: N, x: gx, m: m.id };
    if (u > 0 && (!ex.R || u > ex.R.v)) ex.R = { v: u, x: gx, m: m.id };
    if (u < 0 && (!ex.Lf || u < ex.Lf.v)) ex.Lf = { v: u, x: gx, m: m.id };
  }));
  const atX = (x) => f.L(x - xs0);
  // ---- axial force N
  {
    const laneH = 112, top = 70, Hh = top + lanes * laneH + 40, svg = canvas(W, Hh, 'Axial force diagram of the bar', null);
    svg.classList.add('mxd');
    const lay = { boxes: [] }, { label } = labeller(lay, W, Hh);
    const y0 = (lane) => top + lane * laneH + laneH / 2;
    const Nmax = Math.max(0, ...R.flatMap((m) => m.st.N.map(Math.abs)));
    const sy = Nmax > 0 ? 34 / Nmax : 0;
    // node guides, numbers, loads and supports along the top
    L.joints.forEach((j) => {
      const x = X(j.x);
      svg.add(line(x, top - 8, x, Hh - 34, 'mx-guide'));
      svg.add(tagEl(x, top - 16, 'N' + j.id, 'mx-ntag'));
      lay.boxes.push([x - 14, top - 24, 28, 16]);
      if (j.FX) { const d = Math.sign(j.FX); svg.add(arrowEl(x - d * 40, 26, x - d * 4, 26, 'mx-pt')); const el = label(x - d * 22, 18, f.F(Math.abs(j.FX)), 'mx-ptx', 'middle', true); if (el) svg.add(el); }
      if (j.support === 'fixed') {
        const yb = Hh - 30;
        svg.add(line(x - 10, yb, x + 10, yb, 'mx-gnd'), line(x, yb - 8, x, yb, 'mx-gnd'));
        for (let u = -10; u <= 10; u += 5) svg.add(line(x + u, yb, x + u - 4, yb + 5, 'mx-hatch'));
      }
    });
    for (let lane = 0; lane < lanes; lane++) svg.add(line(X(xs0), y0(lane), X(xs1), y0(lane), 'mx-axis'));
    R.forEach((m) => {
      const lane = L.laneNo.get(m.id) || 0, x0 = xOf(m.i), st = m.st, n = st.x.length - 1, yb = y0(lane);
      const tol = 1e-9 * Math.max(Nmax, 1e-300);
      // filled runs of one sign (blue tension above the axis, red compression below)
      let run = [], sgn = 0;
      const flush = () => { if (run.length > 1 && sgn) svg.add(poly([[run[0][0], yb]].concat(run, [[run[run.length - 1][0], yb]]), sgn > 0 ? 'mx-posf' : 'mx-negf')); run = []; };
      for (let q = 0; q <= n; q++) {
        const v = st.N[q], sg = Math.abs(v) <= tol ? 0 : v > 0 ? 1 : -1;
        if (sg && sgn && sg !== sgn) {
          const v0 = st.N[q - 1], xc = st.x[q - 1] + (st.x[q] - st.x[q - 1]) * v0 / (v0 - v);
          run.push([X(x0 + xc), yb]); flush(); run.push([X(x0 + xc), yb]);
        }
        if (sg) sgn = sg;
        run.push([X(x0 + st.x[q]), yb - v * sy]);
      }
      flush();
      svg.add(pline(st.x.map((x, q) => [X(x0 + x), yb - st.N[q] * sy]), 'mx-dline'));
      const mid = (st.N[0] + st.N[n]) / 2, stc = Math.abs(st.N[0]) <= tol && Math.abs(st.N[n]) <= tol ? 'zero' : mid > 0 ? 'T' : 'C';
      svg.add(line(X(x0) + 2, yb + 42, X(x0 + m.L) - 2, yb + 42, 'mx-strip mx-' + stc));
      const word = stc === 'T' ? 'tension' : stc === 'C' ? 'compression' : 'zero force';
      const el = label((X(x0) + X(x0 + m.L)) / 2, yb + 58, '[' + m.id + '] ' + word, 'mx-word mx-' + stc, 'middle', true);
      if (el) svg.add(el);
      // end values
      [0, n].forEach((q) => {
        if (Math.abs(st.N[q]) <= tol) return;
        const px = X(x0 + st.x[q]) + (q ? -4 : 4), py = yb - st.N[q] * sy + (st.N[q] > 0 ? -5 : 13);
        const e2 = label(px, py, f.F(st.N[q], false), 'mx-dtx', q ? 'end' : 'start');
        if (e2) svg.add(e2);
      });
    });
    if (!(Nmax > 0)) svg.add(text(W / 2, y0(0) - 10, 'N = 0 in every element', 'middle', 'mx-hint'));
    out.push(panel('Axial force N' + withU(f.uF) + ': tension + above the axis, compression − below', svg, [
      ex.T ? 'Largest tension: ' + f.F(ex.T.v) + ' at x = ' + atX(ex.T.x) + ' (element ' + ex.T.m + ').' : 'No tension.',
      ex.C ? 'Largest compression: ' + f.F(ex.C.v) + ' at x = ' + atX(ex.C.x) + ' (element ' + ex.C.m + ').' : 'No compression.',
      'Lengths to scale along the bar; arrows not to scale.' + (lanes > 1 ? ' Elements between the same two nodes are drawn on separate axes.' : '')
    ]));
  }
  // ---- axial displacement u
  {
    const Hh = 220, y0 = 104, svg = canvas(W, Hh, 'Axial displacement of the bar', null);
    svg.classList.add('mxd');
    const lay = { boxes: [] }, { label } = labeller(lay, W, Hh);
    const umax = Math.max(0, ...R.flatMap((m) => m.st.u.map(Math.abs)));
    const sy = umax > 0 ? 62 / umax : 0;
    L.joints.forEach((j) => svg.add(line(X(j.x), 16, X(j.x), Hh - 28, 'mx-guide')));
    svg.add(line(X(xs0), y0, X(xs1), y0, 'mx-axis'));
    R.forEach((m) => svg.add(pline(m.st.x.map((x, q) => [X(xOf(m.i) + x), y0 - m.st.u[q] * sy]), 'mx-ecurve')));
    [ex.R, ex.Lf].forEach((e) => {
      if (!e) return;
      const py = y0 - e.v * sy;
      svg.add(circle(X(e.x), py, 4, 'mx-maxdot'));
      const el = label(X(e.x), py + (e.v > 0 ? -9 : 17), 'max ' + (e.v > 0 ? '+' : '') + f.d(e.v) + ' at x = ' + atX(e.x) + ' (element ' + e.m + ')', 'mx-maxtx', 'middle', true);
      if (el) svg.add(el);
    });
    L.joints.forEach((j) => {
      const q = D.dofNames.findIndex((nm, k) => D.dofJoint[k] === j.id), u = q >= 0 ? D.U[q] : 0, held = q >= 0 && D.held && D.held[q];
      const str = 'u' + j.id + ' = ' + (held && u ? (u > 0 ? '+' : '') + f.d(u, false) + ' (support moved)' : f.d(u, false));
      const py = y0 - u * sy;
      svg.add(circle(X(j.x), py, 3, 'mx-jdot'));
      svg.add(tagEl(X(j.x), Hh - 14, 'N' + j.id, 'mx-ntag'));
      // the largest value is labelled already
      if ([ex.R, ex.Lf].some((e) => e && Math.abs(e.x - j.x) < 1e-9 * Math.max(1, xs1 - xs0) && Math.abs(e.v - u) <= 1e-9 * Math.max(umax, 1e-300))) return;
      const el = label(X(j.x), py + (u < 0 ? 16 : -8), str, 'mx-vtx', 'middle') || label(X(j.x), py + (u < 0 ? -8 : 16), str, 'mx-vtx', 'middle');
      if (el) svg.add(el);
    });
    if (!(umax > 0)) svg.add(text(W / 2, y0 - 12, 'u = 0 at every node', 'middle', 'mx-hint'));
    const sx = L.k;
    out.push(panel('Axial displacement u' + withU(f.ud) + ': to the right + drawn up, to the left − drawn down', svg, [
      umax > 0 ? 'Vertical scale: 1 ' + (f.ud || 'unit') + ' of u drawn as ' + fmt(sy / f.dFac) + ' px (lengths: 1 ' + (f.uL || 'unit') + ' = ' + fmt(sx) + ' px).' : null,
      'Between the nodes u follows the element loads (straight where an element has none).'
    ]));
  }
  // ---- diagram values (Excel table)
  const row = (what, e, k) => [what, e ? (k === 'F' ? f.F(e.v) : f.d(e.v)) : '–', e ? atX(e.x) : '–', e ? String(e.m) : '–'];
  const rows = [row('Largest tension', ex.T, 'F'), row('Largest compression', ex.C, 'F'), row('Largest u to the right', ex.R, 'd'), row('Largest u to the left', ex.Lf, 'd'),
    ['Total length', f.L(xs1 - xs0), 'nodes ' + L.joints.reduce((a, b) => (b.x < a.x ? b : a)).id + ' to ' + L.joints.reduce((a, b) => (b.x > a.x ? b : a)).id, '']];
  out.push(h('figure', { class: 'mx-panel' }, h('figcaption', { class: 'mx-ptitle' }, 'Diagram values'),
    h('div', { class: 'tblwrap scrollx' }, h('table', { class: 'tbl mx-tbl' }, h('thead', null, h('tr', null, ['', 'Value', 'At x', 'Element'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map((rr) => h('tr', null, rr.map((c) => h('td', null, c)))))))));
  return out;
}

// ================================================================ card and report
export function diagramPanels(r, sys, kind, state, rerender) {
  if (!r || !r.ok || !r.diagram || !r.diagram.res || !(r.verdict && r.verdict.pass)) return [];
  if (kind === 'beam') return beamPanels(r, sys, state, rerender);
  if (kind === 'frame') return framePanels(r, sys, state, rerender);
  if (kind === 'bar') return barPanels(r, sys);
  return [];
}

export function diagramsCard(r, ctx, kind, state) {
  if (kind === 'truss') return null;
  const body = h('div', { class: 'mx-panels' });
  const card = h('section', { class: 'card mx-diagrams', 'aria-label': 'Diagrams' }, h('h3', { class: 'h3' }, 'Diagrams'), body);
  const fill = () => {
    while (body.firstChild) body.removeChild(body.firstChild);
    const p = diagramPanels(r, ctx.sys, kind, state, fill);
    if (!p.length) body.appendChild(h('p', { class: 'muted small', style: 'margin:0' }, r && r.ok ? 'The diagrams are drawn when the equilibrium checks pass.' : 'The diagrams appear when the model is solved.'));
    p.forEach((x) => body.appendChild(x));
  };
  fill();
  return card;
}
