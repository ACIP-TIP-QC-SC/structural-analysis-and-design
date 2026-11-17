// Presets for steel/welded.
export const meta = { module: 'steel/welded', calc: 'js/modules/steel/welded.calc.js' };
const base = { FEXX: 480, w: 8, nLong: 2, Llong: 150, Ltrans: 0, angle: 0, t: 10, Fy: 248, Fu: 400, P: 300,
  groove: 'cjp', loading: 'tension', Lw: 200, E: 6, layout: 'C', a: 250, b: 150, segments: [{ x1: 0, y1: 0, x2: 0, y2: 200 }, { x1: 100, y1: 0, x2: 100, y2: 200 }], ex: 250, ey: 0 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'f1', test: 'WD-1', name: 'Test: two 150 mm longitudinal 8 mm fillets, E70, 10 mm plate', mode: 'fillet', method: 'LRFD', inputs: P({}),
    expect: { rn: 1628.9, Rn: 488.68, LRFD: 366.51, ASD: 244.34, baseRupture: 2400, baseRuptureAvail: 1800, baseYield: 1488, baseYieldAvail: 1488, weldAvailPerMm: 1221.7, minLength: 32 }, pass: true },
  { id: 'f2', test: 'WD-2', name: 'Test: the same with a 200 mm transverse weld', mode: 'fillet', method: 'LRFD', inputs: P({ Ltrans: 200, P: 600 }),
    expect: { Rwl: 488.68, Rwt: 325.79, Ra_: 814.46, Rb_: 904.06, Rn: 904.06, LRFD: 678.04 }, pass: true },
  { id: 'f3', name: 'Example: 6 mm fillets too small for 400 kN (fails on purpose)', mode: 'fillet', method: 'LRFD', inputs: P({ w: 6, P: 400 }) },
  { id: 'g1', name: 'Example: complete joint penetration butt weld in tension', mode: 'groove', method: 'LRFD', inputs: P({ t: 12, Lw: 200, P: 450 }) },
  { id: 'g2', name: 'Example: partial joint penetration weld in shear', mode: 'groove', method: 'LRFD', inputs: P({ groove: 'pjp', loading: 'shear', t: 16, E: 8, Lw: 250, P: 300 }) },
  { id: 'e1', test: 'WD-3', name: 'Test: C-shaped group, 120 kN at 250 mm (LRFD)', mode: 'eccentric', method: 'LRFD', inputs: P({ P: 120, w: 6 }),
    expect: { L: 550, xbar: 40.909, Ix: 5.9896e6, Iy: 1.3295e6, Ip: 7.3191e6, direct: 0.21818, fx: 0.51236, fy: 0.44715, fr: 0.83974, wReq: 5.4989 }, pass: true },
  { id: 'e2', name: 'Example: two parallel welds, free coordinates (ASD)', mode: 'eccentric', method: 'ASD', inputs: P({ layout: 'free', P: 60, ex: 150, w: 8 }) }
];
