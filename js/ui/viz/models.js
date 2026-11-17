// Builds the 3D, stress and animation model for each module from its SI inputs and result.
// Pure functions (no DOM, no three.js), so they can be tested in node.
//
// Coordinates are metres: x along the member, y up, z across. A model is
//   { parts, bounds, hasRebar, stress: { label, q, f(x,y,z,part,lam) } | null,
//     disp(x,y,z,part,s) -> [dx,dy,dz], cracks, loads, lamEnd, fails, failText, ampText, note, noAnim }
// where s = { lam, lamEnd, r = lam / lamEnd, brk } and lam is the load as a fraction of the design load.
// Stress values are illustrative (simple elastic distributions driven by the computed results).
// The failure load is the design load divided by the governing demand/capacity ratio.

const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const pos = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);
const m = (mmVal, dmm) => pos(mmVal, dmm) / 1000;
const Ab = (db) => (PI * db * db) / 4;
const Ec = (fc) => 4700 * Math.sqrt(fc);

// ---- geometry helpers
const BX = (x0, x1, y0, y1, z0, z1, seg) => ({ type: 'box', min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], seg: seg || [1, 1, 1] });
const CY = (a, b, r, seg, radial) => ({ type: 'cyl', a, b, r, seg: seg || 1, radial: radial || 8 });
const P = (geoms, mat, extra) => Object.assign({ geoms: Array.isArray(geoms) ? geoms : [geoms], mat }, extra || {});
const sg = (len, per, lo, hi) => clamp(Math.round(len / per), lo || 1, hi || 60);

function bounds(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const add = (p, r) => { for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - r); hi[i] = Math.max(hi[i], p[i] + r); } };
  parts.forEach((pt) => pt.geoms.forEach((g) => { if (g.type === 'box') { add(g.min, 0); add(g.max, 0); } else { add(g.a, g.r); add(g.b, g.r); } }));
  return [lo, hi];
}
// Rotate (x,y) about (px,py) by angle a (counterclockwise) and return the change.
function rot(x, y, px, py, a) {
  const c = Math.cos(a), s = Math.sin(a), dx = x - px, dy = y - py;
  return [px + dx * c - dy * s - x, py + dx * s + dy * c - y];
}
// Load-deflection curve: stiffness drops as the member nears failure.
const curve = (r) => (r + 0.6 * Math.pow(clamp(r, 0, 1.5), 4)) / 1.6;

// ---- reading results
function rv(R, re, d) {
  const x = (R.results || []).find((v) => re.test(v.symbol || '') || re.test(v.label || ''));
  return x && typeof x.value === 'number' && isFinite(x.value) ? x.value : d;
}
const NOT_STRENGTH = /minimum|maximum|spacing|size|ratio|number of bars|ductility|middle third|effective depth|development|embedment|^thickness$|not negative|magnifier|deflection|threshold|area|anchorage|slenderness|clear/i;
function governing(R, prefer) {
  const ch = (R.checks || []).filter((c) => typeof c.dc === 'number' && isFinite(c.dc) && c.dc > 0 && !NOT_STRENGTH.test(c.name));
  if (!ch.length) return null;
  const pick = prefer ? ch.filter((c) => prefer.test(c.name)) : ch;
  return (pick.length ? pick : ch).reduce((a, b) => (b.dc > a.dc ? b : a));
}
function failInfo(g, what) {
  if (!g) return null;
  const lamEnd = clamp(1 / g.dc, 0.05, 50);
  const at = g.dc > 1 ? Math.round(100 / g.dc) + '% of the design load' : (1 / g.dc).toFixed(2) + ' × the design load';
  return { lamEnd, fails: true, failText: 'Fails at ' + at + ': ' + what + ' (' + g.name + ', D/C ' + g.dc.toFixed(2) + ')' };
}

// ================================================================== beams (horizontal members)
// secs: cross-section rectangles [y0, y1, z0, z1]; bars: [{y, z, r, role}]; stirrups: {s, r, rect:[y0,y1,z0,z1]}
function beamParts(o) {
  const { L, secs, mat, splitX } = o;
  const iv = splitX ? [[0, splitX, 'A'], [splitX, L, 'B']] : [[0, L, 'A']];
  const parts = [];
  iv.forEach(([a, b, pc]) => {
    const nx = sg(b - a, L / 40, 2, 48);
    secs.forEach((s) => parts.push(P(BX(a, b, s[0], s[1], s[2], s[3], [nx, o.ny || 8, o.nz || 2]), mat, { piece: pc, role: 'body' })));
    (o.bars || []).forEach((br) => {
      const x0 = Math.max(a, 0.04), x1 = Math.min(b, L - 0.04);
      if (x1 > x0) parts.push(P(CY([x0, br.y, br.z], [x1, br.y, br.z], br.r, nx, 8), o.barMat || 'rebar', { piece: pc, inner: o.barMat !== 'steel', role: br.role || 'tb' }));
    });
  });
  if (o.stirrups) {
    const st = o.stirrups, [y0, y1, z0, z1] = st.rect;
    let s = st.s;
    if ((L - 0.1) / s > 80) s = (L - 0.1) / 80;
    const byPiece = {};
    for (let x = 0.05; x <= L - 0.05 + 1e-9; x += s) {
      const pc = splitX && x > splitX ? 'B' : 'A';
      (byPiece[pc] = byPiece[pc] || []).push(
        CY([x, y0, z0], [x, y1, z0], st.r, 1, 6), CY([x, y0, z1], [x, y1, z1], st.r, 1, 6),
        CY([x, y0, z0], [x, y0, z1], st.r, 1, 6), CY([x, y1, z0], [x, y1, z1], st.r, 1, 6));
    }
    Object.keys(byPiece).forEach((pc) => parts.push(P(byPiece[pc], 'rebar', { piece: pc, inner: true, role: 'st' })));
  }
  const ybot = Math.min(...secs.map((s) => s[0])), zmax = Math.max(...secs.map((s) => s[3])), zmin = Math.min(...secs.map((s) => s[2]));
  parts.push(P([BX(-0.12, 0.12, ybot - 0.1, ybot, zmin - 0.05, zmax + 0.05), BX(L - 0.12, L + 0.12, ybot - 0.1, ybot, zmin - 0.05, zmax + 0.05)], 'support', { piece: 'S', stress: false }));
  return parts;
}
function beamLoads(L, ytop, n) {
  const out = [];
  for (let i = 1; i <= (n || 5); i++) out.push({ p: [(L * i) / ((n || 5) + 1), ytop, 0], dir: [0, -1, 0], len: Math.max(0.15, L * 0.05) });
  return out;
}
// Displacement of a simply supported member, with the failure motion after the peak load.
function beamDisp(o) {
  const { L, h, amp, fail, xs } = o, yb = o.yb || 0;
  return (x, y, z, part, s) => {
    if (part.piece === 'S') return [0, 0, 0];
    const g = curve(s.r), xi = clamp(x / L, 0, 1);
    let dx = 0, dy = -amp * g * Math.sin(PI * xi), dz = 0;
    const b = s.brk;
    if (o.ltb) { const tw = (o.ltb * g + (b ? 0.5 * b : 0)) * Math.sin(PI * xi); dz += tw * (y - h / 2) + tw * h * 0.6; }
    if (b > 0) {
      const left = part.piece === 'A' || (part.piece == null && x <= xs);
      if (fail === 'flex') {
        const th = 0.2 * b, r = left ? rot(x, y, 0, yb, -th) : rot(x, y, L, yb, th);
        dx += r[0]; dy += r[1] - 0.25 * h * b * b;
      } else if (fail === 'shear') {
        if (!left) { const r = rot(x, y, L, yb, 0.08 * b); dx += r[0]; dy += r[1] - 0.45 * h * b * (L - x) / (L - xs); }
      } else if (fail === 'hinge') {
        dy += -0.12 * L * b * (1 - Math.abs(2 * xi - 1));
        if (Math.abs(x - L / 2) < h && Math.abs(y - h / 2) > 0.3 * h && part.role !== 'web') dz += 0.25 * h * b * Math.sin(((x - L / 2) / h) * PI * 2) * Math.sign(y - h / 2);
      } else if (fail === 'web' && part.role === 'web') {
        dz += 0.25 * h * b * Math.sin(PI * xi * 4) * Math.sin(PI * clamp(y / h, 0, 1));
      } else if (fail === 'split') {
        dx += (left ? -1 : 1) * 0.12 * L * b * b;
      }
    }
    if (o.neck && Math.abs(x - L / 2) < L * 0.15) { const k = (1 - Math.abs(x - L / 2) / (L * 0.15)) * 0.25 * (s.brk || 0); dy += -(y - o.yc) * k; dz += -z * k; }
    return [dx, dy, dz];
  };
}
// Elastic cracked section of a rectangular (or flanged) RC beam, mm and MPa.
function cracked(b, d, As, fc, Asp, dp) {
  const n = 200000 / Ec(fc);
  // b kd^2 / 2 + (n-1) Asp (kd - dp) = n As (d - kd)
  const A = b / 2, B = n * As + (n - 1) * (Asp || 0), C = -(n * As * d + (n - 1) * (Asp || 0) * (dp || 0));
  const kd = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  const Icr = (b * kd ** 3) / 3 + n * As * (d - kd) ** 2 + (n - 1) * (Asp || 0) * (kd - (dp || 0)) ** 2;
  return { n, kd, Icr };
}
const mShape = (x, L) => clamp((4 * x * (L - x)) / (L * L), 0, 1);
const vShape = (x, L) => Math.abs(1 - (2 * x) / L);

// Bars spread across a width, inside cover and a stirrup.
function barRow(n, db, y, zLeft, zRight, role) {
  const out = [];
  n = Math.max(1, Math.round(n));
  for (let i = 0; i < n; i++) out.push({ y, z: n === 1 ? (zLeft + zRight) / 2 : zLeft + ((zRight - zLeft) * i) / (n - 1), r: db / 2000, role });
  return out;
}
function rcBars(n, db, b, y, cover, ds, role) {
  // Up to (fit) bars per layer, extra layers 25 mm clear above.
  const per = Math.max(2, Math.floor((b - 2 * cover - 2 * ds + 25) / (db + 25)));
  const out = [];
  let left = Math.round(n), layer = 0;
  while (left > 0 && layer < 4) {
    const k = Math.min(per, left);
    const z0 = (-b / 2 + cover + ds + db / 2) / 1000, z1 = (b / 2 - cover - ds - db / 2) / 1000;
    out.push(...barRow(k, db, y + (role === 'cb' ? -1 : 1) * layer * (db + 25) / 1000, z0, z1, role));
    left -= k; layer++;
  }
  return out;
}

function rcBeam(I, R, mode, def) {
  const D = R.diagram || {};
  const flanged = mode === 'flanged' || D.flanged;
  const b = pos(D.b, pos(I.b, pos(I.bw, 300))), bw = flanged ? pos(I.bw, b) : b;
  const h = pos(D.h, pos(I.h, 500)), d = pos(D.d, pos(I.d, h - 60));
  const bf = flanged ? pos(D.bf, pos(I.bf, 3 * bw)) : bw, hf = flanged ? pos(D.hf, pos(I.hf, 100)) : 0;
  const n = pos(D.n, pos(I.n, 3)), db = pos(D.db, pos(I.db, 25));
  const np = mode === 'doubly' ? pos(I.np, pos(D.np, 0)) : 0, dbp = pos(I.dbp, pos(D.dbp, 20)), dp = pos(I.dp, 60);
  const fc = pos(I.fc, 28), fy = pos(I.fy, 420), Mu = pos(I.Mu, pos(I.Ms, 100));
  const L = def.L || clamp(pos(I.ln, 0) / 1000 || (12 * h) / 1000, 2.5, 12);
  const H = h / 1000, Bw = bw / 1000, Bf = bf / 1000, Hf = hf / 1000;
  let secs;
  if (!flanged) secs = [[0, H, -Bw / 2, Bw / 2]];
  else if (I.flangeType === 'L') secs = [[0, H - Hf, -Bw / 2, Bw / 2], [H - Hf, H, -Bw / 2, -Bw / 2 + Bf]];
  else secs = [[0, H - Hf, -Bw / 2, Bw / 2], [H - Hf, H, -Bf / 2, Bf / 2]];
  const cover = 40, ds = 10;
  const bars = rcBars(n, db, bw, (h - d) / 1000, cover, ds, 'tb').concat(np ? rcBars(np, dbp, bw, (h - dp) / 1000, cover, ds, 'cb') : []);
  // Two hanger bars at the top when there is no compression steel.
  if (!np) bars.push(...barRow(2, 12, H - (cover + ds + 6) / 1000, (-bw / 2 + cover + ds + 6) / 1000, (bw / 2 - cover - ds - 6) / 1000, 'hg'));
  const As = n * Ab(db), Asp = np * Ab(dbp);
  const g = def.fail || governing(R, /flexur/i);
  const fi = def.failInfo || failInfo(g, def.failWhat || (D.fs && D.fs < fy - 1 ? 'the concrete crushes before the steel yields (brittle compression failure)' : 'the bars yield, flexural cracks open and the top concrete crushes'));
  const splitX = fi ? (def.failKind === 'shear' ? Math.min(L / 3, 1.6 * H + 0.2) : L / 2) : null;
  const parts = beamParts({ L, secs, mat: 'concrete', bars, splitX, stirrups: { s: (def.s || Math.min(d / 2, 300)) / 1000, r: (def.dbs || 10) / 2000, rect: [(cover + ds / 2) / 1000, H - (cover + ds / 2) / 1000, (-bw / 2 + cover + ds / 2) / 1000, (bw / 2 - cover - ds / 2) / 1000] } });
  // Stress: cracked elastic section under M(x) for a uniform load on a simple span.
  const cs = cracked(flanged && bf > bw ? bf : bw, d, As, fc, Asp, dp);
  const kdM = cs.kd / 1000, yna = H - kdM;
  const Vu = (4 * Mu) / L, vc = 0.17 * Math.sqrt(fc), Av = 2 * Ab(def.dbs || 10);
  const stress = def.stress || {
    label: 'Flexural stress |σ| (cracked section)', q: 'stress',
    f(x, y, z, part, lam) {
      const M = Mu * lam * mShape(x, L) * 1e6;
      if (part.role === 'tb') return Math.min(fy, (cs.n * M * (d - cs.kd)) / cs.Icr);
      if (part.role === 'cb') return Math.min(fy, Math.max(0, (cs.n * M * (cs.kd - dp)) / cs.Icr));
      if (part.role === 'hg') return 0;
      if (part.role === 'st') { const V = Vu * lam * vShape(x, L) * 1000; const vs = V / (bw * d) - vc; return vs > 0 ? Math.min(fy, (vs * bw * (def.s || d / 2)) / Av) : 0; }
      return y > yna ? Math.min(0.85 * fc, (M * (y - yna) * 1000) / cs.Icr) : 0;
    }
  };
  // Cracks: flexural cracks where M(x) passes Mcr; diagonal cracks near the supports where V passes Vc.
  const Ig = (bw * h ** 3) / 12, Mcr = (0.62 * Math.sqrt(fc) * Ig) / (h / 2) / 1e6;
  const lamEnd = fi ? fi.lamEnd : 1, Mfail = Mu * lamEnd;
  const zf = Bw / 2 + 0.002, cracks = [];
  for (let k = -4; k <= 4; k++) {
    const x = L / 2 + (k * L) / 14, mx = mShape(x, L);
    if (mx <= 0) continue;
    const at = Mcr / (Mfail * mx);
    if (at < 1) { const top = Math.min(H * 0.92, yna + 0.04); [zf, -zf].forEach((zz) => cracks.push({ pts: [[x, 0, zz], [x + 0.01, top * 0.5, zz], [x - 0.005, top, zz]], at, piece: x <= (splitX || L / 2) ? 'A' : 'B' })); }
  }
  const Vcr = (vc * bw * d) / 1000, Vfail = Vu * lamEnd;
  [0.25, 0.5, 0.75].forEach((f) => {
    const x0 = f * 2 * H + 0.15, vx = vShape(x0, L), at = Vcr / (Vfail * Math.max(vx, 0.05));
    if (at < 1) [[x0, 0.15 * H], [L - x0, 0.15 * H]].forEach(([xx], j) => { const sgn = j ? -1 : 1; cracks.push({ pts: [[xx, 0.1 * H, zf], [xx - sgn * 0.35 * H, 0.5 * H, zf], [xx - sgn * 0.7 * H, 0.85 * H, zf]], at, piece: j ? 'B' : 'A' }); });
  });
  if (fi && def.failKind !== 'shear') for (let k = -2; k <= 2; k++) cracks.push({ pts: [[L / 2 + k * 0.04 - 0.05, H - 0.01, zf], [L / 2 + k * 0.04 + 0.05, H - 0.03, zf]], brk: 0.15, piece: 'A' });
  if (fi && def.failKind === 'shear') cracks.push({ pts: [[splitX + 0.4 * H, 0.02, zf], [splitX, 0.5 * H, zf], [splitX - 0.4 * H, H - 0.02, zf]], at: 0.85, piece: 'A' });
  return finish({
    parts, hasRebar: true, stress, cracks, loads: beamLoads(L, H + (flanged ? 0 : 0)),
    disp: beamDisp({ L, h: H, amp: def.amp || L / 40, fail: fi ? def.failKind || 'flex' : null, xs: splitX }),
    ampText: 'Deflections are exaggerated. Simple span of ' + L.toFixed(1) + ' m under uniform load, drawn for illustration.',
    note: 'Span and uniform load are assumed for the picture; the design values come from the calculation.'
  }, fi);
}

