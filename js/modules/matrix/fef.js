// Fixed-end forces of member loads by the Hermite shape-function integrals (hand-off 4.5).
// Loads are local components: +x along the member (b to e), +y = x turned 90° ccw, couples ccw.
// Item kinds: { kind: 'wy' | 'wx', a, b, w1, w2 } distributed (linear from w1 at a to w2 at b),
//             { kind: 'py' | 'px', a, P } point, { kind: 'm', a, M } couple,
//             { kind: 'strain', a: 0, F0, eps } initial strain eps = αΔT + e0/L of an axial member
//             (F0 = EA·eps; the fixed ends push it back: Qf = [+F0 at b, −F0 at e]).
// Returns f, the consistent nodal loads [fx_b, fy_b, fm_b, fx_e, fy_e, fm_e]; Qf = −f.

// In = ∫ₐᵇ w(x) xⁿ dx for w linear from w1 at a to w2 at b.
export function loadIntegrals(a, b, w1, w2) {
  const beta = b > a ? (w2 - w1) / (b - a) : 0, alpha = w1 - beta * a;
  const I = [];
  for (let n = 0; n <= 3; n++) I.push(alpha * (Math.pow(b, n + 1) - Math.pow(a, n + 1)) / (n + 1) + beta * (Math.pow(b, n + 2) - Math.pow(a, n + 2)) / (n + 2));
  return I;
}

export function hermite(x, L) {
  const s = x / L;
  return {
    N: [1 - 3 * s * s + 2 * s * s * s, L * (s - 2 * s * s + s * s * s), 3 * s * s - 2 * s * s * s, L * (-s * s + s * s * s)],
    dN: [(-6 * s + 6 * s * s) / L, 1 - 4 * s + 3 * s * s, (6 * s - 6 * s * s) / L, -2 * s + 3 * s * s]
  };
}

export function nodalLoads(L, it) {
  const f = new Float64Array(6);
  if (it.kind === 'wy') {
    if (!(it.b > it.a)) return f;
    const [I0, I1, I2, I3] = loadIntegrals(it.a, it.b, it.w1, it.w2);
    f[1] = (L * L * L * I0 - 3 * L * I2 + 2 * I3) / (L * L * L);
    f[2] = (L * L * I1 - 2 * L * I2 + I3) / (L * L);
    f[4] = (3 * L * I2 - 2 * I3) / (L * L * L);
    f[5] = (-L * I2 + I3) / (L * L);
  } else if (it.kind === 'wx') {
    if (!(it.b > it.a)) return f;
    const [J0, J1] = loadIntegrals(it.a, it.b, it.w1, it.w2);
    f[0] = (L * J0 - J1) / L;
    f[3] = J1 / L;
  } else if (it.kind === 'py') {
    const { N } = hermite(it.a, L);
    f[1] = it.P * N[0]; f[2] = it.P * N[1]; f[4] = it.P * N[2]; f[5] = it.P * N[3];
  } else if (it.kind === 'px') {
    f[0] = it.P * (1 - it.a / L); f[3] = it.P * it.a / L;
  } else if (it.kind === 'm') {
    const { dN } = hermite(it.a, L);
    f[1] = it.M * dN[0]; f[2] = it.M * dN[1]; f[4] = it.M * dN[2]; f[5] = it.M * dN[3];
  } else if (it.kind === 'strain') {
    f[0] = -it.F0; f[3] = it.F0;
  }
  return f;
}

// Fixed-end forces Qf = −f of one item.
export function fixedEnd(L, it) { return nodalLoads(L, it).map((x) => -x); }

// Resultant of an item in local axes: force along x, along y, and moment about end b (ccw).
export function resultant(it) {
  if (it.kind === 'wy') { const [I0, I1] = loadIntegrals(it.a, it.b, it.w1, it.w2); return { fx: 0, fy: I0, m: I1 }; }
  if (it.kind === 'wx') { const [J0] = loadIntegrals(it.a, it.b, it.w1, it.w2); return { fx: J0, fy: 0, m: 0 }; }
  if (it.kind === 'py') return { fx: 0, fy: it.P, m: it.P * it.a };
  if (it.kind === 'px') return { fx: it.P, fy: 0, m: 0 };
  if (it.kind === 'm') return { fx: 0, fy: 0, m: it.M };
  return { fx: 0, fy: 0, m: 0 };
}
