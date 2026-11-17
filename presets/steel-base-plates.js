// Presets for steel/base-plates.
export const meta = { module: 'steel/base-plates', calc: 'js/modules/steel/base-plates.calc.js' };
const base = { shape: 'W250x73', dsec: 254, bf: 254, B: 400, N: 400, Bs: 600, Ns: 600, fc: 21, P: 1500, Fy: 248, tProv: null, A2A1: 2.25,
  rod: 24, Fu: 400, threads: 'N', nRods: 4, T: null, V: null };
const P = (o) => Object.assign({}, base, o);
const bp1 = { Pp: 4284.0, phiPp: 2784.6, PpASD: 1854.5 };
export default [
  { id: 'p1', test: 'BP-1', name: 'Test: W250x73 on a 400 × 400 plate, Pu 1500 kN (LRFD)', mode: 'thickness', method: 'LRFD', inputs: P({ tProv: 32 }),
    expect: Object.assign({ m: 79.35, n: 98.40, X: 0.53868, lam: 0.87416, lamN: 55.509, l: 98.40, t: 28.52, tUse: 32 }, bp1), pass: true },
  { id: 'p1a', test: 'BP-1a', name: 'Test: the same plate, Pa 1000 kN (ASD)', mode: 'thickness', method: 'ASD', inputs: P({ P: 1000 }), expect: Object.assign({ l: 98.40, t: 28.548 }, bp1), pass: true },
  { id: 'b1', name: 'Example: bearing on a 600 × 600 pedestal', mode: 'bearing', method: 'LRFD', inputs: P({}) },
  { id: 'b2', name: 'Example: plate on the full area of the support (fails on purpose)', mode: 'bearing', method: 'LRFD', inputs: P({ Bs: 400, Ns: 400, P: 2500 }) },
  { id: 'a1', test: 'BP-2', name: 'Test: M24 anchor rod, Fu 400, threads in the shear plane', mode: 'anchors', method: 'LRFD', inputs: P({ T: 200, V: 120 }),
    expect: { Ab: 452.39, RnT: 135.72, LRFDt: 101.79, ASDt: 67.86, RnV: 81.43, LRFDv: 61.073, ASDv: 40.715 }, pass: true }
];