function finish(model, fi) {
  model.bounds = bounds(model.parts);
  model.lamEnd = fi ? fi.lamEnd : model.lamEnd || 1;
  model.fails = !!fi;
  model.failText = fi ? fi.failText : '';
  return model;
}

// ================================================================== RC modules
function shearTorsion(I, R, mode) {
  const D = R.diagram || {};
  if (mode === 'torsion') {
    const b = pos(I.b, 350), h = pos(I.h, 600), cover = pos(I.cover, 40), ds = pos(I.dbs, 10), Tu = pos(I.Tu, 20), Vu = pos(I.Vu, 0), fc = pos(I.fc, 28);
    const L = clamp((12 * h) / 1000, 3, 10), H = h / 1000, Bw = b / 1000;
    const x1 = b - 2 * cover - ds, y1 = h - 2 * cover - ds, Aoh = x1 * y1, ph = 2 * (x1 + y1), A0 = 0.85 * Aoh, t = Aoh / ph;
    const tauT = (Tu * 1e6) / (2 * A0 * t), tauV = (Vu * 1000) / (b * (h - 60));
    const g = governing(R);
    const fi = failInfo(g, 'spiral torsion cracks open around the beam and the concrete struts crush');
    const sMm = pos(rv(R, /^s\b|spacing/i, NaN), Math.min(ph / 8, 300));
    const bars = [];
    [cover + ds + 12, h - cover - ds - 12].forEach((yy) => [-1, 0, 1].forEach((k) => bars.push({ y: yy / 1000, z: (k * (b / 2 - cover - ds - 12)) / 1000, r: 0.012, role: 'tb' })));
    const parts = beamParts({ L, secs: [[0, H, -Bw / 2, Bw / 2]], mat: 'concrete', bars, stirrups: { s: sMm / 1000, r: ds / 2000, rect: [(cover + ds / 2) / 1000, H - (cover + ds / 2) / 1000, (-b / 2 + cover + ds / 2) / 1000, (b / 2 - cover - ds / 2) / 1000] } });
    const Tcr = (0.33 * Math.sqrt(fc) * (b * h) ** 2) / (2 * (b + h)) / 1e6, at = fi ? Tcr / (Tu * fi.lamEnd) : 2;
    const cracks = [];
    for (let k = 0; k < 7; k++) {
      const x0 = L * (0.12 + k * 0.12), pts = [];
      for (let j = 0; j <= 8; j++) { const u = j / 8, x = x0 + u * H; pts.push([x, u * H, Bw / 2 + 0.002]); }
      cracks.push({ pts, at: at * (1 + Math.abs(k - 3) * 0.06), piece: 'A' });
    }
    return finish({
      parts, hasRebar: true, cracks, loads: [],
      stress: { label: 'Shear stress τ from torsion and shear', q: 'stress', f(x, y, z, part, lam) { if (part.mat !== 'concrete') return 0; const e = Math.max(Math.abs(2 * (y - H / 2) / H), Math.abs((2 * z) / Bw)); return lam * (tauT * e + tauV * vShape(x, L) * (1 - (2 * (y - H / 2) / H) ** 2)); } },
      disp(x, y, z, part, s) { if (part.piece === 'S') return [0, 0, 0]; const th = (0.1 * curve(s.r) + 0.35 * s.brk) * Math.sin(PI * clamp(x / L, 0, 1)); const r = rot(z, y - H / 2, 0, 0, th); return [0, r[1] - 0.01 * L * curve(s.r) * Math.sin(PI * x / L), r[0]]; },
      ampText: 'Twist is exaggerated. Beam drawn with both ends restrained against twist.'
    }, fi);
  }
  const bw = pos(I.bw, pos(D.bw, 300)), d = pos(I.d, 440), h = d + 60, Vu = pos(I.Vu, 100), fc = pos(I.fc, 28), fyt = pos(I.fyt, 280);
  const s = pos(D.s, pos(I.s, d / 2)), dbs = pos(I.dbs, 10), legs = pos(I.legs, 2);
  const L = clamp((12 * h) / 1000, 3, 10);
  const g = governing(R, /shear|section/i);
  const fi = failInfo(g, 'a diagonal tension crack opens near the support and the beam drops along it');
  const vc = 0.17 * Math.sqrt(fc), Av = legs * Ab(dbs), H = h / 1000;
  return rcBeam({ b: bw, h, d, n: 3, db: 25, fc, fy: 420, Mu: (Vu * L) / 4 }, { diagram: { b: bw, h, d, n: 3, db: 25 }, checks: [] }, 'singly', {
    L, s, dbs, failKind: 'shear', failInfo: fi,
    stress: {
      label: 'Shear stress τ (and stirrup stress)', q: 'stress',
      f(x, y, z, part, lam) {
        const V = Vu * lam * vShape(x, L) * 1000;
        if (part.role === 'st') { const vs = V / (bw * d) - vc; return vs > 0 ? Math.min(fyt, (vs * bw * s) / Av) : 0; }
        if (part.mat !== 'concrete') return 0;
        return 1.5 * (V / (bw * h)) * (1 - ((2 * y - H) / H) ** 2);
      }
    }
  });
}

function oneWaySlab(I, R) {
  const D = R.diagram || {};
  const span = m(I.span, 3600), h = pos(D.h, pos(I.h, 150)), d = pos(D.d, pos(I.d, h - 30)), dbm = pos(D.dbm, pos(I.dbm, 12)), dbt = pos(D.dbt, pos(I.dbt, 10));
  const s = pos(D.s, 200), sT = pos(D.sT, 250), fc = pos(I.fc, 21), fy = pos(I.fy, 280), Mu = pos(I.Mu, 15);
  const H = h / 1000, W = 1.0, cant = I.support === 'cantilever';
  const g = governing(R, /flexur/i);
  const fi = failInfo(g, 'the main bars yield and a crack opens across the strip');
  const splitX = fi ? (cant ? 0.05 : span / 2) : null;
  const yMain = (h - d) / 1000, yT = cant ? H - (h - d) / 1000 - (dbm + dbt) / 2000 : yMain + (dbm + dbt) / 2000;
  const mainY = cant ? H - (h - d) / 1000 : yMain;
  const bars = [];
  for (let z = -W / 2 + s / 2000; z < W / 2; z += s / 1000) bars.push({ y: mainY, z, r: dbm / 2000, role: 'tb' });
  const parts = beamParts({ L: span, secs: [[0, H, -W / 2, W / 2]], mat: 'concrete', bars, splitX, ny: 6, nz: 10 });
  const tparts = { A: [], B: [] };
  for (let x = sT / 2000; x < span; x += sT / 1000) tparts[splitX && x > splitX ? 'B' : 'A'].push(CY([x, yT, -W / 2 + 0.03], [x, yT, W / 2 - 0.03], dbt / 2000, 1, 6));
  Object.keys(tparts).forEach((k) => { if (tparts[k].length) parts.push(P(tparts[k], 'rebar', { piece: k, inner: true, role: 'tt' })); });
  if (cant) parts.splice(parts.findIndex((p) => p.piece === 'S'), 1, P(BX(-0.4, 0, -0.4, H + 0.4, -W / 2, W / 2), 'support', { piece: 'S', stress: false }));
  const As = (Ab(dbm) * 1000) / s, cs = cracked(1000, d, As, fc), kd = cs.kd / 1000;
  const mx = (x) => (cant ? (1 - x / span) ** 2 : mShape(x, span));
  return finish({
    parts, hasRebar: true, loads: beamLoads(span, H, 4),
    stress: { label: 'Flexural stress |σ| (cracked section)', q: 'stress', f(x, y, z, part, lam) {
      const M = Mu * lam * mx(x) * 1e6;
      if (part.role === 'tb') return Math.min(fy, (cs.n * M * (d - cs.kd)) / cs.Icr);
      if (part.role === 'tt') return 0;
      const yc = cant ? kd - y : y - (H - kd);
      return yc > 0 ? Math.min(0.85 * fc, (M * yc * 1000) / cs.Icr) : 0;
    } },
    cracks: fi ? [-0.3, -0.15, 0, 0.15, 0.3].map((k) => ({ pts: [[splitX + k * span * 0.5, cant ? H + 0.002 : -0.002, -W / 2], [splitX + k * span * 0.5 + 0.01, cant ? H + 0.002 : -0.002, 0], [splitX + k * span * 0.5, cant ? H + 0.002 : -0.002, W / 2]], at: 0.3 + Math.abs(k), piece: 'A' })) : [],
    disp: cant
      ? (x, y, z, part, sx) => { if (part.piece === 'S') return [0, 0, 0]; const xi = clamp(x / span, 0, 1); let dy = -(span / 25) * curve(sx.r) * (xi * xi * (3 - xi)) / 2; if (sx.brk) dy += rot(x, y, 0.05, H, -0.4 * sx.brk)[1]; return [0, dy, 0]; }
      : beamDisp({ L: span, h: H, amp: span / 40, fail: fi ? 'flex' : null, xs: splitX }),
    ampText: 'Deflections are exaggerated. A one metre wide strip is drawn.'
  }, fi);
}

function columnModel(I, R, mode) {
  const D = R.diagram || {};
  const fc = pos(I.fc, 28), fy = pos(I.fy, 420);
  const circ = (I.shape || D.shape) === 'circular' || (I.shape || D.shape) === 'circle' || (I.detail === 'spiral');
  let b = pos(D.b, pos(I.b, 400)), hh = pos(D.h, pos(I.h, b));
  if (mode === 'ties') { b = hh = pos(I.least, 400); }
  const Dm = pos(D.D, pos(I.D, 500));
  const bw = circ ? Dm : b, bh = circ ? Dm : hh;
  const Hc = mode === 'slenderness' ? clamp(m(I.lu, 3000), 1.5, 12) : 3.0;
  const n = mode === 'interaction' && Array.isArray(I.layers) ? 0 : pos(D.n, pos(I.n, mode === 'ties' ? 8 : 6));
  const db = pos(D.db, pos(I.db, 25)), cover = pos(I.cover, 40), dt = pos(I.dt, pos(I.dsp, 10));
  const parts = [], X = bw / 2000, Z = bh / 2000;
  const ny = sg(Hc, 0.08, 10, 60);
  if (circ) parts.push(P(CY([0, 0, 0], [0, Hc, 0], Dm / 2000, ny, 28), 'concrete', { role: 'body' }));
  else parts.push(P(BX(-X, X, 0, Hc, -Z, Z, [6, ny, 6]), 'concrete', { role: 'body' }));
  // Bars
  const bars = [];
  const c = (cover + dt + db / 2) / 1000;
  if (mode === 'interaction' && Array.isArray(I.layers) && I.layers.length) {
    I.layers.forEach((ly) => { const k = Math.max(2, Math.round(ly.As / Ab(db))); const xx = -X + ly.d / 1000; for (let i = 0; i < k; i++) bars.push([xx, -Z + c + ((2 * Z - 2 * c) * i) / (k - 1)]); });
  } else if (circ) {
    for (let i = 0; i < n; i++) { const a = (2 * PI * i) / n, r = Dm / 2000 - c; bars.push([r * Math.cos(a), r * Math.sin(a)]); }
  } else {
    const per = Math.max(2, Math.round(n / 4) + 1), pts = [];
    for (let i = 0; i < per; i++) { const u = -1 + (2 * i) / (per - 1); pts.push([u * (X - c), -(Z - c)], [u * (X - c), Z - c]); }
    for (let i = 1; i < per - 1; i++) { const u = -1 + (2 * i) / (per - 1); pts.push([-(X - c), u * (Z - c)], [X - c, u * (Z - c)]); }
    const want = Math.max(4, Math.round(n));
    // keep corners, then add the rest in order
    bars.push(...pts.slice(0, want));
  }
  bars.forEach(([x, z]) => parts.push(P(CY([x, 0.03, z], [x, Hc - 0.03, z], db / 2000, ny, 8), 'rebar', { inner: true, role: 'bar', bx: x })));
  // Ties or spiral
  const sTie = pos(I.sProv, Math.min(16 * db, 48 * dt, Math.min(bw, bh))) / 1000;
  const tie = [], rt = dt / 2000, ci = (cover + dt / 2) / 1000;
  for (let y = 0.05; y < Hc - 0.02; y += Math.max(sTie, Hc / 70)) {
    if (circ) { const r = Dm / 2000 - ci, k = 16; for (let i = 0; i < k; i++) { const a0 = (2 * PI * i) / k, a1 = (2 * PI * (i + 1)) / k; tie.push(CY([r * Math.cos(a0), y, r * Math.sin(a0)], [r * Math.cos(a1), y + 0.004, r * Math.sin(a1)], rt, 1, 5)); } }
    else { const a = X - ci, bz = Z - ci; tie.push(CY([-a, y, -bz], [a, y, -bz], rt, 1, 5), CY([a, y, -bz], [a, y, bz], rt, 1, 5), CY([a, y, bz], [-a, y, bz], rt, 1, 5), CY([-a, y, bz], [-a, y, -bz], rt, 1, 5)); }
  }
  parts.push(P(tie, 'rebar', { inner: true, role: 'tie' }));
  parts.push(P([BX(-X - 0.25, X + 0.25, -0.25, 0, -Z - 0.25, Z + 0.25)], 'support', { piece: 'S', stress: false }));
  // Loads and stress
  const Ag = circ ? Ab(Dm) : bw * bh, Ig = circ ? (PI * Dm ** 4) / 64 : (bh * bw ** 3) / 12;
  let Pu = pos(I.Pu, NaN), Mu = Math.abs(num(I.Mu, num(I.M2, 0)));
  if (mode === 'slenderness') Mu = Math.abs(rv(R, /^Mc$/, Mu));
  if (!isFinite(Pu)) Pu = 0.3 * fc * Ag / 1000;
  const nm = 200000 / Ec(fc);
  const stress = mode === 'ties' ? null : {
    label: Mu ? 'Axial and bending stress |σ| (gross section)' : 'Axial stress σ', q: 'stress',
    f(x, y, z, part, lam) {
      const sc = lam * ((Pu * 1000) / Ag + (Mu * 1e6 * x * 1000) / Ig);
      if (part.role === 'bar') return Math.min(fy, Math.abs(sc) * nm);
      if (part.role === 'tie') return 0;
      return Math.min(0.85 * fc, Math.abs(sc));
    }
  };
  // Failure
  let fi = null, kind = 'crush';
  if (mode === 'slenderness') {
    const Pc = rv(R, /^Pc$/, NaN);
    if (isFinite(Pc) && Pc > 0) { kind = 'buckle'; fi = { lamEnd: clamp(Pc / Pu, 0.05, 50), fails: true, failText: 'Buckles as Pu approaches the critical load Pc = ' + Math.round(Pc) + ' kN (' + (Pc / Pu).toFixed(2) + ' × Pu)' }; }
  } else if (mode !== 'ties') {
    const g = governing(R, /axial|interaction|strength/i);
    fi = failInfo(g, 'the concrete crushes, the cover spalls and the bars buckle between ties');
  }
  const yc = Hc * 0.55, zone = Math.max(bw, bh) / 1000 * 1.2;
  const cracks = [];
  if (fi && kind === 'crush') for (let k = -2; k <= 2; k++) cracks.push({ pts: [[X + 0.002, yc - zone * 0.6, (k * Z) / 3], [X + 0.002, yc, (k * Z) / 3 + 0.01], [X + 0.002, yc + zone * 0.6, (k * Z) / 3]], brk: 0.05 + Math.abs(k) * 0.05 });
  return finish({
    parts, hasRebar: true, stress, cracks, noAnim: mode === 'ties',
    loads: [{ p: [0, Hc, 0], dir: [0, -1, 0], len: 0.5 }],
    disp(x, y, z, part, s) {
      if (part.piece === 'S') return [0, 0, 0];
      const g = curve(s.r), eta = clamp(y / Hc, 0, 1);
      let dx = 0, dy = -0.01 * Hc * g * eta, dz = 0;
      const bow = kind === 'buckle' ? Hc / 25 : Mu ? Hc / 80 : 0;
      dx += bow * g * Math.sin(PI * eta);
      if (s.brk) {
        if (kind === 'buckle') { dx += 0.18 * Hc * s.brk * Math.sin(PI * eta); dy -= 0.1 * Hc * s.brk * eta; }
        else {
          const w = clamp(1 - Math.abs(y - yc) / zone, 0, 1);
          const out = 0.35 * s.brk * w * (part.role === 'tie' ? 0.5 : 1);
          dx += x * out + (part.role === 'bar' ? Math.sign(x || 1) * 0.04 * s.brk * w : 0); dz += z * out;
          if (y > yc) dy -= 0.25 * zone * s.brk; else dy -= 0.25 * zone * s.brk * (1 - (yc - y) / zone) * (y > yc - zone ? 1 : 0);
        }
      }
      return [dx, dy, dz];
    },
    ampText: mode === 'slenderness' ? 'Lateral deflection is exaggerated. Braced column of height ℓu.' : 'Movements are exaggerated. A 3 m column length is drawn.',
    note: mode === 'ties' ? 'Bars and ties to the entered sizes and spacing.' : ''
  }, fi);
}

