// Member stiffness in local axes, the transformation matrix and static condensation of
// released end rotations (hand-off 4.4 and 4.6). Pure: no DOM, no rounding.
//
// Every member is handled through the 6 local DOFs of a plane frame member
// [u_b, v_b, θ_b, u_e, v_e, θ_e]; each kind keeps its own subset (SEL).
import { zeros, solve } from './linalg.js';

export const SEL = { frame: [0, 1, 2, 3, 4, 5], truss: [0, 1, 3, 4], beam: [1, 2, 4, 5], bar: [0, 3] };
export const RELEASE_MT = { none: 0, i: 1, j: 2, both: 3 };
export const RELEASED = { none: [], i: [2], j: [5], both: [2, 5] };

// Kassimali Eq. 6.6. I = 0 gives the truss member, A is ignored for a beam.
export function kLocal(E, A, I, L) {
  const a = E * A / L, b = 12 * E * I / (L * L * L), c = 6 * E * I / (L * L), d = 4 * E * I / L, e = 2 * E * I / L;
  const k = zeros(6);
  const rows = [[a, 0, 0, -a, 0, 0], [0, b, c, 0, -b, c], [0, c, d, 0, -c, e], [-a, 0, 0, a, 0, 0], [0, -b, -c, 0, b, -c], [0, c, e, 0, -c, d]];
  rows.forEach((r, i) => r.forEach((x, j) => { k[i][j] = x; }));
  return k;
}

export function T6(c, s) {
  const t = zeros(6);
  [[0, 0, c], [0, 1, s], [1, 0, -s], [1, 1, c], [2, 2, 1], [3, 3, c], [3, 4, s], [4, 3, -s], [4, 4, c], [5, 5, 1]].forEach(([i, j, x]) => { t[i][j] = x; });
  return t;
}

// k* = k_cc − k_cr k_rr⁻¹ k_rc and Qf* = Qf_c − k_cr k_rr⁻¹ Qf_r; released rows and columns become 0.
export function condense(k, qf, released) {
  const km = k.map((r) => Float64Array.from(r)), qm = Float64Array.from(qf);
  if (!released.length) return { k: km, qf: qm };
  const r = released, c = [0, 1, 2, 3, 4, 5].filter((i) => !r.includes(i));
  const krr = r.map((i) => Float64Array.from(r.map((j) => k[i][j])));
  // X = k_rr⁻¹ k_rc (one column per kept DOF), y = k_rr⁻¹ Qf_r
  const X = c.map((cj) => solve(krr, r.map((ri) => k[ri][cj])));
  const y = solve(krr, r.map((ri) => qf[ri]));
  c.forEach((ci) => {
    c.forEach((cj, jj) => {
      let s = 0;
      r.forEach((rk, kk) => { s += k[ci][rk] * X[jj][kk]; });
      km[ci][cj] = k[ci][cj] - s;
    });
    let sq = 0;
    r.forEach((rk, kk) => { sq += k[ci][rk] * y[kk]; });
    qm[ci] = qf[ci] - sq;
  });
  r.forEach((ri) => { for (let j = 0; j < 6; j++) { km[ri][j] = 0; km[j][ri] = 0; } qm[ri] = 0; });
  return { k: km, qf: qm };
}

// Rotation of a released end: θ_r = −k_rr⁻¹ (k_rc u_c + Qf_r), with the rigid k and Qf.
// Returns a copy of u (6 local) with the released rotations filled in.
export function releasedRotations(k, qf, u, released) {
  const out = Float64Array.from(u);
  if (!released.length) return out;
  const r = released, c = [0, 1, 2, 3, 4, 5].filter((i) => !r.includes(i));
  const krr = r.map((i) => Float64Array.from(r.map((j) => k[i][j])));
  const rhs = r.map((ri) => -(c.reduce((s, cj) => s + k[ri][cj] * u[cj], 0) + qf[ri]));
  const th = solve(krr, rhs);
  r.forEach((ri, i) => { out[ri] = th ? th[i] : 0; });
  return out;
}
