// Presets for found/pile-caps. Pile pattern and cap plan in m; thickness, depth, column, pile and bars in mm.
export const meta = { module: 'found/pile-caps', calc: 'js/modules/found/pile-caps.calc.js' };
const base = { n1: 2, n2: 2, sx: 1.2, sy: 1.2, dp: 400, pileShape: 'round', B: 2.0, Lc: 2.0, c1: 500, c2: 500, h: 700, d: 550, fc: 28, fy: 420, lambda: 1, db: 25,
  P: 2300, Mx: 0, My: 170, Qa: 700, Pu: 3200, Mux: 0, Muy: 240 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'r1', test: 'PC-1r', name: 'Test: 4 piles at 1.2 m, reactions', mode: 'reactions', inputs: P({}), expect: { Rhi: 900, Rlo: 700 }, pass: true },
  { id: 's1', test: 'PC-1', name: 'Test: 4-pile cap, d 550, shear', mode: 'shear', inputs: P({}),
    expect: { oneFrac: 0, Vu1: 0, phiVc1: 742.13, twoDist: 0.075, twoFrac: 0.6875, Vu2: 2200, bo: 4200, phiVc2: 3025.3, pileBo: 2984.5, phiVcPile: 2149.8, edgeWarning: true }, pass: true },
  { id: 'f1', test: 'PC-1f', name: 'Test: 4-pile cap, d 550, flexure', mode: 'flexure', inputs: P({}), expect: { Mu: 630.0, As: 3107.8, AsMin: 2520 }, pass: true },
  { id: 's2', test: 'PC-2', name: 'Test: the same cap with d 450 (fails on purpose)', mode: 'shear', inputs: P({ d: 450 }),
    expect: { oneFrac: 0.25, Vu1: 450, phiVc1: 607.2, twoFrac: 0.8125, Vu2: 2600, phiVc2: 2239.5 }, status: { 'Two-way shear at the column': 'NG' }, pass: false },
  { id: 'r2', name: 'Example: 3 × 3 piles at 1.0 m under 4500 kN', mode: 'reactions', inputs: P({ n1: 3, n2: 3, sx: 1.0, sy: 1.0, dp: 350, B: 2.8, Lc: 2.8, P: 3200, My: 0, Qa: 400, Pu: 4500, Muy: 0 }) }
];
