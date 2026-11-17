// Presets for found/combined. Positions in m, sizes in mm.
export const meta = { module: 'found/combined', calc: 'js/modules/found/combined.calc.js' };
const base = { cA1: 400, cA2: 400, PDA: 600, PLA: 400, cB1: 500, cB2: 500, PDB: 900, PLB: 600, s: 5.0, a: 0.2, qa: 200, fc: 28, fy: 420, h: 850, db: 25, B: 2.0, Lt: 5.7, L1: 2.0 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'r1', test: 'CF-1', name: 'Test: rectangular combined footing, two columns 5 m apart', mode: 'rectangular', inputs: P({}),
    expect: { xbar: 3.0, L: 6.4, Breq: 1.9531, B: 2.0, PuA: 1360, PuB: 2040, qu: 265.62, w: 531.25, VAleft: 106.25, VAright: -1253.75, xZero: 2.56, MnegMax: 1468.8, VBleft: 1402.5, VBright: -637.5, MB: 382.5,
      d: 750, Vu1: 871.25, phiVc1: 1012.0, boB: 5000, VuB: 1625.0, phiVcB: 4911.2, boA: 2700, VuA: 1123.3, phiVcA: 2652.0, AsTop: 5349.3, AsBotB: 1360.1, AsMin: 3060 }, pass: true },
  { id: 'r2', name: 'Example: rectangular footing with B rounded from the loads, h 700', mode: 'rectangular', inputs: P({ B: null, h: 700 }) },
  { id: 't1', test: 'CF-2', name: 'Test: trapezoidal footing, L 5.7 m', mode: 'trapezoidal', inputs: P({}), expect: { area: 12.5, xbarEnd: 3.2, aPlusB: 4.386, widthA: 1.385, widthB: 3.0009 }, pass: true },
  { id: 't2', test: 'CF-2b', name: 'Test: L 10 m puts the resultant outside the middle third (stops on purpose)', mode: 'trapezoidal', inputs: P({ Lt: 10.0 }), ok: false, errorIncludes: 'middle third' },
  { id: 's1', test: 'CF-3', name: 'Test: strap footing, columns 6 m apart', mode: 'strap', inputs: P({ s: 6.0 }), expect: { e: 0.8, R1: 1153.8, R2: 1346.2, A1: 5.7692, B1: 2.8846, A2: 6.7308, side: 2.5944 }, pass: null }
];
