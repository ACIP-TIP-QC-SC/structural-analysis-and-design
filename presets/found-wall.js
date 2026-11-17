// Presets for found/wall. Per metre of wall.
export const meta = { module: 'found/wall', calc: 'js/modules/found/wall.calc.js' };
const base = { wD: 180, wL: 120, t: 300, wallType: 'concrete', qa: 190, qaNet: false, Df: 1.2, gammaC: 24, gammaS: 18, fc: 21, fy: 420, h: 350, db: 16, dbl: 12 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'w1', test: 'FD-W1', name: 'Test: 300 mm concrete wall, wD 180, wL 120 kN/m', mode: 'design', inputs: P({}),
    expect: { qe: 166.3, Bcalc: 1.804, B: 1.9, wu: 408, qu: 214.74, d: 267, Vu: 114.45, phiVc: 156.0, dcShear: 0.73367, Mu: 68.716, AsReq: 702.6, AsMin: 630, sCalc: 286.17, sPractical: 275 }, pass: true },
  { id: 'w2', name: 'Example: 200 mm masonry wall, wD 90, wL 45 kN/m', mode: 'design', inputs: P({ wD: 90, wL: 45, t: 200, wallType: 'masonry', qa: 150, h: 300, db: 12, dbl: 10 }) }
];