function development(I, R, mode) {
  const D = R.diagram || {};
  const db = pos(D.db, pos(I.db, 25)), ld = pos(D.length, 600) / 1000, fy = pos(I.fy, 420);
  const hook = mode === 'hooks', lap = mode === 'laps';
  const blockL = ld + 0.15, Hb = Math.max(0.3, hook ? pos(D.ext, 12 * db) / 1000 + 0.15 : 0.3), Wb = 0.3;
  const yBar = Hb - 0.08, parts = [];
  parts.push(P(BX(0, blockL, 0, Hb, -Wb / 2, Wb / 2, [sg(blockL, 0.05, 4, 40), 6, 4]), 'concrete', { role: 'body', stress: false }));
  const r = db / 2000;
  if (lap) {
    parts.push(P(CY([-0.4, yBar, -r * 1.1], [ld, yBar, -r * 1.1], r, 30, 10), 'rebar', { inner: true, role: 'bar', piece: 'A' }));
    parts.push(P(CY([0, yBar, r * 1.1], [blockL + 0.4, yBar, r * 1.1], r, 30, 10), 'rebar', { inner: true, role: 'bar2', piece: 'B' }));
  } else {
    const geoms = [CY([-0.4, yBar, 0], [ld, yBar, 0], r, 30, 10)];
    if (hook) { const ext = pos(D.ext, 12 * db) / 1000; geoms.push(CY([ld, yBar, 0], [ld, yBar - ext, 0], r, 6, 10)); }
    parts.push(P(geoms, 'rebar', { inner: true, role: 'bar', piece: 'A' }));
  }
  const avail = pos(I.available, NaN) / 1000;
  const short = isFinite(avail) && avail < ld;
  const fi = short ? { lamEnd: avail / ld, fails: true, failText: 'The bar pulls out at ' + Math.round((100 * avail) / ld) + '% of fy: the available length is shorter than ' + (hook ? 'ℓdh' : 'ℓd') } : null;
  const cracks = [];
  for (let k = 0; k < 6; k++) { const x = (k / 6) * ld; cracks.push({ pts: [[x, Hb + 0.002, -0.01], [x + ld / 8, Hb + 0.002, 0.01], [x + ld / 6, Hb + 0.002, 0]], at: 0.5 + k * 0.08, piece: 'C' }); }
  return finish({
    parts, hasRebar: true, cracks: short ? cracks : [],
    loads: [mode === 'compression' ? { p: [-0.02, yBar, 0], dir: [1, 0, 0], len: 0.25, piece: 'A' } : { p: [-0.45, yBar, 0], dir: [-1, 0, 0], len: 0.25, piece: 'A' }],
    stress: { label: 'Bar stress fs along the development length', q: 'stress', f(x, y, z, part, lam) {
      if (part.role === 'bar') return Math.min(fy, lam * fy * clamp(1 - x / ld, 0, 1));
      if (part.role === 'bar2') return Math.min(fy, lam * fy * clamp(x / ld, 0, 1));
      return 0;
    } },
    disp(x, y, z, part, s) {
      const g = s.r;
      if (part.piece === 'A') return [-0.004 * g - (s.brk ? 0.5 * ld * s.brk : 0), 0, 0];
      if (part.piece === 'B') return [0.004 * g + (s.brk && lap ? 0.5 * ld * s.brk : 0), 0, 0];
      return [0, s.brk && part.crack ? 0.002 : 0, 0];
    },
    lamEnd: 1,
    ampText: short ? 'The bar is pulled to the stress it can develop in the available length.' : 'The bar is pulled to fy: with the full development length it yields before it can pull out.'
  }, fi);
}

function serviceability(I, R, mode) {
  if (mode !== 'deflection') return null;
  const D = R.diagram || {};
  const b = pos(I.b, 300), h = pos(I.h, 500), d = pos(I.d, 440), As = pos(I.As, 1500), fc = pos(I.fc, 28), L = m(I.span, 6000);
  const n = Math.max(2, Math.round(As / Ab(25)));
  const w = pos(I.wD, 0) + pos(I.wL, 0);
  const Ma = w ? (w * L * L) / 8 : pos(I.MaDL, 100);
  const g = (R.checks || []).find((c) => /attachment|deflection/i.test(c.name));
  const model = rcBeam({ b, h, d, n, db: 25, fc, fy: 420, Mu: Ma, ln: L * 1000 }, { diagram: { b, h, d, n, db: 25 }, checks: [] }, 'singly', { L, amp: Math.max(L / 60, (num(D.after, 10) / 1000) * 25), failInfo: null });
  model.ampText = 'Deflection drawn about 25 times the computed value under service load.' + (g ? ' ' + g.name + ': D/C ' + g.dc.toFixed(2) + (g.dc > 1 ? ' (exceeds the limit)' : '') + '.' : '');
  model.stress.label = 'Flexural stress |σ| under service load';
  return model;
}

function shearWall(I, R, mode) {
  const t = pos(I.h, 200), lw = m(I.lw, 4000), hw = m(I.hw, 3000), fc = pos(I.fc, 28), fy = pos(I.fy, 420);
  const T = t / 1000, Vu = pos(I.Vu, 0), Pu = pos(I.Pu, 0), Mu = pos(I.Mu, 0), curt = pos(I.curtains, 2);
  const D = R.diagram || {};
  const sV = pos(I.sV, 300) / 1000, sH = pos(D.sT, pos(I.s, 300)) / 1000, dbV = pos(I.dbV, 12) / 2000, dbH = pos(I.dbH, 12) / 2000, cov = pos(I.cover, 25) / 1000;
  const parts = [P(BX(0, lw, 0, hw, -T / 2, T / 2, [sg(lw, 0.15, 8, 40), sg(hw, 0.15, 8, 40), 3]), 'concrete', { role: 'body' })];
  const zs = curt >= 2 ? [-T / 2 + cov + dbH * 2 + dbV, T / 2 - cov - dbH * 2 - dbV] : [0];
  const v = [], hz = [];
  zs.forEach((z) => {
    for (let x = 0.08; x < lw - 0.04; x += Math.max(sV, lw / 40)) v.push(CY([x, 0.03, z], [x, hw - 0.03, z], dbV, 16, 6));
    for (let y = 0.1; y < hw - 0.04; y += Math.max(sH, hw / 40)) hz.push(CY([0.03, y, z + Math.sign(z || 1) * (dbV + dbH)], [lw - 0.03, y, z + Math.sign(z || 1) * (dbV + dbH)], dbH, 16, 6));
  });
  parts.push(P(v, 'rebar', { inner: true, role: 'v' }), P(hz, 'rebar', { inner: true, role: 'h' }));
  parts.push(P(BX(-0.3, lw + 0.3, -0.3, 0, -T / 2 - 0.3, T / 2 + 0.3), 'support', { piece: 'S', stress: false }));
  const flex = mode === 'axial';
  const g = governing(R, flex ? /axial|combined/i : /shear|section/i);
  const fi = failInfo(g, flex ? 'the compression toe crushes and the wall rocks' : 'diagonal tension cracks cross the wall and the upper part slides along them');
  const tau = (Vu * 1000) / (lw * 1000 * t), A = lw * 1000 * t, Iw = (t * (lw * 1000) ** 3) / 12;
  const cracks = [];
  if (!flex) for (let k = 0; k < 6; k++) { const o = (k - 2.5) * 0.18 * lw; cracks.push({ pts: [[clamp(o, 0, lw), hw, T / 2 + 0.002], [clamp(o + 0.5 * lw, 0, lw), hw * 0.5, T / 2 + 0.002], [clamp(o + lw, 0, lw), 0, T / 2 + 0.002]].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0]), at: 0.45 + Math.abs(k - 2.5) * 0.08 }); }
  else for (let k = 0; k < 5; k++) cracks.push({ pts: [[0, 0.3 + k * 0.4 * hw / 2, T / 2 + 0.002], [0.4 * lw, 0.25 + k * 0.4 * hw / 2, T / 2 + 0.002]], at: 0.4 + k * 0.1 });
  return finish({
    parts, hasRebar: true, cracks: cracks.filter((c) => c.pts.length > 1),
    loads: [{ p: [0, hw - 0.2, 0], dir: [1, 0, 0], len: 0.6, always: true }, { p: [lw / 2, hw, 0], dir: [0, -1, 0], len: 0.5 }],
    stress: mode === 'minimum' && !Vu ? null : flex
      ? { label: 'Axial and in-plane bending stress |σ|', q: 'stress', f(x, y, z, part, lam) { const sc = lam * ((Pu * 1000) / A + (Mu * 1e6 * (lw / 2 - x) * 1000) / Iw); return part.mat === 'concrete' ? Math.min(0.85 * fc, Math.abs(sc)) : Math.min(fy, Math.abs(sc) * 7); } }
      : { label: 'In-plane shear stress τ', q: 'stress', f(x, y, z, part, lam) { return part.mat === 'concrete' ? lam * 1.5 * tau * (1 - (2 * x / lw - 1) ** 2) : 0; } },
    disp(x, y, z, part, s) {
      if (part.piece === 'S') return [0, 0, 0];
      const eta = clamp(y / hw, 0, 1);
      let dx = (hw / 60) * curve(s.r) * Math.pow(eta, 1.4), dy = 0;
      if (s.brk) {
        if (!flex) { if (y + (hw * x) / lw > hw) { dx += 0.1 * lw * s.brk; dy -= 0.05 * hw * s.brk; } else dx += 0.02 * lw * s.brk * eta; }
        else { const r = rot(x, y, lw, 0, -0.12 * s.brk); dx += r[0]; dy += r[1]; if (x > lw * 0.85 && y < 0.6) { dy -= 0.05 * s.brk; } }
      }
      return [dx, dy, 0];
    },
    ampText: 'Drift is exaggerated. Lateral load at the top of the wall.'
  }, fi);
}

