// Presets for steel/tension. Section properties are stored as numbers so results never depend on the shape list.
export const meta = { module: 'steel/tension', calc: 'js/modules/steel/tension.calc.js' };
const mem = { shape: 'W250x67', Ag: 8581, dsec: 257, bf: 204, rmin: 51.1, grade: 'A36', Fy: 248, Fu: 400, conn: 'bolted', bolt: 20, nHoles: 4, t: 15.7, nGauge: 0, sStag: 75, gStag: 75,
  Ucase: 'case7f', Utyped: 0.85, xbar: 25, Lconn: 150, Lweld: 200, wPlate: 150, P: 1500, Lmem: null };
const blk = { grade: 'A36', Fy: 248, Fu: 400, bsFrom: 'pattern', lines: 2, nPerLine: 3, pitch: 75, end: 40, gauge: 75, t: 12, bolt: 20, Agv: 4560, Anv: 3120, Ant: 612, Ubs: 1.0, P: 600 };
const M = (o) => Object.assign({}, mem, o), B = (o) => Object.assign({}, blk, o);
const t1 = { An: 7073.8, U: 0.90, Ae: 6366.4, PnYield: 2128.1, PnRupture: 2546.6, yLRFD: 1915.3, rLRFD: 1909.9, yASD: 1274.3, rASD: 1273.3, governing: 'rupture', holeWidth: 24 };
const t2 = { Agv: 4560, Anv: 3120, Ant: 612, rupturePath: 993.6, yieldPath: 923.33, Rn: 923.33, LRFD: 692.5, ASD: 461.66 };
export default [
  { id: 't1', test: 'ST-T1', name: 'Test: W250x67, A36, M20 bolts in the flanges (LRFD)', mode: 'member', method: 'LRFD', inputs: M({}), expect: Object.assign({ availRupture: 1909.9 }, t1), pass: true, governing: 'Rupture' },
  { id: 't1a', test: 'ST-T1a', name: 'Test: W250x67, A36, M20 bolts in the flanges (ASD)', mode: 'member', method: 'ASD', inputs: M({ P: 1000 }), expect: Object.assign({ availRupture: 1273.3, availYield: 1274.3 }, t1), pass: true },
  { id: 't3', name: 'Example: welded plate 150 × 12, longitudinal welds', mode: 'member', method: 'LRFD', inputs: M({ shape: 'custom', Ag: 1800, dsec: 150, bf: 12, rmin: 3.46, conn: 'welded', Ucase: 'case4', Lweld: 250, wPlate: 150, P: 350 }) },
  { id: 'b1', test: 'ST-T2', name: 'Test: block shear, 12 mm plate, 2 lines of 3 M20 bolts (LRFD)', mode: 'block', method: 'LRFD', inputs: B({}), expect: Object.assign({ avail: 692.5 }, t2), pass: true },
  { id: 'b1a', test: 'ST-T2a', name: 'Test: block shear, same plate (ASD)', mode: 'block', method: 'ASD', inputs: B({ P: 400 }), expect: Object.assign({ avail: 461.66 }, t2), pass: true },
  { id: 'b2', name: 'Example: block shear from typed areas', mode: 'block', method: 'LRFD', inputs: B({ bsFrom: 'typed', Agv: 3000, Anv: 2100, Ant: 500, Ubs: 1.0, P: 450 }) }
];
