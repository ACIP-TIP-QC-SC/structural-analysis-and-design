// Presets for steel/compression.
export const meta = { module: 'steel/compression', calc: 'js/modules/steel/compression.calc.js' };
const base = { shape: 'W250x73', Ag: 9290, rx: 110, ry: 64.5, bf2tf: 8.93, htw: 23.1, dsec: 254, bf: 254, tf: 14.2, tw: 8.6, grade: 'A992', Fy: 345, Kx: 1, Lx: 4500, Ky: 1, Ly: 4500, P: 1600 };
const P = (o) => Object.assign({}, base, o);
const c1 = { klrx: 40.909, klry: 69.767, limit: 113.4, Fe: 405.53, Fcr: 241.64, Pn: 2244.9, LRFD: 2020.4, ASD: 1344.2, flangeLimit: 13.483, webLimit: 35.875, inelastic: true, slender: false };
export default [
  { id: 'c1', test: 'ST-C1', name: 'Test: W250x73, Fy 345, KL = 4.5 m (LRFD)', mode: 'buckling', method: 'LRFD', inputs: P({}), expect: Object.assign({ avail: 2020.4 }, c1), pass: true },
  { id: 'c1a', test: 'ST-C1a', name: 'Test: W250x73, Fy 345, KL = 4.5 m (ASD)', mode: 'buckling', method: 'ASD', inputs: P({ P: 1100 }), expect: Object.assign({ avail: 1344.2 }, c1), pass: true },
  { id: 'c2', test: 'ST-C2', name: 'Test: same column, KL = 9 m (elastic buckling)', mode: 'buckling', method: 'LRFD', inputs: P({ Lx: 9000, Ly: 9000, P: 600 }),
    expect: { klry: 139.53, limit: 113.4, inelastic: false, Fe: 101.38, Fcr: 88.913, Pn: 826.0, LRFD: 743.4, ASD: 494.61 }, pass: true },
  { id: 'c3', test: 'ST-C3', name: 'Test: A36, KLx = 8 m, KLy = 4 m (x axis governs)', mode: 'buckling', method: 'LRFD', inputs: P({ grade: 'A36', Fy: 248, Lx: 8000, Ly: 4000, P: 1200 }),
    expect: { klrx: 72.727, klry: 62.016, axis: 'x', limit: 133.76, Fe: 373.19, Fcr: 187.78, Pn: 1744.5, LRFD: 1570.1, ASD: 1044.6 }, pass: true },
  { id: 'c5', test: 'ST-C4', name: 'Test: custom section with a slender web (stops on purpose)', mode: 'buckling', method: 'LRFD', inputs: P({ shape: 'custom', htw: 60 }), ok: false, errorIncludes: 'slender elements for compression' },
  { id: 'c4', name: 'Example: overloaded column (fails on purpose)', mode: 'buckling', method: 'LRFD', inputs: P({ Lx: 6000, Ly: 6000, P: 1800 }) }
];