function twoWaySlab(I, R, mode) {
  const D = R.diagram || {};
  if (mode === 'punching') {
    const c1 = m(I.c1, 500), c2 = m(I.c2, 500), d = pos(I.d, 160), h = (d + 30) / 1000, l1 = Math.min(m(I.l1 * 1000, 6000), 6), l2 = Math.min(m(I.l2 * 1000, 5000), 6);
    const Lx = Math.min(l1, 4), Lz = Math.min(l2, 4);
    const Vu = rv(R, /^Vu$/, pos(I.Vu, 300)), b0 = rv(R, /^bo$/, 2 * (c1 + c2) * 1000 + 4 * d);
    const g = governing(R, /punch/i);
    const fi = failInfo(g, 'the slab punches through around the column along a sloping crack');
    const a = c1 / 2 + d / 1000, bz = c2 / 2 + d / 1000;
    const xs = [-Lx / 2, -a, a, Lx / 2], zs = [-Lz / 2, -bz, bz, Lz / 2];
    const parts = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const inner = i === 1 && j === 1;
      parts.push(P(BX(xs[i], xs[i + 1], 0, h, zs[j], zs[j + 1], [sg(xs[i + 1] - xs[i], 0.12, 2, 20), 3, sg(zs[j + 1] - zs[j], 0.12, 2, 20)]), 'concrete', { piece: inner ? 'P' : 'O', role: 'body' }));
    }
    parts.push(P(BX(-c1 / 2, c1 / 2, -1.2, 0, -c2 / 2, c2 / 2, [2, 8, 2]), 'concrete', { piece: 'C', role: 'col', stress: false }));
    const top = h - 0.03, bars = [];
    for (let z = -Lz / 2 + 0.1; z < Lz / 2; z += 0.2) bars.push(CY([-Lx / 2 + 0.03, top, z], [Lx / 2 - 0.03, top, z], 0.006, 24, 6));
    for (let x = -Lx / 2 + 0.1; x < Lx / 2; x += 0.2) bars.push(CY([x, top - 0.012, -Lz / 2 + 0.03], [x, top - 0.012, Lz / 2 - 0.03], 0.006, 24, 6));
    parts.push(P(bars, 'rebar', { inner: true, role: 'mat' }));
    const vAt = (r) => (Vu * 1000) / ((2 * (c1 + c2) * 1000 + 8 * r * 1000) * d);
    const cracks = [];
    [[-a, -bz], [a, -bz], [a, bz], [-a, bz]].forEach((p, i, arr) => { const q = arr[(i + 1) % 4]; cracks.push({ pts: [[p[0], h + 0.002, p[1]], [q[0], h + 0.002, q[1]]], at: 0.6, piece: 'O' }); });
    for (let k = 0; k < 8; k++) { const an = (k * PI) / 4; cracks.push({ pts: [[Math.cos(an) * c1 / 2, h + 0.002, Math.sin(an) * c2 / 2], [Math.cos(an) * Lx * 0.4, h + 0.002, Math.sin(an) * Lz * 0.4]], at: 0.75, piece: 'O' }); }
    return finish({
      parts, hasRebar: true, cracks, loads: [{ p: [Lx * 0.35, h, Lz * 0.35], dir: [0, -1, 0], len: 0.3 }, { p: [-Lx * 0.35, h, -Lz * 0.35], dir: [0, -1, 0], len: 0.3 }],
      stress: { label: 'Punching shear stress around the column', q: 'stress', f(x, y, z, part, lam) { if (part.mat !== 'concrete') return 0; const r = Math.max(0, Math.abs(x) - c1 / 2, Math.abs(z) - c2 / 2); return lam * vAt(Math.max(r, d / 2000)); } },
      disp(x, y, z, part, s) {
        if (part.piece === 'C') return [0, 0, 0];
        const g = curve(s.r), r = Math.hypot(x / Lx, z / Lz);
        let dy = -0.05 * g * clamp(r * 2, 0, 1.4) ** 1.5;
        if (s.brk && part.piece !== 'P') dy -= 0.35 * s.brk;
        return [0, dy, 0];
      },
      ampText: 'Movements are exaggerated. Slab region around one column; the column carries the slab from below.'
    }, fi);
  }
  // thickness and moments: a panel on four columns
  const l1 = mode === 'moments' ? pos(I.l1, 6) : m(I.ln, 5600) + 0.5, l2 = mode === 'moments' ? pos(I.l2, 5) : l1;
  const h = pos(I.h, pos(D.h, 200)) / 1000, c1 = m(I.c1, 500), c2 = m(I.c2, 500);
  const parts = [P(BX(0, l1, 0, h, 0, l2, [sg(l1, 0.15, 10, 40), 3, sg(l2, 0.15, 10, 40)]), 'concrete', { role: 'body' })];
  [[0, 0], [l1, 0], [0, l2], [l1, l2]].forEach(([x, z]) => parts.push(P(BX(x - c1 / 2, x + c1 / 2, -2.5, 0, z - c2 / 2, z + c2 / 2), 'concrete', { piece: 'S', role: 'col', stress: false })));
  const bars = [];
  for (let z = 0.15; z < l2; z += 0.25) bars.push(CY([0.03, 0.03, z], [l1 - 0.03, 0.03, z], 0.006, 30, 6));
  for (let x = 0.15; x < l1; x += 0.25) bars.push(CY([x, 0.045, 0.03], [x, 0.045, l2 - 0.03], 0.006, 30, 6));
  parts.push(P(bars, 'rebar', { inner: true, role: 'mat' }));
  const Mo = rv(R, /^Mo$/, NaN), neg = rv(R, /column strip, negative/i, NaN), csw = rv(R, /column strip width/i, l2 / 2);
  const hasM = mode === 'moments' && isFinite(neg);
  const sMax = hasM ? (6 * (neg * 1e6) / (csw * 1000)) / (h * 1000) ** 2 : 1;
  const field = (x, z) => {
    const dc = Math.min(Math.hypot(x, z), Math.hypot(l1 - x, z), Math.hypot(x, l2 - z), Math.hypot(l1 - x, l2 - z));
    return Math.max(Math.exp(-((dc / (0.18 * Math.min(l1, l2))) ** 2)), 0.45 * Math.sin((PI * x) / l1) * Math.sin((PI * z) / l2), 0.55 * Math.exp(-((Math.min(z, l2 - z) / (0.12 * l2)) ** 2)) * Math.abs(Math.sin(PI * x / l1)) * 0.6);
  };
  return finish({
    parts, hasRebar: true, cracks: [],
    loads: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7], [0.3, 0.7], [0.7, 0.3]].map(([u, w]) => ({ p: [u * l1, h, w * l2], dir: [0, -1, 0], len: 0.4 })),
    stress: hasM ? { label: 'Slab bending stress |σ| (strip moments, illustrative spread)', q: 'stress', f(x, y, z, part, lam) { if (part.mat !== 'concrete') return 0; return lam * sMax * field(x, z) * Math.abs(2 * y / h - 1); } } : null,
    disp(x, y, z, part, s) { if (part.piece === 'S') return [0, 0, 0]; const g = curve(s.r); const w = Math.sin(PI * x / l1) ** 2 * 0.5 + Math.sin(PI * z / l2) ** 2 * 0.5 + Math.sin(PI * x / l1) * Math.sin(PI * z / l2); return [0, -(Math.min(l1, l2) / 60) * g * w / 2, 0]; },
    ampText: 'Deflection is exaggerated. Interior panel on four columns.' + (isFinite(Mo) ? ' Mo = ' + Math.round(Mo) + ' kN·m.' : ''),
    note: mode === 'thickness' ? 'Panel drawn at the minimum thickness from Table 408.3.1.1.' : ''
  }, null);
}

// ================================================================== steel
function iSection(dsec, bf, tf, tw) {
  const d = dsec / 1000, B = bf / 1000, F = tf / 1000, W = tw / 1000;
  return { d, B, F, W, secs: [[0, F, -B / 2, B / 2, 'flange'], [F, d - F, -W / 2, W / 2, 'web'], [d - F, d, -B / 2, B / 2, 'flange']] };
}
function steelBeamParts(L, S, splitX, extra) {
  const iv = splitX ? [[0, splitX, 'A'], [splitX, L, 'B']] : [[0, L, 'A']];
  const parts = [];
  iv.forEach(([a, b, pc]) => S.secs.forEach((s) => parts.push(P(BX(a, b, s[0], s[1], s[2], s[3], [sg(b - a, L / 48, 2, 48), s[4] === 'web' ? 8 : 1, s[4] === 'web' ? 1 : 4]), 'steel', { piece: pc, role: s[4] }))));
  if (!extra || !extra.noSupports) parts.push(P([BX(-0.1, 0.1, -0.08, 0, -S.B / 2 - 0.03, S.B / 2 + 0.03), BX(L - 0.1, L + 0.1, -0.08, 0, -S.B / 2 - 0.03, S.B / 2 + 0.03)], 'support', { piece: 'S', stress: false }));
  return parts;
}
function shapeDims(I, D) {
  const dsec = pos(D.dsec, pos(I.dsec, 250)), bf = pos(D.bf, pos(I.bf, 0.6 * dsec));
  const tf = pos(D.tf, pos(I.tf, pos(I.t, bf / 16))), tw = pos(D.tw, pos(I.tw, tf * 0.6));
  return { dsec, bf, tf, tw };
}

function steelBeams(I, R, mode) {
  const D = R.diagram || {};
  const { dsec, bf, tf, tw } = shapeDims(I, D), S = iSection(dsec, bf, tf, tw), Fy = pos(I.Fy, 345);
  const Ix = pos(I.Ix, (bf * dsec ** 3) / 12 * 0.6);
  if (mode === 'shear') {
    const V = pos(I.V, 100), L = clamp(10 * S.d, 2, 6);
    const g = governing(R, /shear/i), fi = failInfo(g, 'the web yields in shear and ripples');
    const tau = (V * 1000) / (dsec * tw);
    return finish({
      parts: steelBeamParts(L, S), hasRebar: false, cracks: [], loads: beamLoads(L, S.d, 3),
      stress: { label: 'Shear stress τ in the web', q: 'stress', f(x, y, z, part, lam) { const v = vShape(x, L); return part.role === 'web' ? Math.min(0.6 * Fy, lam * tau * v * (1.1 - 0.2 * ((2 * y - S.d) / S.d) ** 2)) : lam * tau * v * 0.08; } },
      disp: beamDisp({ L, h: S.d, amp: L / 80, fail: fi ? 'web' : null, xs: L / 2 }),
      ampText: 'Movements are exaggerated. Beam drawn with the shear at the supports.'
    }, fi);
  }
  const L = mode === 'deflection' ? m(I.span, 6000) : clamp(Math.max(pos(I.Lb, 0) / 1000, 12 * S.d), 2, 12);
  const Mr = mode === 'deflection' ? (pos(I.load, 10) * L * L) / 8 : pos(I.Mreq, pos(I.Mmax, 50));
  const ltb = mode === 'flexure' && pos(D.Lb, pos(I.Lb, 0)) > pos(D.Lp, Infinity);
  let fi = null;
  if (mode === 'flexure') fi = failInfo(governing(R, /flexur/i), ltb ? 'the compression flange buckles sideways and the beam twists (lateral-torsional buckling)' : 'a plastic hinge forms at midspan and the flanges buckle locally');
  const g = mode === 'deflection' ? (R.checks || []).find((c) => /deflection/i.test(c.name)) : null;
  const model = finish({
    parts: steelBeamParts(L, S), hasRebar: false, cracks: [], loads: beamLoads(L, S.d),
    stress: { label: 'Bending stress |σ| = M y / I', q: 'stress', f(x, y, z, part, lam) { return Math.min(Fy, (lam * Mr * 1e6 * mShape(x, L) * Math.abs(y - S.d / 2) * 1000) / Ix); } },
    disp: beamDisp({ L, h: S.d, amp: mode === 'deflection' ? Math.max(L / 60, num(rv(R, /^Δ$/, 10), 10) / 1000 * 20) : L / 60, fail: fi ? (ltb ? null : 'hinge') : null, xs: L / 2, ltb: ltb ? 0.25 : 0 }),
    ampText: mode === 'deflection' ? 'Deflection drawn about 20 times the computed value.' + (g ? ' Deflection D/C ' + g.dc.toFixed(2) + (g.dc > 1 ? ' (exceeds the limit).' : '.') : '') : 'Movements are exaggerated. Simple span with uniform load, drawn for illustration.'
  }, fi);
  return model;
}

// Vertical W-shape column: flanges across z (depth along z), width along x.
function wColumn(S, Hc) {
  const ny = sg(Hc, 0.08, 10, 60), parts = [], d = S.d, B = S.B, F = S.F, W = S.W;
  parts.push(P(BX(-B / 2, B / 2, 0, Hc, -d / 2, -d / 2 + F, [4, ny, 1]), 'steel', { role: 'flange' }));
  parts.push(P(BX(-B / 2, B / 2, 0, Hc, d / 2 - F, d / 2, [4, ny, 1]), 'steel', { role: 'flange' }));
  parts.push(P(BX(-W / 2, W / 2, 0, Hc, -d / 2 + F, d / 2 - F, [1, ny, 6]), 'steel', { role: 'web' }));
  parts.push(P(BX(-B / 2 - 0.1, B / 2 + 0.1, -0.06, 0, -d / 2 - 0.1, d / 2 + 0.1), 'support', { piece: 'S', stress: false }));
  return parts;
}
function compression(I, R) {
  const D = R.diagram || {};
  const { dsec, bf, tf, tw } = shapeDims(I, D), S = iSection(dsec, bf, tf, tw);
  const Hc = clamp(Math.max(pos(I.Lx, 0), pos(I.Ly, 0)) / 1000 || 4, 1.5, 12), Pn = pos(I.P, 500), Ag = pos(I.Ag, 2 * bf * tf + dsec * tw), Fy = pos(I.Fy, 345);
  const weak = (D.axis || 'y') === 'y';
  const fi = failInfo(governing(R), 'the column buckles sideways (flexural buckling about the ' + (weak ? 'weak' : 'strong') + ' axis)');
  return finish({
    parts: wColumn(S, Hc), hasRebar: false, cracks: [], loads: [{ p: [0, Hc, 0], dir: [0, -1, 0], len: 0.5 }],
    stress: { label: 'Axial stress σ = P / A', q: 'stress', f(x, y, z, part, lam) { return Math.min(Fy, (lam * Pn * 1000) / Ag); } },
    disp(x, y, z, part, s) { if (part.piece === 'S') return [0, 0, 0]; const eta = clamp(y / Hc, 0, 1), b = (Hc / 200) * curve(s.r) + 0.15 * Hc * s.brk; const w = b * Math.sin(PI * eta); return weak ? [w, -0.002 * Hc * s.r - 0.05 * Hc * s.brk * eta, 0] : [0, -0.002 * Hc * s.r - 0.05 * Hc * s.brk * eta, w]; },
    ampText: 'Lateral deflection is exaggerated. Pinned ends, length ' + Hc.toFixed(1) + ' m.'
  }, fi);
}
function beamColumns(I, R, mode) {
  const D = R.diagram || {};
  const { dsec, bf, tf, tw } = shapeDims(I, D), S = iSection(dsec, bf, tf, tw);
  const Hc = clamp(pos(I.Lx, pos(I.K1L, 4000)) / 1000, 1.5, 12);
  const Pr = mode === 'amplify' ? rv(R, /^Pr$/, pos(I.Pnt, 500)) : pos(I.Pr, 500);
  const Mr = mode === 'amplify' ? rv(R, /^Mr$/, pos(I.M2, 50)) : pos(I.Mrx, 0);
  const Ag = pos(I.Ag, 2 * bf * tf + dsec * tw), Ix = pos(I.Ix, 1e8), Fy = pos(I.Fy, 345);
  let fi = null;
  if (mode === 'amplify') { const Pe = rv(R, /^Pe1$/, NaN); if (isFinite(Pe)) fi = { lamEnd: clamp(Pe / Pr, 0.05, 50), fails: true, failText: 'Buckles as Pr approaches Pe1 = ' + Math.round(Pe) + ' kN (' + (Pe / Pr).toFixed(2) + ' × Pr)' }; }
  else fi = failInfo(governing(R), 'the member bows and yields under combined axial load and bending');
  return finish({
    parts: wColumn(S, Hc), hasRebar: false, cracks: [], loads: [{ p: [0, Hc, 0], dir: [0, -1, 0], len: 0.5 }],
    stress: { label: 'Combined stress |σ| = P / A + M y / I', q: 'stress', f(x, y, z, part, lam) { const mz = mode === 'amplify' ? 1 : Math.abs(1 - 2 * Math.abs(y / Hc - 0.5)) * 0.5 + 0.5; return Math.min(Fy, Math.abs(lam * ((Pr * 1000) / Ag + (Mr * mz * 1e6 * z * 1000) / Ix))); } },
    disp(x, y, z, part, s) { if (part.piece === 'S') return [0, 0, 0]; const eta = clamp(y / Hc, 0, 1); return [0, -0.003 * Hc * s.r - 0.05 * Hc * s.brk * eta, ((Hc / 100) * curve(s.r) + 0.15 * Hc * s.brk) * Math.sin(PI * eta)]; },
    ampText: 'Bending about the strong axis; deflection exaggerated.'
  }, fi);
}

