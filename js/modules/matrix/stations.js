// Axial force, shear, moment and the deflected shape along each member (hand-off 4.10).
// Pure: no DOM, no rounding. Local axes: x from b to e; loads as local +x / +y components.
import { loadIntegrals, hermite } from './fef.js';

const NSTA = 100, EPS = 1e-6;

// Partial integrals of a linear load item up to x: ∫ w and ∫ w (x − ξ).
function partial(it, x) {
  if (!(x > it.a)) return { F: 0, Mx: 0 };
  const xe = Math.min(x, it.b), we = it.w1 + (it.w2 - it.w1) * (xe - it.a) / (it.b - it.a);
  const [I0, I1] = loadIntegrals(it.a, xe, it.w1, we);
  return { F: I0, Mx: x * I0 - I1 };
}

// Internal forces at x for end forces Q (6, Kassimali local) and load items. side: -1 just left of a
// concentrated load at x, +1 just right (the default counts loads with a < x only).
export function forcesAt(Q, items, x) {
  let N = -Q[0], V = Q[1], M = -Q[2] + Q[1] * x;
  items.forEach((it) => {
    if (it.kind === 'py' && it.a < x) { V += it.P; M += it.P * (x - it.a); }
    else if (it.kind === 'px' && it.a < x) N -= it.P;
    else if (it.kind === 'm' && it.a < x) M -= it.M;
    else if (it.kind === 'wy' && it.b > it.a) { const p = partial(it, x); V += p.F; M += p.Mx; }
    else if (it.kind === 'wx' && it.b > it.a) N -= partial(it, x).F;
  });
  return { N, V, M };
}

// Break points of a member: load positions and ends of distributed loads.
function breaks(L, items) {
  const b = [0, L];
  items.forEach((it) => { b.push(it.a); if (it.kind === 'wy' || it.kind === 'wx') b.push(it.b); });
  return [...new Set(b.filter((x) => x >= 0 && x <= L).map((x) => Math.min(Math.max(x, 0), L)))].sort((p, q) => p - q);
}

// Station list: NSTA even stations, plus both sides of every break point.
function stationList(L, items) {
  const xs = [];
  for (let k = 0; k <= NSTA; k++) xs.push(L * k / NSTA);
  breaks(L, items).forEach((x) => { xs.push(x); if (x > 0) xs.push(x - EPS * L); if (x < L) xs.push(x + EPS * L); });
  return [...new Set(xs.filter((x) => x >= 0 && x <= L))].sort((p, q) => p - q);
}

// Exact peaks of M where V = 0 (V is a polynomial of degree ≤ 2 between break points).
function shearZeros(L, Q, items) {
  const bp = breaks(L, items), out = [];
  for (let k = 0; k + 1 < bp.length; k++) {
    const x0 = bp[k], x1 = bp[k + 1], h = x1 - x0;
    if (!(h > EPS * L)) continue;
    const xa = x0 + h * 1e-9, xm = x0 + h / 2, xb = x1 - h * 1e-9;
    const fa = forcesAt(Q, items, xa).V, fm = forcesAt(Q, items, xm).V, fb = forcesAt(Q, items, xb).V;
    // quadratic through (0, fa), (1/2, fm), (1, fb) in t = (x − xa)/(xb − xa)
    const A = 2 * fa - 4 * fm + 2 * fb, B = -3 * fa + 4 * fm - fb, C = fa;
    const roots = [];
    const sc = Math.max(Math.abs(fa), Math.abs(fm), Math.abs(fb));
    if (!(sc > 0)) continue;
    if (Math.abs(A) < 1e-12 * sc) { if (Math.abs(B) > 1e-12 * sc) roots.push(-C / B); }
    else { const D = B * B - 4 * A * C; if (D >= 0) { const r = Math.sqrt(D); roots.push((-B + r) / (2 * A), (-B - r) / (2 * A)); } }
    roots.forEach((t) => { if (t > 1e-9 && t < 1 - 1e-9) out.push(xa + t * (xb - xa)); });
  }
  return out;
}

