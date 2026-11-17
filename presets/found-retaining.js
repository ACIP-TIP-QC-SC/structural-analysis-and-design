// Presets for found/retaining. Wall dimensions in m (stem thickness in mm), per metre of wall.
export const meta = { module: 'found/retaining', calc: 'js/modules/found/retaining.calc.js' };
const base = { hs: 4.5, tTop: 400, tBot: 400, hb: 0.5, toe: 0.8, heel: 1.8, gamma: 18, phi: 30, beta: 0, q: 0, method: 'rankine', delta: 20, mu: 0.55, adhesion: 0, Dp: 0, qa: 200, gammaC: 24,
  fc: 28, fy: 420, dStem: 330, dbBase: 16, dbStem: 20, AsProv: null };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'r1', test: 'RW-1', name: 'Test: 5 m cantilever wall, level backfill, stability', mode: 'stability', inputs: P({}),
    expect: { KaRankine: 0.33333, Pa: 75.0, Mo: 125.0, V: 225.0, Mr: 403.38, FSot: 3.227, FSsl: 1.65, xbar: 1.2372, e: 0.26276, kern: 0.5, qmax: 114.41, qmin: 35.587 }, pass: true },
  { id: 'r1d', test: 'RW-1d', name: 'Test: the same wall, stem and base', mode: 'design', inputs: P({}), expect: { MuStem: 145.8, VuStem: 97.2, AsStem: 1207.8, AsMinStem: 720 }, pass: true },
  { id: 'r2', test: 'RW-2', name: "Test: coefficients for φ' 30, β 10°, δ 20°", mode: 'stability', inputs: P({ beta: 10, method: 'coulomb' }), expect: { KaRankine: 0.34952, KaCoulomb: 0.34002, Kp: 3.0 }, pass: true },
  { id: 'r3', name: 'Example: short base, sliding fails (fails on purpose)', mode: 'stability', inputs: P({ heel: 1.0, toe: 0.4, mu: 0.45 }) },
  { id: 'r4', name: 'Example: sloping backfill with a 10 kPa surcharge', mode: 'stability', inputs: P({ beta: 15, q: 10, heel: 2.4, toe: 1.0 }) }
];