function tension(I, R, mode) {
  const D = R.diagram || {};
  const Fy = pos(I.Fy, 248), Pn = pos(I.P, 300);
  if (mode === 'block') {
    const lines = pos(I.lines, 2), nper = pos(I.nPerLine, 3), pitch = m(I.pitch, 75), end = m(I.end, 40), gauge = m(I.gauge, 75), t = m(I.t, 12), db = m(I.bolt, 20);
    const W = (lines - 1) * gauge + 2 * 0.05, Lb = (nper - 1) * pitch + end, Lp = Lb + 0.3;
    const zs = []; for (let i = 0; i < lines; i++) zs.push(-((lines - 1) * gauge) / 2 + i * gauge);
    const z0 = zs[0], z1 = zs[zs.length - 1];
    const parts = [
      P(BX(0, Lp - Lb, 0, t, -W / 2, W / 2, [8, 1, 6]), 'steel', { piece: 'M', role: 'plate' }),
      P(BX(Lp - Lb, Lp, 0, t, -W / 2, z0, [6, 1, 2]), 'steel', { piece: 'M', role: 'plate' }),
      P(BX(Lp - Lb, Lp, 0, t, z1, W / 2, [6, 1, 2]), 'steel', { piece: 'M', role: 'plate' }),
      P(BX(Lp - Lb, Lp, 0, t, z0, z1, [6, 1, 4]), 'steel', { piece: 'K', role: 'block' })
    ];
    const bolts = [];
    zs.forEach((z) => { for (let k = 0; k < nper; k++) { const x = Lp - end - k * pitch; bolts.push(CY([x, -0.02, z], [x, t + 0.03, z], db / 2, 1, 12)); } });
    parts.push(P(bolts, 'bolt', { piece: 'K', role: 'bolt', stress: false }));
    const fi = failInfo(governing(R), 'the bolted block tears out (shear along the bolt lines, tension across the end)');
    const sig = (Pn * 1000) / (W * 1000 * t * 1000);
    return finish({
      parts, hasRebar: false, cracks: [], loads: [{ p: [-0.05, t / 2, 0], dir: [-1, 0, 0], len: 0.2, piece: 'M' }],
      stress: { label: 'Plate stress |σ|', q: 'stress', f(x, y, z, part, lam) { const near = part.piece === 'K' || Math.abs(Math.abs(z - (z0 + z1) / 2) - (z1 - z0) / 2) < 0.02 && x > Lp - Lb ? 2.2 : 1; return Math.min(Fy, lam * sig * near); } },
      disp(x, y, z, part, s) { if (part.piece === 'K') return [0.002 * s.r, 0, 0]; return [-0.002 * s.r - 0.6 * Lb * s.brk, 0, 0]; },
      ampText: 'The gusset is pulled to the left; the bolts are held at the right.'
    }, fi);
  }
  const { dsec, bf, tf, tw } = shapeDims(I, D), S = iSection(dsec, bf, tf, tw);
  const L = 2.0, Ag = pos(I.Ag, 2 * bf * tf + dsec * tw), Lc = Math.max(0.15, m(I.Lconn, 150));
  const g = governing(R, /yield|rupture/i);
  const rupture = g && /rupture/i.test(g.name);
  const fi = failInfo(g, rupture ? 'the net section through the end bolts fractures' : 'the gross section yields and the member stretches');
  const splitX = rupture ? L - Lc - 0.05 : null;
  const parts = steelBeamParts(L, S, splitX, { noSupports: true });
  const bolts = { A: [], B: [] }, nb = 3, db = m(I.bolt, 20);
  [0.05, L - 0.05 - Lc].forEach((x0) => { for (let k = 0; k < nb; k++) { const x = x0 + (k * Lc) / (nb - 1); [-S.B / 4, S.B / 4].forEach((z) => [[0, S.F], [S.d - S.F, S.d]].forEach(([ya, yb]) => (bolts[splitX && x > splitX ? 'B' : 'A']).push(CY([x, ya - 0.015, z], [x, yb + 0.015, z], db / 2, 1, 10)))); } });
  Object.keys(bolts).forEach((k) => bolts[k].length && parts.push(P(bolts[k], 'bolt', { piece: k, stress: false })));
  const Ae = Ag * pos(rv(R, /^U$/, 0.85), 0.85) * 0.85;
  return finish({
    parts, hasRebar: false, cracks: [], loads: [{ p: [-0.05, S.d / 2, 0], dir: [-1, 0, 0], len: 0.3, piece: 'A' }, { p: [L + 0.05, S.d / 2, 0], dir: [1, 0, 0], len: 0.3, piece: 'B' }],
    stress: { label: 'Axial stress σ (gross body, net section at the bolts)', q: 'stress', f(x, y, z, part, lam) { const atEnd = x < 0.05 + Lc + 0.05 || x > L - 0.1 - Lc; return Math.min(pos(I.Fu, 400), (lam * Pn * 1000) / (atEnd ? Ae : Ag)); } },
    disp(x, y, z, part, s) {
      const e = 0.004 * s.r;
      let dx = (x - L / 2) * e;
      if (s.brk) { if (rupture) dx += part.piece === 'B' ? 0.08 * s.brk : -0.02 * s.brk; else dx += (x - L / 2) * 0.08 * s.brk; }
      let dy = 0, dz = 0;
      if (!rupture && s.brk && Math.abs(x - L / 2) < 0.3) { const k = (1 - Math.abs(x - L / 2) / 0.3) * 0.2 * s.brk; dy = -(y - S.d / 2) * k; dz = -z * k; }
      return [dx, dy, dz];
    },
    ampText: 'Elongation is exaggerated. Bolted at both ends.'
  }, fi);
}

function bolted(I, R, mode) {
  const t = m(I.t, 12), db = m(I.bolt, 20), V = pos(mode === 'eccentric' ? I.P : I.V, 100), Fu = pos(I.Fu, 400);
  let pts;
  if (mode === 'eccentric') {
    if (I.layout === 'points' && Array.isArray(I.points) && I.points.length) pts = I.points.map((p) => [p.x / 1000, p.y / 1000]);
    else { pts = []; const rows = pos(I.rows, 3), cols = pos(I.cols, 2); for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) pts.push([j * m(I.gauge, 100), i * m(I.pitch, 75)]); }
  } else { pts = []; const lines = pos(I.lines, 2), per = pos(I.perLine, 2), s = m(I.s, 75); for (let i = 0; i < lines; i++) for (let j = 0; j < per; j++) pts.push([i * s, j * s]); }
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  pts = pts.map(([x, z]) => [x - cx, z - cz]);
  const Le = m(I.Le, 40), xmin = Math.min(...pts.map((p) => p[0])) - Le, xmax = Math.max(...pts.map((p) => p[0])) + Le;
  const zmin = Math.min(...pts.map((p) => p[1])) - Le, zmax = Math.max(...pts.map((p) => p[1])) + Le;
  const ext = 0.35;
  const parts = [
    P(BX(xmin - ext, xmax, 0, t, zmin, zmax, [24, 1, 10]), 'steel', { piece: 'A', role: 'plate' }),
    P(BX(xmin, xmax + ext, t, 2 * t, zmin, zmax, [24, 1, 10]), 'steel', { piece: 'B', role: 'plate' })
  ];
  const n = pts.length, J = pts.reduce((a, p) => a + p[0] ** 2 + p[1] ** 2, 0) || 1, e = mode === 'eccentric' ? m(I.ex, 200) : 0;
  const lower = [], upper = [];
  pts.forEach(([x, z]) => {
    lower.push(CY([x, -0.012, z], [x, t, z], db / 2, 2, 12), CY([x, -0.012 - db * 0.6, z], [x, -0.012, z], db * 0.85, 1, 6));
    upper.push(CY([x, t, z], [x, 2 * t + 0.012, z], db / 2, 2, 12), CY([x, 2 * t + 0.012, z], [x, 2 * t + 0.012 + db * 0.7, z], db * 0.85, 1, 6));
  });
  parts.push(P(lower, 'bolt', { piece: 'A', role: 'bolt' }), P(upper, 'bolt', { piece: 'B', role: 'bolt' }));
  const g = governing(R, /shear|bearing|slip|bolt/i);
  const kind = !g ? null : /bolt shear|critical bolt/i.test(g.name) ? 'shear' : /bearing/i.test(g.name) ? 'bearing' : 'slip';
  const fi = failInfo(g, kind === 'shear' ? 'the bolts shear off at the faying plane and the plates separate' : kind === 'bearing' ? 'the bolt holes tear and elongate in bearing' : 'the joint slips');
  const Abolt = Ab(db * 1000), sig0 = (V * 1000) / ((zmax - zmin) * 1000 * t * 1000);
  const boltStress = (x, z) => { const r = Math.hypot(x, z); return (V * 1000) / (n * Abolt) + (e ? (V * 1000 * e * r) / (J * Abolt) : 0); };
  const near = (x, z) => Math.min(...pts.map((p) => Math.hypot(x - p[0], z - p[1])));
  return finish({
    parts, hasRebar: false, cracks: [],
    loads: mode === 'eccentric' ? [{ p: [xmax + e, 2 * t + 0.1, 0], dir: [0, 0, -1], len: 0.2, piece: 'B' }] : [{ p: [xmax + ext, 1.5 * t, 0], dir: [1, 0, 0], len: 0.2, piece: 'B' }, { p: [xmin - ext, 0.5 * t, 0], dir: [-1, 0, 0], len: 0.2, piece: 'A' }],
    stress: { label: 'Bolt shear stress and plate stress', q: 'stress', f(x, y, z, part, lam) {
      if (part.role === 'bolt') { let best = pts[0]; pts.forEach((p) => { if (Math.hypot(x - p[0], z - p[1]) < Math.hypot(x - best[0], z - best[1])) best = p; }); return lam * boltStress(best[0], best[1]); }
      return Math.min(Fu, lam * sig0 * (1 + 2.5 * Math.exp(-((near(x, z) / (db * 1.2)) ** 2))));
    } },
    disp(x, y, z, part, s) {
      const sl = 0.0015 * s.r;
      if (mode === 'eccentric') { if (part.piece !== 'B') return [0, 0, 0]; const a = -(0.01 * s.r + 0.5 * s.brk), r = rot(x, z, 0, 0, a); return [r[0], kind === 'shear' ? 0.05 * s.brk : 0, r[1]]; }
      if (part.piece === 'B') return [sl + (kind === 'bearing' ? 0.6 * Le : 0.08) * s.brk, kind === 'shear' ? 0.02 * s.brk : 0, 0];
      return [-sl - (kind === 'shear' ? 0.05 * s.brk : 0), 0, 0];
    },
    ampText: 'Slip and movements are exaggerated. Lap joint, single shear plane.'
  }, fi);
}

function welded(I, R, mode) {
  const w = m(I.w, 8), t = m(I.t, 10), Fy = pos(I.Fy, 248), Pn = pos(I.P, 200), FEXX = pos(I.FEXX, 480);
  const groove = mode === 'groove';
  if (groove) {
    const Lw = m(I.Lw, 200), L = 0.35;
    const parts = [P(BX(-L, 0, 0, t, -Lw / 2, Lw / 2, [12, 1, 8]), 'steel', { piece: 'A', role: 'plate' }), P(BX(0.008, L, 0, t, -Lw / 2, Lw / 2, [12, 1, 8]), 'steel', { piece: 'B', role: 'plate' }), P(BX(-0.004, 0.012, -0.001, t + 0.002, -Lw / 2, Lw / 2, [1, 1, 8]), 'weld', { piece: 'W', role: 'weld' })];
    const fi = failInfo(governing(R), 'the joint fractures through the weld');
    const sig = (Pn * 1000) / (Lw * 1000 * t * 1000);
    return finish({ parts, hasRebar: false, cracks: [], loads: [{ p: [L + 0.02, t / 2, 0], dir: [1, 0, 0], len: 0.15, piece: 'B' }],
      stress: { label: 'Normal stress σ = P / (t ℓw)', q: 'stress', f(x, y, z, part, lam) { return Math.min(FEXX, lam * sig * (part.role === 'weld' ? 1.15 : 1)); } },
      disp(x, y, z, part, s) { return part.piece === 'B' ? [0.001 * s.r + 0.05 * s.brk, 0, 0] : part.piece === 'W' ? [0.0005 * s.r + 0.025 * s.brk, -0.01 * s.brk, 0] : [0, 0, 0]; },
      ampText: 'Butt joint with a complete joint penetration weld.' }, fi);
  }
  const nL = pos(I.nLong, 2), Ll = m(I.Llong, 150), Lt = m(I.Ltrans, 0), Wb = Math.max(Lt, 0.12), ext = 0.3;
  const parts = [P(BX(-ext, Ll, 0, t, -Wb / 2 - 0.06, Wb / 2 + 0.06, [16, 1, 8]), 'steel', { piece: 'A', role: 'plate' }), P(BX(0, Ll + ext, t, 2 * t, -Wb / 2, Wb / 2, [16, 1, 6]), 'steel', { piece: 'B', role: 'plate' })];
  const welds = [];
  if (nL >= 1) welds.push(BX(0, Ll, t, t + w, -Wb / 2 - w, -Wb / 2, [8, 1, 1]));
  if (nL >= 2) welds.push(BX(0, Ll, t, t + w, Wb / 2, Wb / 2 + w, [8, 1, 1]));
  if (Lt > 0) welds.push(BX(-w, 0, t, t + w, -Wb / 2, Wb / 2, [1, 1, 6]));
  parts.push(P(welds, 'weld', { piece: 'W', role: 'weld' }));
  const g = governing(R, /weld|base/i), fi = failInfo(g, g && /base/i.test(g.name) ? 'the base metal tears along the weld' : 'the fillet welds shear through their throat and the plate pulls off');
  const Lsum = nL * Ll + Lt, tauW = (Pn * 1000) / (0.707 * w * 1000 * Lsum * 1000), sigP = (Pn * 1000) / (Wb * 1000 * t * 1000);
  const ecc = mode === 'eccentric' ? m(I.ex, 250) : 0;
  return finish({ parts, hasRebar: false, cracks: [], loads: ecc ? [{ p: [Ll + ext, 2 * t + 0.08, 0], dir: [0, 0, -1], len: 0.15, piece: 'B' }] : [{ p: [Ll + ext + 0.02, 1.5 * t, 0], dir: [1, 0, 0], len: 0.15, piece: 'B' }],
    stress: { label: 'Weld throat stress and plate stress', q: 'stress', f(x, y, z, part, lam) { if (part.role === 'weld') return lam * tauW * (ecc ? 1 + (ecc * Math.hypot(x - Ll / 2, z)) / (Ll * Ll / 4 + Wb * Wb / 4) * 0.5 : 1); return Math.min(Fy, lam * sigP * (x > 0 && x < Ll ? 0.6 + 0.4 * x / Ll : 1)); } },
    disp(x, y, z, part, s) {
      if (part.piece !== 'B') return [0, 0, 0];
      if (ecc) { const r = rot(x - Ll / 2, z, 0, 0, -(0.01 * s.r + 0.4 * s.brk)); return [r[0], 0.04 * s.brk, r[1]]; }
      return [0.001 * s.r + 0.07 * s.brk, 0.02 * s.brk, 0];
    },
    ampText: 'Lap joint with fillet welds; movements exaggerated.' }, fi);
}

