// Presets for rc/columns. Stored in SI.
export const meta = { module: 'rc/columns', calc: 'js/modules/rc/columns.calc.js' };
const ab = Math.PI * 25 * 25 / 4;
const ax = { task: 'analyze', shape: 'rect', b: 400, h: 400, D: 500, n: 8, db: 25, fc: 28, fy: 420, Pu: 2500, rho: 0.02 };
const ia = { b: 400, h: 400, fc: 28, fy: 420, confinement: 'tied', layerFrom: 'layers', n: 8, db: 25, cover: 40, tie: 10, arrangement: 'four',
  layers: [{ d: 62.5, As: 3 * ab }, { d: 200, As: 2 * ab }, { d: 337.5, As: 3 * ab }], cAt: null, Pu: 1500, Mu: 225 };
const ti = { detail: 'ties', db: 25, dt: 10, least: 400, sProv: null, D: 500, cover: 40, dsp: 10, fc: 28, fyt: 420 };
const sl = { shape: 'rect', b: 400, h: 400, D: 500, fc: 28, frame: 'braced', lu: 6000, k: 1, Pu: 1000, M2: 120, M1: 60, curvature: 'single', betaDns: 0.6, transverse: false };
const A = (o) => Object.assign({}, ax, o), I = (o) => Object.assign({}, ia, o), T = (o) => Object.assign({}, ti, o), L = (o) => Object.assign({}, sl, o);
export default [
  { id: 'c1', test: 'COL-1', name: 'Test: tied 400 × 400 column, 8-25 mm bars', mode: 'axial', method: 'USD', inputs: A({}),
    expect: { Ast: 3927.0, rhoG: 0.024544, Po: 5363.9, PnMax: 4291.1, phiPnMax: 2789.2, wsdAllow: 1716.4 }, pass: true },
  { id: 'c1w', name: 'Example: the same column in the WSD reference mode, P = 1500 kN', mode: 'axial', method: 'WSD', inputs: A({ Pu: 1500 }) },
  { id: 'c1b', test: 'COL-1b', name: 'Test: design a tied square column for Pu = 3000 kN, ρg = 0.02', mode: 'axial', method: 'USD', inputs: A({ task: 'design', Pu: 3000, rho: 0.02, b: null, h: null }),
    expect: { AgReq: 181860, side: 426.45, sideUse: 450, AstReq: 2397.1 }, pass: true },
  { id: 'c2', test: 'COL-2', name: 'Test: spiral column D 500, 8-25 mm bars', mode: 'axial', method: 'USD', inputs: A({ shape: 'circular', Pu: 3500 }),
    expect: { Ag: 196350, Po: 6229.0, phiPnMax: 3971.0 }, pass: true },
  { id: 'c9', name: 'Example: under-reinforced column, 4-16 mm bars (fails on purpose)', mode: 'axial', method: 'USD', inputs: A({ n: 4, db: 16, Pu: 2000 }) },
  { id: 'c3', test: 'COL-3', name: 'Test: interaction diagram, 400 × 400, three layers, point at c = 300', mode: 'interaction', method: 'USD', inputs: I({ cAt: 300, Pu: null, Mu: null }),
    expect: { 'balanced.c': 198.53, 'balanced.Pn': 1554.0, 'balanced.Mn': 349.22, 'balanced.phi': 0.65, 'balanced.phiPn': 1010.1, 'balanced.phiMn': 226.99,
      'tensionLimit.c': 126.56, 'tensionLimit.Pn': 476.04, 'tensionLimit.Mn': 291.46, 'tensionLimit.phi': 0.90, 'tensionLimit.phiPn': 428.44, 'tensionLimit.phiMn': 262.32,
      'atC.Pn': 3073.6, 'atC.Mn': 271.41, 'atC.et': 0.000375, 'atC.phiPn': 1997.8, 'atC.phiMn': 176.42,
      'pureBending.c': 94.639, 'pureBending.Mn': 243.84, 'pureBending.phiMn': 219.46, 'pureTension.Pn': -1649.3, 'pureTension.phiPn': -1484.4 }, pass: null },
  { id: 'c3b', test: 'COL-3b', name: 'Test: demand Pu 1500, Mu 225 (fails on purpose)', mode: 'interaction', method: 'USD', inputs: I({}),
    expect: { 'atE.c': 233.55, 'atE.Pn': 2164.6, 'atE.Mn': 324.69, 'atE.et': 0.0013354, 'atE.phi': 0.65, 'atE.phiPn': 1407.0, 'atE.phiMn': 211.05, 'atE.dc': 1.0661 },
    status: { 'Combined axial and bending': 'NG' }, pass: false },
  { id: 'c3c', name: 'Example: bars from the helper, Pu 1200, Mu 150', mode: 'interaction', method: 'USD', inputs: I({ layerFrom: 'helper', Pu: 1200, Mu: 150 }) },
  { id: 'c2b', test: 'COL-2b', name: 'Test: ties for 25 mm bars, 10 mm ties, 400 × 400 column', mode: 'ties', method: 'USD', inputs: T({ sProv: 400 }),
    expect: { tieMin: 10, s16: 400, s48: 480, sMax: 400 }, pass: true },
  { id: 'c2s', test: 'COL-2s', name: 'Test: spiral for D 500, cover 40, 10 mm spiral', mode: 'ties', method: 'USD', inputs: T({ detail: 'spiral' }),
    expect: { Ag: 196350, Dch: 420, Ach: 138540, rhoS: 0.012517, sMax: 58.336, clear: 48.336 }, pass: true },
  { id: 'c4', test: 'COL-4', name: 'Test: braced slender column, Pu 1000 kN', mode: 'slenderness', method: 'USD', inputs: L({}),
    expect: { klr: 50, limit: 28, Ec: 24870, EI: 1.3264e13, Pc: 3636.4, Cm: 0.80, M2min: 27.0, delta: 1.2631, Mc: 151.58 }, pass: true },
  { id: 'c5', test: 'COL-5', name: 'Test: the same column with Pu 1500 kN (stops on purpose)', mode: 'slenderness', method: 'USD', inputs: L({ Pu: 1500 }),
    expect: { delta: 1.7778 }, ok: false, errorIncludes: 'exceeds 1.4 times' },
  { id: 'c6', name: 'Example: short column, double curvature', mode: 'slenderness', method: 'USD', inputs: L({ lu: 3000, curvature: 'double', M1: 80 }) }
];
