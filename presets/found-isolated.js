// Presets for found/isolated. Plan dimensions in m; h, column and bars in mm.
export const meta = { module: 'found/isolated', calc: 'js/modules/found/isolated.calc.js' };
const base = { PD: 800, PL: 600, c1: 400, c2: 400, qa: 200, qaNet: false, Df: 1.5, gammaC: 24, gammaS: 18, fc: 21, fy: 420, h: 550, db: 20, plan: 'square', B: 2.9, L: 2.9, Ms: null, Mu: null, Pu: null };
const P = (o) => Object.assign({}, base, o);
const i1 = { qe: 169.7, Areq: 8.2499, B: 2.9, Pu: 1920, qu: 228.30, d: 455, Vu1: 526.34, phiVc1: 770.96, dc1: 0.68272, bo: 3420, Vu2: 1753.1, vc: 1.5122, phiVc2: 1764.9, dc2: 0.99331, Mu: 517.24, Rn: 0.95726, AsReq: 3092.7, AsMin: 2871, AsUse: 3092.7, bars: 10 };
export default [
  { id: 'i1', test: 'FD-I1', name: 'Test: 400 × 400 column, PD 800, PL 600 kN', mode: 'design', inputs: P({}), expect: Object.assign({ Bcalc: 2.8723 }, i1), status: { 'Two-way shear': 'NEAR', 'One-way shear': 'OK' }, pass: true },
  { id: 'i2', test: 'FD-I2', name: 'Test: 350 × 350 column, PD 500, PL 350 kN, Grade 280', mode: 'design', inputs: P({ PD: 500, PL: 350, c1: 350, c2: 350, qa: 150, Df: 1.2, fc: 28, fy: 280, h: 450, db: 16 }),
    expect: { qe: 125.7, Bcalc: 2.6004, B: 2.7, Pu: 1160, qu: 159.12, d: 359, dc1: 0.53609, bo: 2836, Vu2: 1080.0, phiVc2: 1333.4, dc2: 0.80998, Mu: 296.58, AsReq: 3346.2, AsMin: 2430, bars: 17 }, pass: true },
  { id: 'i3', name: 'Example: rectangular footing 3.4 m long, with moment', mode: 'design', inputs: P({ plan: 'rect', L: 3.4, h: 600, Ms: 120, Mu: 170 }) },
  { id: 'a1', test: 'FD-I1a', name: 'Test: analyze the 2.9 m square footing', mode: 'analyze', inputs: P({}), expect: i1, pass: true },
  { id: 'a2', name: 'Example: footing too thin for punching (fails on purpose)', mode: 'analyze', inputs: P({ h: 450 }) }
];