function basePlate(I, R, mode) {
  const D = R.diagram || {};
  const B = m(D.B, pos(I.B, 400)), N = m(D.N, pos(I.N, 400)), Bs = m(D.Bs, pos(I.Bs, 600)), Ns = m(D.Ns, pos(I.Ns, 600));
  const dsec = pos(D.d, pos(I.dsec, 250)), bf = pos(D.bf, pos(I.bf, 250)), S = iSection(dsec, bf, bf / 18, bf / 30);
  const t = m(I.tProv, NaN) || rv(R, /^t.*req|tmin|required/i, 25) / 1000 || 0.025, Hp = 0.7, P0 = pos(I.P, 1000), Fy = pos(I.Fy, 248), fc = pos(I.fc, 21);
  const parts = [];
  parts.push(P(BX(-Ns / 2, Ns / 2, -Hp, 0, -Bs / 2, Bs / 2, [10, 10, 10]), 'concrete', { piece: 'F', role: 'ped' }));
  parts.push(P(BX(-N / 2, N / 2, 0, t, -B / 2, B / 2, [14, 2, 14]), 'steel', { piece: 'P', role: 'plate' }));
  const Hc = 0.7, d = S.d, bfm = S.B;
  parts.push(P([BX(-d / 2, -d / 2 + S.F, t, t + Hc, -bfm / 2, bfm / 2, [1, 6, 4]), BX(d / 2 - S.F, d / 2, t, t + Hc, -bfm / 2, bfm / 2, [1, 6, 4]), BX(-d / 2 + S.F, d / 2 - S.F, t, t + Hc, -S.W / 2, S.W / 2, [4, 6, 1])], 'steel', { piece: 'C', role: 'col' }));
  const nR = pos(I.nRods, 4), rr = m(I.rod, 24) / 2, ax = N / 2 - 0.05, az = B / 2 - 0.05;
  const rodPts = nR >= 4 ? [[-ax, -az], [ax, -az], [ax, az], [-ax, az]] : [[0, -az], [0, az]];
  const rods = [];
  rodPts.forEach(([x, z]) => rods.push(CY([x, -0.45, z], [x, t + 0.05, z], rr, 6, 10), CY([x, t, z], [x, t + 0.03, z], rr * 2, 1, 6)));
  parts.push(P(rods, 'rebar', { piece: 'R', inner: true, role: 'rod', mat2: 'steel' }));
  const fp = (P0 * 1000) / (B * N * 1e6);
  const mC = (N - 0.95 * d) / 2, nC = (B - 0.8 * bfm) / 2, ell = Math.max(mC, nC, 0.01);
  const sMax = Math.min(Fy, (3 * fp * (ell * 1000) ** 2) / (t * 1000) ** 2);
  const As = 2 * bfm * S.F + d * S.W;
  const g = governing(R, mode === 'anchors' ? /anchor|rod|tension|shear/i : mode === 'bearing' ? /bearing/i : /thickness|bearing/i);
  const kind = !g ? null : /bearing/i.test(g.name) ? 'bearing' : /thickness/i.test(g.name) ? 'plate' : 'rods';
  const fi = failInfo(g, kind === 'bearing' ? 'the concrete under the plate crushes and the plate sinks' : kind === 'plate' ? 'the plate yields and bends up at its edges' : 'the anchor rods yield and pull out');
  const Tt = pos(I.T, 0), Ar = Ab(rr * 2000);
  const cracks = kind === 'bearing' ? [0, 1, 2, 3].map((k) => { const a = (k * PI) / 2 + PI / 4; return { pts: [[Math.cos(a) * N / 2 * 1.2, 0.002, Math.sin(a) * B / 2 * 1.2], [Math.cos(a) * Ns / 2, 0.002, Math.sin(a) * Bs / 2], [Math.cos(a) * Ns / 2, -0.3, Math.sin(a) * Bs / 2]], at: 0.7, piece: 'F' }; }) : [];
  return finish({
    parts, hasRebar: true, cracks, loads: [{ p: [0, t + Hc + 0.02, 0], dir: [0, -1, 0], len: 0.3, piece: 'C' }],
    stress: { label: 'Plate bending, column and bearing stress', q: 'stress', f(x, y, z, part, lam) {
      if (part.role === 'col') return Math.min(Fy, (lam * P0 * 1000) / (As * 1e6));
      if (part.role === 'rod') return Tt ? Math.min(pos(I.Fu, 400), (lam * Tt * 1000) / (nR * Ar)) : 0;
      if (part.role === 'ped') { const dep = -y; const inside = Math.abs(x) < N / 2 + dep && Math.abs(z) < B / 2 + dep; return inside ? Math.min(0.85 * fc * 2, (lam * fp * (B * N)) / ((B + 2 * dep) * (N + 2 * dep))) : 0; }
      const u = Math.max(Math.abs(x) - 0.95 * d / 2, Math.abs(z) - 0.8 * bfm / 2);
      if (u <= 0) return lam * sMax * 0.5;
      return Math.min(Fy, lam * sMax * (1 - u / ell) ** 2);
    } },
    disp(x, y, z, part, s) {
      const g2 = curve(s.r);
      if (part.piece === 'F') { const inside = Math.abs(x) < N / 2 && Math.abs(z) < B / 2; return [0, inside ? -(0.004 * g2 + (kind === 'bearing' ? 0.06 * s.brk : 0)) * clamp(1 + y / 0.3, 0, 1) : 0, 0]; }
      let dy = -0.004 * g2 - (kind === 'bearing' ? 0.06 * s.brk : 0);
      if (part.piece === 'P') { const u = Math.max(Math.abs(x) - 0.95 * d / 2, Math.abs(z) - 0.8 * bfm / 2, 0); dy += (0.01 * g2 + (kind === 'plate' ? 0.15 * s.brk : 0)) * (u / ell) ** 2 * ell; }
      if (kind === 'rods' && s.brk && Tt) dy += 0.1 * s.brk;
      if (part.piece === 'R') return [0, kind === 'rods' && Tt ? 0.1 * s.brk : 0, 0];
      return [0, dy, 0];
    },
    ampText: 'Movements are exaggerated. Column on a base plate over a concrete pedestal.'
  }, fi);
}

// ================================================================== foundations
// Footing on soil: the footing bottom is at y = 0. q(x, z) is the contact pressure (kPa).
function footing(o) {
  const { Lx, Bz, h, cols, q, splitX = [], splitZ = [], pieceOf, kind } = o;
  const xs = [-Lx / 2, ...splitX.filter((v) => v > -Lx / 2 && v < Lx / 2).sort((a, b) => a - b), Lx / 2];
  const zs = [-Bz / 2, ...splitZ.filter((v) => v > -Bz / 2 && v < Bz / 2).sort((a, b) => a - b), Bz / 2];
  const parts = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const pc = pieceOf ? pieceOf((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2) : 'F';
    parts.push(P(BX(xs[i], xs[i + 1], 0, h, zs[j], zs[j + 1], [sg(xs[i + 1] - xs[i], 0.12, 2, 30), 3, sg(zs[j + 1] - zs[j], 0.12, 2, 30)]), 'concrete', { piece: pc, role: 'body' }));
  }
  const colH = o.colH || 0.9;
  cols.forEach((c) => parts.push(P(BX(c.x - c.c1 / 2, c.x + c.c1 / 2, h, h + colH, c.z - c.c2 / 2, c.z + c.c2 / 2, [2, 6, 2]), 'concrete', { piece: pieceOf ? pieceOf(c.x, c.z) : 'F', role: 'col', stress: false })));
  // Bottom bars
  const yb = 0.075 + (o.db || 20) / 2000, r = (o.db || 20) / 2000;
  const barSeg = (x0, x1, y, z, along) => {
    const cuts = (along === 'x' ? xs : zs).slice(1, -1).filter((v) => v > Math.min(x0, x1) && v < Math.max(x0, x1));
    const pts = [x0, ...cuts, x1], out = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const mid = (pts[k] + pts[k + 1]) / 2, pc = pieceOf ? (along === 'x' ? pieceOf(mid, z) : pieceOf(z, mid)) : 'F';
      out.push({ pc, g: along === 'x' ? CY([pts[k], y, z], [pts[k + 1], y, z], r, sg(pts[k + 1] - pts[k], 0.15, 1, 20), 6) : CY([z, y, pts[k]], [z, y, pts[k + 1]], r, sg(pts[k + 1] - pts[k], 0.15, 1, 20), 6) });
    }
    return out;
  };
  const bars = [], nL = Math.min(o.nL || Math.round(Bz / 0.2), 40), nB = Math.min(o.nB || Math.round(Lx / 0.2), 60);
  for (let k = 0; k < nL; k++) { const z = -Bz / 2 + 0.075 + ((Bz - 0.15) * k) / Math.max(nL - 1, 1); bars.push(...barSeg(-Lx / 2 + 0.075, Lx / 2 - 0.075, yb, z, 'x')); }
  for (let k = 0; k < nB; k++) { const x = -Lx / 2 + 0.075 + ((Lx - 0.15) * k) / Math.max(nB - 1, 1); bars.push(...barSeg(-Bz / 2 + 0.075, Bz / 2 - 0.075, yb + 2 * r, x, 'z')); }
  const byP = {};
  bars.forEach((b) => (byP[b.pc] = byP[b.pc] || []).push(b.g));
  Object.keys(byP).forEach((k) => parts.push(P(byP[k], 'rebar', { piece: k, inner: true, role: 'bar', stress: false })));
  // Soil block under the footing
  const ext = Math.max(Lx, Bz) * 0.35, Ds = o.soilDepth || Math.max(Lx, Bz) * 0.9;
  // Soil is cut on the centre line (z = 0) so the section under the footing shows the stress bulb.
  parts.push(P(BX(-Lx / 2 - ext, Lx / 2 + ext, -Ds, 0, -Bz / 2 - ext, 0, [24, 16, 8]), 'soil', { piece: 'soil', role: 'soil' }));
  const qAvg = o.qAvg;
  const sz = (x, y, z) => {
    // 2:1 spread of the local contact pressure, fading outside the spread zone.
    const dep = -y, wx = Lx + dep, wz = Bz + dep;
    const base = (qAvg * Lx * Bz) / (wx * wz);
    const ox = Math.max(0, Math.abs(x) - wx / 2), oz = Math.max(0, Math.abs(z) - wz / 2);
    const local = dep < Lx * 0.3 ? q(clamp(x, -Lx / 2, Lx / 2), clamp(z, -Bz / 2, Bz / 2)) / qAvg : 1;
    return base * (dep < Lx * 0.3 ? local * (1 - dep / (Lx * 0.3)) + (dep / (Lx * 0.3)) : 1) * Math.exp(-(ox + oz) / (0.25 * Math.max(Lx, Bz)));
  };
  const S0 = o.settle || Math.max(Lx, Bz) / 60;
  const stress = { label: o.label || 'Soil pressure and stress below the footing', q: 'pressure', f(x, y, z, part, lam) { return part.role === 'soil' ? lam * sz(x, y, z) : lam * q(x, z); } };
  const tilt = o.tilt || 0;
  const disp = (x, y, z, part, s) => {
    const g = curve(s.r), b = s.brk;
    const qq = q(clamp(x, -Lx / 2, Lx / 2), clamp(z, -Bz / 2, Bz / 2)) / qAvg;
    if (part.role === 'soil') {
      let dy = -S0 * g * sz(x, Math.min(y, -0.01), z) / qAvg * (y > -0.05 ? 1 : 1);
      if (kind === 'bearing' && b) { const ox = Math.max(Math.abs(x) - Lx / 2, Math.abs(z) - Bz / 2); if (ox > 0 && y > -0.3 * Lx) dy += 0.25 * h * b * Math.exp(-(((ox - 0.4 * Lx) / (0.3 * Lx)) ** 2)) * (1 + y / (0.3 * Lx)); else if (ox <= 0) dy -= 0.6 * h * b * Math.exp(y / Lx); }
      return [0, dy, 0];
    }
    let dy = -S0 * g * (tilt ? qq : 1), dx = 0;
    if (b) {
      if (kind === 'bearing') { dy -= 0.6 * h * b; const r2 = rot(x, y, 0, 0, 0.06 * b); dx += r2[0]; dy += r2[1]; }
      else if (kind === 'punch' && part.piece === 'C') dy -= 0.8 * h * b;
      else if (kind === 'flex' || kind === 'shear') {
        if (part.piece === 'W' || part.piece === 'E') { const sgn = part.piece === 'W' ? -1 : 1, px = o.hinge[part.piece]; const r2 = rot(x, y, px, kind === 'flex' ? h : 0, sgn * 0.12 * b); dx += r2[0]; dy += r2[1] + (kind === 'shear' ? 0.4 * h * b : 0); }
        if (part.piece === 'C') dy -= 0.3 * h * b;
      }
    }
    return [dx, dy, 0];
  };
  return { parts, stress, disp };
}

function footFail(R, cols, c1, c2, d, prefer) {
  const g = governing(R, prefer);
  if (!g) return { g: null };
  const n = g.name;
  if (/two-way|punch/i.test(n)) return { g, kind: 'punch', what: 'the column punches through the footing along a sloping crack' };
  if (/one-way|shear/i.test(n)) return { g, kind: 'shear', what: 'a diagonal crack opens at d from the column face and the footing edges shear off' };
  if (/flexur|moment/i.test(n)) return { g, kind: 'flex', what: 'the bottom bars yield and the footing cracks at the column face' };
  return { g, kind: 'bearing', what: 'the soil fails in bearing: the footing sinks and tilts and the ground heaves beside it' };
}
function footingCracks(kind, xs, h, Bz, Lx) {
  if (kind === 'flex' || kind === 'shear') return xs.map((x) => ({ pts: [[x, 0.002, -Bz / 2 - 0.002], [x + (kind === 'shear' ? (x > 0 ? 1 : -1) * 0.5 * h : 0), h * 0.9, -Bz / 2 - 0.002]], at: 0.75, piece: x > 0 ? 'E' : 'W' }));
  if (kind === 'punch') { const a = xs[1], out = []; [[-a, -a], [a, -a], [a, a], [-a, a]].forEach((p, i, arr) => { const q = arr[(i + 1) % 4]; out.push({ pts: [[p[0], h + 0.002, p[1]], [q[0], h + 0.002, q[1]]], at: 0.8, piece: 'O' }); }); return out; }
  return [];
}

