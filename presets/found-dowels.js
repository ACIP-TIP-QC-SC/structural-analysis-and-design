// Presets for found/dowels.
export const meta = { module: 'found/dowels', calc: 'js/modules/found/dowels.calc.js' };
const base = { c1: 400, c2: 400, fcCol: 28, fcFtg: 21, B: 2.5, L: 2.5, h: 600, Pu: 2500, fy: 420, dbCol: 25, dbDowel: 16, dbFtg: 20 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'd1', test: 'DW-1', name: 'Test: 400 × 400 column on a 2.5 m footing, Pu 2500 kN', mode: 'dowels', inputs: P({}),
    expect: { phiBnCol: 2475.2, phiBnFtg: 3712.8, excess: 24.8, AsExcess: 90.842, AsMin: 800, nDowels: 4, ldcFtg: 351.94, avail: 469, ldcCol: 476.24, lapSmall: 477.12, lap: 477.12 }, pass: true },
  { id: 'd2', name: 'Example: thin footing, dowels not developed (fails on purpose)', mode: 'dowels', inputs: P({ h: 400, dbDowel: 25 }) },
  { id: 'b1', test: 'DW-1b', name: 'Test: bearing only, the same column with Pu 2500 kN (fails on purpose)', mode: 'bearing', inputs: P({}), expect: { phiBnCol: 2475.2, phiBnFtg: 3712.8, excess: 24.8 }, pass: false },
  { id: 'b2', name: 'Example: bearing only, Pu 2000 kN', mode: 'bearing', inputs: P({ Pu: 2000 }) }
];