// Fixed-fixed transverse and axial displacements under the loads (v = θ = 0 and u = 0 at x = 0),
// by integrating M/EI and N/EA with Simpson's rule on each station interval.
function fixedFixed(xs, mm, items) {
  const EI = mm.E * (mm.I || 0), EA = mm.E * (mm.A || 0), qf = mm.qfRigid;
  const Mf = (x) => forcesAt(qf, items, x).M, Nf = (x) => forcesAt(qf, items, x).N;
  const vff = [0], uff = [0];
  const eps0 = items.reduce((sum, it) => sum + (it.kind === 'strain' ? it.eps : 0), 0);   // u' = N/EA + ε0
  let th = 0, v = 0, u = 0;
  for (let k = 1; k < xs.length; k++) {
    const x0 = xs[k - 1], x1 = xs[k], h = x1 - x0;
    if (EI > 0 && items.some((it) => it.kind !== 'px' && it.kind !== 'wx')) {
      const m0 = Mf(x0), mq = Mf(x0 + h / 4), mh = Mf(x0 + h / 2), m1 = Mf(x1);
      const thHalf = th + (h / 12) * (m0 + 4 * mq + mh) / EI;
      const thEnd = th + (h / 6) * (m0 + 4 * mh + m1) / EI;
      v += (h / 6) * (th + 4 * thHalf + thEnd);
      th = thEnd;
    }
    if (EA > 0 && items.some((it) => it.kind === 'px' || it.kind === 'wx' || it.kind === 'strain')) u += (h / 6) * (Nf(x0) + 4 * Nf(x0 + h / 2) + Nf(x1)) / EA + h * eps0;
    vff.push(v); uff.push(u);
  }
  return { vff, uff };
}

// Everything along one solved member. kind: 'truss' | 'beam' | 'frame' | 'bar'.
export function memberStations(kind, mm) {
  const L = mm.L, items = mm.items || [], Q = mm.Q6, u6 = mm.u6, c = mm.c, s = mm.s;
  const xs = stationList(L, items);
  const ff = kind === 'truss' ? { vff: xs.map(() => 0), uff: xs.map(() => 0) } : fixedFixed(xs, mm, items);
  const out = { x: [], N: [], V: [], M: [], dx: [], dy: [], u: [], v: [] };
  xs.forEach((x, k) => {
    const f = forcesAt(Q, items, x);
    let uu, vv;
    if (kind === 'truss' || kind === 'bar') {
      const t = x / L;
      uu = u6[0] + (u6[3] - u6[0]) * t + ff.uff[k];
      vv = u6[1] + (u6[4] - u6[1]) * t;
    } else {
      const { N } = hermite(x, L);
      vv = N[0] * u6[1] + N[1] * u6[2] + N[2] * u6[4] + N[3] * u6[5] + ff.vff[k];
      uu = u6[0] + (u6[3] - u6[0]) * x / L + ff.uff[k];
    }
    out.x.push(x); out.N.push(f.N); out.V.push(f.V); out.M.push(f.M);
    out.u.push(uu); out.v.push(vv); out.dx.push(c * uu - s * vv); out.dy.push(s * uu + c * vv);
  });
  // extremes (Excel table 5.5)
  const ext = (arr, pick) => { let best = null; arr.forEach((val, k) => { if (best == null || pick(val, best.v)) best = { v: val, x: out.x[k] }; }); return best; };
  const peaks = shearZeros(L, Q, items).map((x) => ({ x, v: forcesAt(Q, items, x).M }));
  let Mmax = ext(out.M, (a, b) => a > b), Mmin = ext(out.M, (a, b) => a < b);
  peaks.forEach((p) => { if (p.v > Mmax.v) Mmax = p; if (p.v < Mmin.v) Mmin = p; });
  const mov = out.dx.map((d, k) => Math.hypot(d, out.dy[k]));
  out.ext = {
    Nmax: ext(out.N, (a, b) => a > b), Nmin: ext(out.N, (a, b) => a < b),
    Vabs: ext(out.V.map(Math.abs), (a, b) => a > b), Mmax, Mmin, peaks,
    D: ext(mov, (a, b) => a > b)
  };
  out.ext.Vabs.v = out.V[out.x.indexOf(out.ext.Vabs.x)];
  return out;
}