function isolated(I, R) {
  const D = R.diagram || {};
  const Lx = pos(D.L, pos(I.L, 2)), Bz = pos(D.B, pos(I.B, Lx)), h = m(D.h, pos(I.h, 500)), d = m(D.d, h * 1000 - 90);
  const c1 = m(D.c1, pos(I.c1, 400)), c2 = m(D.c2, pos(I.c2, 400));
  const qmax = pos(D.quMax, pos(D.qu, 200)), qmin = num(D.quMin, qmax), qAvg = (qmax + qmin) / 2;
  const q = (x) => qmin + ((qmax - qmin) * (x + Lx / 2)) / Lx;
  const ff = footFail(R, null, c1, c2, d);
  const fi = failInfo(ff.g, ff.what);
  let splitX = [], splitZ = [], pieceOf = null, hinge = {};
  if (fi && ff.kind === 'punch') { splitX = [-c1 / 2 - d / 2, c1 / 2 + d / 2]; splitZ = [-c2 / 2 - d / 2, c2 / 2 + d / 2]; pieceOf = (x, z) => (Math.abs(x) < c1 / 2 + d / 2 && Math.abs(z) < c2 / 2 + d / 2 ? 'C' : 'O'); }
  else if (fi && (ff.kind === 'flex' || ff.kind === 'shear')) { const a = c1 / 2 + (ff.kind === 'shear' ? d : 0); splitX = [-a, a]; pieceOf = (x) => (x < -a ? 'W' : x > a ? 'E' : 'C'); hinge = { W: -a, E: a }; }
  const f = footing({ Lx, Bz, h, cols: [{ x: 0, z: 0, c1, c2 }], q, qAvg, splitX, splitZ, pieceOf, kind: fi ? ff.kind : null, hinge, nL: D.nL, nB: D.nB, db: pos(I.db, 20), tilt: qmax !== qmin });
  return finish({ parts: f.parts, hasRebar: true, stress: f.stress, disp: f.disp, cracks: fi ? footingCracks(ff.kind, splitX.length ? splitX : [c1 / 2], h, Bz, Lx) : [], loads: [{ p: [0, h + 0.9, 0], dir: [0, -1, 0], len: 0.5, piece: pieceOf ? pieceOf(0, 0) : 'F' }],
    ampText: 'Settlement and movements are exaggerated. Factored soil pressure under the footing.' }, fi);
}
function wallFooting(I, R) {
  const D = R.diagram || {};
  const Lx = pos(D.B, 1.5), Bz = 1.0, h = m(D.h, pos(I.h, 350)), t = m(D.t, pos(I.t, 300)), d = m(D.d, h * 1000 - 80), qu = pos(D.qu, 150);
  const ff = footFail(R, null, t, Bz, d);
  const fi = failInfo(ff.g, ff.what);
  let splitX = [], pieceOf = null, hinge = {};
  if (fi && (ff.kind === 'flex' || ff.kind === 'shear' || ff.kind === 'punch')) { const a = t / 2 + (ff.kind === 'flex' ? (D.masonry ? t / 4 : 0) : d); splitX = [-a, a]; pieceOf = (x) => (x < -a ? 'W' : x > a ? 'E' : 'C'); hinge = { W: -a, E: a }; }
  const kind = fi ? (ff.kind === 'punch' ? 'shear' : ff.kind) : null;
  const f = footing({ Lx, Bz, h, cols: [{ x: 0, z: 0, c1: t, c2: Bz }], colH: 1.2, q: () => qu, qAvg: qu, splitX, pieceOf, kind, hinge, nL: 5, nB: Math.round(Lx / (pos(D.s, 250) / 1000)), db: pos(I.db, 16) });
  return finish({ parts: f.parts, hasRebar: true, stress: f.stress, disp: f.disp, cracks: fi ? footingCracks(kind, splitX, h, Bz, Lx) : [], loads: [{ p: [0, h + 1.2, 0], dir: [0, -1, 0], len: 0.5, piece: pieceOf ? 'C' : 'F' }], view: [0.6, 0.5, 1.4],
    ampText: 'A one metre length of wall footing is drawn. Movements exaggerated.' }, fi);
}
function combined(I, R, mode) {
  const D = R.diagram || {};
  const L = pos(D.L, 6), x0 = -L / 2, xA = x0 + pos(D.xA, 0.2), xB = x0 + pos(D.xB, L - 0.3);
  const Bz = Math.max(pos(D.widthA, 2), pos(D.widthB, 2)), h = m(I.h, 800), d = m(D.d, h * 1000 - 90);
  const cA = m(D.cA, 400), cB = m(D.cB, 500);
  const qa = pos(I.qa, 200);
  const sp = (R.checks || []).find((c) => /soil/i.test(c.name)), qAvg = sp ? sp.dc * qa : qa * 0.8;
  const ff = footFail(R, null, cA, cA, d);
  const fi = failInfo(ff.g, ff.what);
  let splitX = [], splitZ = [], pieceOf = null, hinge = {};
  const atB = ff.g && /at B/.test(ff.g.name), xc = atB ? xB : xA, cc = atB ? cB : cA;
  if (fi && ff.kind === 'punch') { splitX = [xc - cc / 2 - d / 2, xc + cc / 2 + d / 2]; splitZ = [-cc / 2 - d / 2, cc / 2 + d / 2]; pieceOf = (x, z) => (Math.abs(x - xc) < cc / 2 + d / 2 && Math.abs(z) < cc / 2 + d / 2 ? 'C' : 'O'); }
  else if (fi && (ff.kind === 'flex' || ff.kind === 'shear')) { const a = xB - cB / 2 - (ff.kind === 'shear' ? d : 0); splitX = [a]; pieceOf = (x) => (x < a ? 'C' : 'E'); hinge = { E: a, W: a }; }
  const strap = mode === 'strap';
  const cols = [{ x: xA, z: 0, c1: cA, c2: cA }, { x: xB, z: 0, c1: cB, c2: cB }];
  const f = footing({ Lx: L, Bz, h, cols, q: () => qAvg, qAvg, splitX, splitZ, pieceOf, kind: fi ? ff.kind : null, hinge, db: pos(I.db, 25) });
  if (strap) f.parts.push(P(BX(xA, xB, h, h + 0.6, -0.2, 0.2, [12, 2, 1]), 'concrete', { piece: pieceOf ? pieceOf(0, 0) : 'F', role: 'col', stress: false }));
  return finish({ parts: f.parts, hasRebar: true, stress: f.stress, disp: f.disp, cracks: fi ? footingCracks(ff.kind, splitX, h, Bz, L) : [], loads: cols.map((c) => ({ p: [c.x, h + 0.9, 0], dir: [0, -1, 0], len: 0.5, piece: pieceOf ? pieceOf(c.x, 0) : 'F' })),
    ampText: (strap ? 'Strap footing drawn as one footing with a strap beam. ' : '') + 'Uniform soil pressure for the resultant at the centroid. Movements exaggerated.' }, fi);
}
function mat(I, R) {
  const D = R.diagram || {};
  const Bz = pos(D.B, 10), Lx = pos(D.Lm, 16), h = 0.8;
  const cs = D.corners || [];
  const qAt = (x, z) => {
    if (cs.length < 3) return 50;
    // plane through the corner pressures (rigid mat, q = a + b x + c y)
    const n = cs.length, mx = cs.reduce((a, c) => a + c.x, 0) / n, my = cs.reduce((a, c) => a + c.y, 0) / n, mq = cs.reduce((a, c) => a + c.q, 0) / n;
    let sxx = 0, syy = 0, sxq = 0, syq = 0; cs.forEach((c) => { sxx += (c.x - mx) ** 2; syy += (c.y - my) ** 2; sxq += (c.x - mx) * (c.q - mq); syq += (c.y - my) * (c.q - mq); });
    return mq + (sxx ? (sxq / sxx) * (z - mx) : 0) + (syy ? (syq / syy) * (x - my) : 0);
  };
  const qs = cs.map((c) => c.q), qAvg = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 50;
  const fi = failInfo(governing(R, /soil/i), 'the soil under the most loaded corner fails and the mat tilts');
  const cols = (D.cols || []).map((c) => ({ x: c.y, z: c.x, c1: 0.5, c2: 0.5 }));
  const f = footing({ Lx, Bz, h, cols, colH: 1.2, q: (x, z) => Math.max(0, qAt(x, z)), qAvg, kind: fi ? 'bearing' : null, nL: 30, nB: 40, db: 25, tilt: true, settle: Lx / 120, soilDepth: Lx * 0.6 });
  return finish({ parts: f.parts, hasRebar: true, stress: f.stress, disp: f.disp, cracks: [], loads: cols.map((c) => ({ p: [c.x, h + 1.2, c.z], dir: [0, -1, 0], len: 0.8, piece: 'F' })),
    ampText: 'Rigid mat: settlement follows the soil pressure. Movements exaggerated.' }, fi);
}
function dowels(I, R) {
  const D = R.diagram || {};
  const Lx = pos(D.L, pos(I.L, 2.5)), Bz = pos(D.B, pos(I.B, 2.5)), h = m(D.h, pos(I.h, 600)), c1 = m(D.c1, 400), c2 = m(D.c2, 400);
  const Pu = pos(I.Pu, 1500), fy = pos(I.fy, 420), dbD = pos(I.dbDowel, 16);
  const g = governing(R, /bearing/i), col = g && /column/i.test(g.name);
  const fi = failInfo(g, col ? 'the column concrete crushes at its base' : 'the column bears into the footing and the concrete under it crushes');
  const parts = [P(BX(-Lx / 2, Lx / 2, 0, h, -Bz / 2, Bz / 2, [16, 6, 16]), 'concrete', { piece: 'F', role: 'ftg' }), P(BX(-c1 / 2, c1 / 2, h, h + 1.2, -c2 / 2, c2 / 2, [4, 14, 4]), 'concrete', { piece: 'C', role: 'col' })];
  const ldc = pos(D.ldc, 350) / 1000, lap = pos(D.lap, 480) / 1000, cv = 0.06;
  const dw = [];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => { const x = sx * (c1 / 2 - cv), z = sz * (c2 / 2 - cv); dw.push(CY([x, Math.max(0.1, h - ldc), z], [x, h + lap, z], dbD / 2000, 10, 8)); });
  parts.push(P(dw, 'rebar', { inner: true, piece: 'C', role: 'dowel' }));
  const sigC = (Pu * 1000) / (c1 * c2 * 1e6);
  return finish({ parts, hasRebar: true, cracks: [], loads: [{ p: [0, h + 1.2, 0], dir: [0, -1, 0], len: 0.5, piece: 'C' }],
    stress: { label: 'Bearing stress at the column base', q: 'stress', f(x, y, z, part, lam) {
      if (part.role === 'col') return lam * sigC;
      if (part.role === 'dowel') return Math.min(fy, lam * sigC * 7 * clamp((y - (h - ldc)) / ldc, 0, 1));
      const dep = h - y, w1 = c1 + 4 * dep, w2 = c2 + 4 * dep;
      return Math.abs(x) < w1 / 2 && Math.abs(z) < w2 / 2 ? (lam * sigC * c1 * c2) / (w1 * w2) : 0;
    } },
    disp(x, y, z, part, s) {
      const g2 = curve(s.r);
      if (part.piece === 'C') {
        let dx = 0, dz = 0, dy = -0.003 * g2 * (y - h);
        if (s.brk) { if (col) { const w = clamp(1 - Math.abs(y - h - 0.15) / 0.3, 0, 1); dx = x * 0.4 * s.brk * w; dz = z * 0.4 * s.brk * w; dy -= 0.15 * s.brk * (y > h + 0.15 ? 1 : w); } else dy -= 0.25 * s.brk; }
        return [dx, dy, dz];
      }
      const inside = Math.abs(x) < c1 && Math.abs(z) < c2;
      return [0, inside && !col ? -0.25 * s.brk * clamp((y - h + 0.3) / 0.3, 0, 1) : 0, 0];
    },
    ampText: 'Movements are exaggerated. Column bearing on the footing, with dowels.' }, fi);
}
function pileCaps(I, R, mode) {
  const D = R.diagram || {};
  const pts = (D.pts || []).map((p) => [p.x, p.y]), Rs = D.R || [];
  const Lx = pos(D.Lc, pos(I.Lc, 2)), Bz = pos(D.B, pos(I.B, 2)), h = m(I.h, 700), dp = pos(D.dp, m(I.dp, 400)), c1 = m(D.c1, 500), c2 = m(D.c2, 500), d = m(I.d, h * 1000 - 150);
  const Lp = 4.5;
  const g = governing(R, mode === 'reactions' ? /pile/i : null);
  const kind = !g ? null : /pile load/i.test(g.name) ? 'pile' : /two-way.*column/i.test(g.name) ? 'punch' : /two-way.*pile/i.test(g.name) ? 'pile' : 'flex';
  const fi = failInfo(g, kind === 'pile' ? 'the most loaded pile plunges and the cap tilts' : kind === 'punch' ? 'the column punches through the cap' : 'the cap cracks and folds at the column face');
  let splitX = [], splitZ = [], pieceOf = null;
  if (kind === 'punch') { splitX = [-c1 / 2 - d / 2, c1 / 2 + d / 2]; splitZ = [-c2 / 2 - d / 2, c2 / 2 + d / 2]; pieceOf = (x, z) => (Math.abs(x) < c1 / 2 + d / 2 && Math.abs(z) < c2 / 2 + d / 2 ? 'C' : 'O'); }
  if (kind === 'flex') { splitX = [0]; pieceOf = (x) => (x < 0 ? 'W' : 'E'); }
  const f = footing({ Lx, Bz, h, cols: [{ x: 0, z: 0, c1, c2 }], q: () => 1, qAvg: 1, splitX, splitZ, pieceOf, kind: null, db: pos(I.db, 25), nL: 8, nB: 8 });
  const parts = f.parts.filter((p) => p.role !== 'soil');
  parts.forEach((p) => { if (p.role === 'body') p.stress = false; });
  const Rmax = Math.max(...Rs.map((r) => Math.abs(r)), 1);
  const worst = Rs.indexOf(Rs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), Rs[0] || 0));
  pts.forEach(([x, z], i) => parts.push(P(CY([x, 0.15, z], [x, -Lp, z], dp / 2, 12, 14), 'concrete', { piece: 'p' + i, role: 'pile', idx: i, solid: true })));
  parts.push(P(BX(-Lx / 2 - 1, Lx / 2 + 1, -Lp - 0.5, 0, -Bz / 2 - 1, Bz / 2 + 1, [8, 8, 8]), 'soil', { role: 'soil', stress: false }));
  const Ap = I.pileShape === 'square' ? dp * dp : (PI * dp * dp) / 4;
  const settleAt = (x, z, s) => {
    let wsum = 0, v = 0;
    pts.forEach(([px, pz], i) => { const w = 1 / (0.05 + (x - px) ** 2 + (z - pz) ** 2); wsum += w; v += w * (0.03 * curve(s.r) * (Rs[i] || 0) / Rmax + (kind === 'pile' && i === worst ? 0.5 * s.brk : 0)); });
    return wsum ? v / wsum : 0;
  };
  return finish({ parts, hasRebar: true, cracks: kind === 'flex' ? [{ pts: [[0, 0.002, -Bz / 2 - 0.002], [0.02, h * 0.5, -Bz / 2 - 0.002], [0, h * 0.85, -Bz / 2 - 0.002]], at: 0.7, piece: 'W' }] : [],
    loads: [{ p: [0, h + 0.9, 0], dir: [0, -1, 0], len: 0.5, piece: pieceOf ? pieceOf(0, 0) : 'F' }],
    stress: { label: 'Pile axial stress from the factored reactions', q: 'stress', f(x, y, z, part, lam) { return part.role === 'pile' ? Math.abs(lam * (Rs[part.idx] || 0) * 1000) / (Ap * 1e6) : 0; } },
    disp(x, y, z, part, s) {
      if (part.role === 'soil') return [0, 0, 0];
      if (part.role === 'pile') { const i = part.idx; return [0, -(0.03 * curve(s.r) * (Rs[i] || 0) / Rmax + (kind === 'pile' && i === worst ? 0.5 * s.brk : 0)), 0]; }
      let dy = -settleAt(x, z, s), dx = 0;
      if (s.brk && kind === 'punch' && part.piece === 'C') dy -= 0.6 * h * s.brk;
      if (s.brk && kind === 'flex') { const r2 = rot(x, y, 0, h, (part.piece === 'W' ? 1 : -1) * 0.1 * s.brk); dx += r2[0]; dy += r2[1] - 0.2 * h * s.brk; }
      return [dx, dy, 0];
    },
    ampText: 'Piles drawn ' + Lp + ' m long for the picture. Settlements follow the pile reactions.' }, fi);
}
function retaining(I, R) {
  const D = R.diagram || {};
  const hs = pos(D.hs, 4), hb = pos(D.hb, 0.5), toe = pos(D.toe, 0.8), heel = pos(D.heel, 1.8), tT = m(I.tTop, pos(D.tTop, 0.3) * 1000), tB = m(I.tBot, pos(D.tBot, 0.4) * 1000);
  const H = hs + hb, Bw = toe + tB + heel, Wz = 2.0, gam = pos(I.gamma, 18), q0 = pos(I.q, 0);
  const qmax = pos(D.qmax, 100), qmin = num(D.qmin, qmax);
  const phi = pos(I.phi, 30), Ka = rv(R, /^Ka$/, (1 - Math.sin((phi * PI) / 180)) / (1 + Math.sin((phi * PI) / 180)));
  const g = governing(R, /overturn|sliding|bearing|stem|toe|heel/i);
  const kind = !g ? null : /overturn/i.test(g.name) ? 'over' : /sliding/i.test(g.name) ? 'slide' : /bearing/i.test(g.name) ? 'bear' : 'stem';
  const fi = failInfo(g, { over: 'the wall overturns about its toe', slide: 'the wall slides forward on its base', bear: 'the soil under the toe fails and the wall tips forward', stem: 'the stem cracks at its base and bends forward' }[kind] || '');
  const xs0 = toe, xsBack = toe + tB;
  const parts = [
    P(BX(0, Bw, 0, hb, -Wz / 2, Wz / 2, [sg(Bw, 0.12, 6, 40), 3, 10]), 'concrete', { piece: 'W', role: 'base' }),
    P(BX(xs0, xsBack, hb, H, -Wz / 2, Wz / 2, [3, sg(hs, 0.12, 8, 40), 10]), 'concrete', { piece: kind === 'stem' ? 'T' : 'W', role: 'stem', }),
    P(BX(xsBack, Bw + 1.5, hb, H, -Wz / 2, Wz / 2, [sg(Bw + 1.5 - xsBack, 0.2, 4, 20), sg(hs, 0.2, 6, 30), 6]), 'soil', { role: 'back' }),
    P(BX(-1.5, Bw + 1.5, -2.5, 0, -Wz / 2, Wz / 2, [20, 8, 6]), 'soil2', { role: 'found' })
  ];
  // taper of the stem: front face battered from tBot at the base to tTop at the top
  parts[1].warp = (x, y, z) => { if (x < xs0 + tB / 2) { const k = (y - hb) / hs; return [x + (tB - tT) * k, y, z]; } return [x, y, z]; };
  const bars = [];
  for (let z = -Wz / 2 + 0.1; z < Wz / 2; z += 0.2) bars.push(CY([xsBack - 0.06, hb * 0.3, z], [xsBack - 0.06, H - 0.05, z], 0.01, 16, 6), CY([0.08, hb - 0.06, z], [Bw - 0.08, hb - 0.06, z], 0.008, 12, 6));
  parts.push(P(bars, 'rebar', { inner: true, piece: kind === 'stem' ? 'T' : 'W', role: 'bar', stress: false }));
  const pLat = (y) => Ka * (gam * Math.max(0, H - y) + q0);
  const qBase = (x) => qmax + ((qmin - qmax) * clamp(x / Bw, 0, 1));
  const wallDx = (y, s) => { const g2 = curve(s.r); let dx = -(hs / 80) * g2 * clamp((y - hb) / hs, 0, 1) ** 2; if (s.brk) { if (kind === 'slide') dx -= 0.8 * s.brk; if (kind === 'over') dx -= 0.35 * s.brk * y; if (kind === 'bear') dx -= 0.15 * s.brk * y; if (kind === 'stem') dx -= 0.3 * s.brk * Math.max(0, y - hb); } return dx; };
  return finish({ parts, hasRebar: true, view: [-0.35, 0.45, 1.3],
    cracks: kind === 'stem' ? [{ pts: [[xsBack + 0.002, hb + 0.02, -Wz / 2], [xsBack + 0.002, hb + 0.02, Wz / 2]], at: 0.6, piece: 'W' }] : [],
    loads: [{ p: [xsBack + 0.6, H * 0.4, 0], dir: [-1, 0, 0], len: 0.5, always: true }],
    stress: { label: 'Earth pressure on the wall and soil pressure under the base', q: 'pressure', f(x, y, z, part, lam) {
      if (part.role === 'stem' || part.role === 'back') return lam * pLat(y);
      if (part.role === 'base') return lam * qBase(x);
      if (part.role === 'found') { const dep = -y, inB = x > -dep && x < Bw + dep; return inB ? (lam * qBase(clamp(x, 0, Bw)) * Bw) / (Bw + 2 * dep) : lam * qmin * 0.1; }
      return 0;
    } },
    disp(x, y, z, part, s) {
      if (part.role === 'found') { const under = x > -0.3 && x < Bw + 0.3; const d0 = under ? -0.03 * curve(s.r) * qBase(clamp(x, 0, Bw)) / qmax * Math.exp(y / 1.5) : 0; return [0, d0 - (kind === 'bear' && x < Bw * 0.4 && y > -1.2 ? 0.2 * s.brk * Math.exp(y / 0.8) : 0) + (kind === 'bear' && x < -0.1 && x > -1.2 && y > -0.4 ? 0.12 * s.brk : 0), 0]; }
      if (part.role === 'back') { const k = Math.exp(-(x - xsBack) / (0.4 * hs)); return [wallDx(y, s) * k, kind === 'over' || kind === 'stem' ? -0.25 * s.brk * k * (y / H) : 0, 0]; }
      let dx = 0, dy = -0.02 * curve(s.r) * (1 - x / Bw);
      if (s.brk) {
        if (kind === 'over') { const r2 = rot(x, y, 0, 0, 0.35 * s.brk); dx += r2[0]; dy += r2[1]; }
        else if (kind === 'slide') dx -= 0.8 * s.brk;
        else if (kind === 'bear') { const r2 = rot(x, y, Bw, 0, 0.12 * s.brk); dx += r2[0]; dy += r2[1] - 0.1 * s.brk; }
        else if (kind === 'stem' && part.piece === 'T') { const r2 = rot(x, y, xs0, hb, 0.25 * s.brk); dx += r2[0]; dy += r2[1]; }
      }
      if (part.piece === 'T' || part.role === 'stem') dx += -(hs / 80) * curve(s.r) * clamp((y - hb) / hs, 0, 1) ** 2;
      return [dx, dy, 0];
    },
    ampText: 'Movements are exaggerated. A 2 m length of wall is drawn; the retained soil is to the right.' }, fi);
}
function bearing(I, R) {
  const D = R.diagram || {};
  const B = pos(D.B, pos(I.B, 1.5)), shape = D.shape || I.shape;
  const Lf = shape === 'strip' ? Math.max(3 * B, 3) : shape === 'rect' || shape === 'rectangular' ? pos(D.Lf, pos(I.Lf, B)) : B;
  const Df = num(D.Df, num(I.Df, 1)), qu = pos(D.qu, rv(R, /^qu$/, 300)), qall = rv(R, /qall \(gross\)/i, qu / pos(I.FS, 3));
  const Q = pos(I.Q, NaN), qApp = isFinite(Q) ? Q / (B * Lf) : qall;
  const lamEnd = clamp(qu / qApp, 0.05, 50);
  const fi = { lamEnd, fails: true, failText: 'Bearing failure at q = qu = ' + Math.round(qu) + ' kPa (' + lamEnd.toFixed(2) + ' × the ' + (isFinite(Q) ? 'applied' : 'allowable') + ' pressure): the footing punches down and the soil heaves beside it' };
  const hF = 0.4, gam = pos(I.gamma, 18);
  const parts = [
    P(BX(-Lf / 2, Lf / 2, -Df, -Df + hF, -B / 2, B / 2, [sg(Lf, 0.15, 4, 30), 3, sg(B, 0.15, 4, 30)]), 'concrete', { piece: 'F', role: 'body', stress: false }),
    P(BX(-0.2, 0.2, -Df + hF, 0.6, -0.2, 0.2, [2, 6, 2]), 'concrete', { piece: 'F', role: 'col', stress: false })
  ];
  const ext = Math.max(B, Lf) * 0.6, Ds = Df + 2 * B;
  parts.push(P(BX(-Lf / 2 - ext, Lf / 2 + ext, -Ds, 0, -B / 2 - ext, 0, [28, 24, 10]), 'soil', { role: 'soil' }));
  const dq = (x, y, z) => {
    const dep = -Df - y;
    if (dep < 0) return 0;
    const wx = Lf + dep, wz = B + dep, base = (qApp * Lf * B) / (wx * wz);
    const ox = Math.max(0, Math.abs(x) - wx / 2), oz = Math.max(0, Math.abs(z) - wz / 2);
    return base * Math.exp(-(ox + oz) / (0.3 * B));
  };
  return finish({ parts, hasRebar: false, cracks: [], loads: [{ p: [0, 0.6, 0], dir: [0, -1, 0], len: 0.5, piece: 'F' }],
    stress: { label: 'Vertical stress increase in the soil from the footing', q: 'pressure', f(x, y, z, part, lam) { return lam * dq(x, y, z); } },
    disp(x, y, z, part, s) {
      const g = curve(s.r), S0 = B / 25;
      if (part.role !== 'soil') return [0, -S0 * g - 0.5 * B * s.brk, 0];
      let dy = -S0 * g * (dq(x, Math.min(y, -Df - 0.01), z) / qApp) * (y < -Df ? 1 : 0.5);
      if (s.brk) {
        const ox = Math.max(Math.abs(x) - Lf / 2, Math.abs(z) - B / 2);
        if (ox <= 0 && y < -Df + 0.05) dy -= 0.5 * B * s.brk * Math.exp((y + Df) / B);
        else if (ox > 0 && y > -Df - B) dy += 0.3 * B * s.brk * Math.exp(-(((ox - 0.6 * B) / (0.5 * B)) ** 2)) * clamp(1 + (y + Df) / B, 0, 1);
      }
      return [0, dy, 0];
    },
    lamEnd,
    ampText: 'Settlement exaggerated. The load is raised from the ' + (isFinite(Q) ? 'applied' : 'allowable') + ' pressure to the ultimate capacity qu.' }, fi);
}
function pileCapacity(I, R, mode) {
  const D = R.diagram || {};
  const Dp = pos(D.D, pos(I.D, 0.4)), L = pos(D.L, pos(I.L, 12)), group = mode === 'group';
  const n1 = group ? pos(I.n1, 3) : 1, n2 = group ? pos(I.n2, 3) : 1, sp = pos(I.sp, 3 * Dp);
  const square = I.shape === 'square';
  const Qp = rv(R, /^Qp$/, NaN), Qs = rv(R, /^Qs$/, NaN), Qu = rv(R, /^Qu$|^Qg$/, NaN), Qall = rv(R, /^Qall$|^Qg,all$|^Qp \/ FS$/, NaN);
  const FS = pos(I.FS, 3), share = isFinite(Qs) && isFinite(Qu) && Qu > 0 ? Qs / Qu : 0.5;
  const lamEnd = isFinite(Qu) && isFinite(Qall) && Qall > 0 ? Qu / Qall : FS;
  const Ap = square ? Dp * Dp : (PI * Dp * Dp) / 4, Qw = isFinite(Qall) ? Qall / (n1 * n2) : 300;
  const parts = [], pilesXZ = [];
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) pilesXZ.push([(i - (n1 - 1) / 2) * sp, (j - (n2 - 1) / 2) * sp]);
  const segs = sg(L, 0.4, 10, 40);
  pilesXZ.forEach(([x, z]) => parts.push(square ? P(BX(x - Dp / 2, x + Dp / 2, -L, 0.2, z - Dp / 2, z + Dp / 2, [1, segs, 1]), 'concrete', { piece: 'G', role: 'pile' }) : P(CY([x, 0.2, z], [x, -L, z], Dp / 2, segs, 16), 'concrete', { piece: 'G', role: 'pile' })));
  const cx = ((n1 - 1) / 2) * sp + Dp, cz = ((n2 - 1) / 2) * sp + Dp;
  parts.push(P(BX(-cx, cx, 0.2, 0.8, -cz, cz, [4, 2, 4]), 'concrete', { piece: 'G', role: 'cap', stress: false }));
  const layers = Array.isArray(D.layers) && D.layers.length ? D.layers : [{ t: L * 1.3 }];
  const W = Math.max(cx, cz) + 2;
  let top = 0;
  layers.forEach((ly, k) => { const t = Math.min(pos(ly.t, 5), L * 1.4 - top); if (t <= 0) return; parts.push(P(BX(-W, W, -top - t, -top, -W, W, [8, sg(t, 0.8, 2, 12), 8]), k % 2 ? 'soil2' : 'soil', { role: 'soil', stress: false })); top += t; });
  if (top < L * 1.3) parts.push(P(BX(-W, W, -L * 1.3, -top, -W, W, [8, 4, 8]), 'soil', { role: 'soil', stress: false }));
  const fi = { lamEnd, fails: true, failText: 'Plunging failure at Qu' + (isFinite(Qu) ? ' = ' + Math.round(Qu) + ' kN' : '') + ' (' + lamEnd.toFixed(2) + ' × the allowable load): skin friction and end bearing are used up' + (group ? ' and the group sinks as a block' : '') };
  return finish({ parts, hasRebar: false, cracks: [], loads: [{ p: [0, 0.8, 0], dir: [0, -1, 0], len: 0.6, piece: 'G' }],
    stress: { label: 'Pile axial stress (load shed by skin friction)', q: 'stress', f(x, y, z, part, lam) { if (part.role !== 'pile') return 0; const k = clamp(-y / L, 0, 1); return (lam * Qw * (1 - share * k) * 1000) / (Ap * 1e6); } },
    disp(x, y, z, part, s) {
      const g = curve(s.r), S0 = 0.02 + 0.03 * g;
      if (part.role === 'soil') {
        if (!group) return [0, 0, 0];
        const inside = Math.abs(x) < cx && Math.abs(z) < cz && y > -L;
        return [0, inside ? -(S0 * g + 0.6 * s.brk) * 0.8 : 0, 0];
      }
      return [0, -S0 * g - 0.6 * s.brk, 0];
    },
    lamEnd, ampText: 'Settlement exaggerated. The load is raised from the allowable load to the ultimate capacity.' }, fi);
}

function loadTransfer(I, R, mode) {
  if (mode !== 'panel') return null;
  const D = R.diagram || {};
  const S = pos(D.S, pos(I.S, 4)), Lg = pos(D.Lg, pos(I.Lg, 6)), oneWay = !!D.oneWay, h = 0.12;
  const wD = pos(I.wD, 4), wL = pos(I.wL, 2), q = I.loadType === 'factored' ? 1.2 * wD + 1.6 * wL : wD + wL;
  const parts = [P(BX(0, Lg, 0, h, 0, S, [sg(Lg, 0.15, 10, 40), 2, sg(S, 0.15, 8, 30)]), 'concrete', { role: 'slab' })];
  const bw = 0.3, bh = 0.5;
  parts.push(P(BX(0, Lg, h - bh, 0, -bw / 2, bw / 2, [20, 2, 1]), 'concrete', { role: 'beamL', edge: 0 }), P(BX(0, Lg, h - bh, 0, S - bw / 2, S + bw / 2, [20, 2, 1]), 'concrete', { role: 'beamL', edge: 1 }));
  parts.push(P(BX(-bw / 2, bw / 2, h - bh, 0, 0, S, [1, 2, 14]), 'concrete', { role: 'beamS', edge: 0 }), P(BX(Lg - bw / 2, Lg + bw / 2, h - bh, 0, 0, S, [1, 2, 14]), 'concrete', { role: 'beamS', edge: 1 }));
  [[0, 0], [Lg, 0], [0, S], [Lg, S]].forEach(([x, z]) => parts.push(P(BX(x - 0.2, x + 0.2, -3, h - bh, z - 0.2, z + 0.2), 'concrete', { piece: 'S', role: 'col', stress: false })));
  // Line load on each beam (kN/m) by the 45 degree rule.
  const wLong = (x) => (oneWay ? (q * S) / 2 : q * Math.min(S / 2, x, Lg - x));
  const wShort = (z) => (oneWay ? 0 : q * Math.min(z, S - z));
  const slabVal = (x, z) => { if (oneWay) return wLong(x); const dz = Math.min(z, S - z), dx = Math.min(x, Lg - x); return dz <= dx ? wLong(x) : wShort(z); };
  return finish({ parts, hasRebar: false, cracks: [], loads: [[0.25, 0.3], [0.5, 0.5], [0.75, 0.7]].map(([u, w]) => ({ p: [u * Lg, h, w * S], dir: [0, -1, 0], len: 0.4 })),
    stress: { label: 'Load carried to the beams (tributary areas)', q: 'lineload', f(x, y, z, part, lam) {
      if (part.role === 'beamL') return lam * wLong(clamp(x, 0, Lg));
      if (part.role === 'beamS') return lam * wShort(clamp(z, 0, S));
      return lam * slabVal(clamp(x, 0, Lg), clamp(z, 0, S));
    } },
    disp(x, y, z, part, s) {
      if (part.piece === 'S') return [0, 0, 0];
      const g = s.r, bx = Math.sin(PI * clamp(x / Lg, 0, 1)), bz = Math.sin(PI * clamp(z / S, 0, 1));
      const slab = part.role === 'slab' ? (oneWay ? bz : bx * bz) * 0.08 : 0, beam = (part.role === 'beamL' || part.role === 'slab' ? bx : 0) * 0.03 + (part.role === 'beamS' ? bz * 0.02 : 0);
      return [0, -(slab + beam) * g, 0];
    },
    ampText: 'Deflection exaggerated. Colors show how the panel load is shared by the edge beams.' }, null);
}

// ---- registry
const BUILD = {
  'rc/beam-flexure': (I, R, mode) => rcBeam(I, R, mode, {}),
  'rc/shear-torsion': shearTorsion,
  'rc/one-way-slab': oneWaySlab,
  'rc/two-way-slab': twoWaySlab,
  'rc/columns': columnModel,
  'rc/development': development,
  'rc/serviceability': serviceability,
  'rc/shear-walls': shearWall,
  'steel/tension': tension,
  'steel/compression': compression,
  'steel/beams': steelBeams,
  'steel/beam-columns': beamColumns,
  'steel/bolted': bolted,
  'steel/welded': welded,
  'steel/base-plates': basePlate,
  'found/bearing': bearing,
  'found/isolated': isolated,
  'found/wall': wallFooting,
  'found/combined': combined,
  'found/dowels': dowels,
  'found/retaining': retaining,
  'found/mat': mat,
  'found/pile-capacity': pileCapacity,
  'found/pile-caps': pileCaps,
  'shared/load-transfer': loadTransfer
};

export const hasViz = (id) => !!BUILD[id];

export function buildModel(id, mode, input, result) {
  const fn = BUILD[id];
  if (!fn || !result || !result.ok) return null;
  const model = fn(input || {}, result, mode);
  if (!model || !model.parts || !model.parts.length) return null;
  return model;
}
