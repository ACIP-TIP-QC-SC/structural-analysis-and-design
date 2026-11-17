// Presets for rc/one-way-slab.
export const meta = { module: 'rc/one-way-slab', calc: 'js/modules/rc/one-way-slab.calc.js' };
const base = { span: 3600, support: 'oneEnd', h: 150, dFrom: 'cover', cover: 20, d: 120, dbm: 12, dbt: 10, fc: 21, fy: 280, muFrom: 'typed', Mu: 18, wD: 4.8, wL: 2.4, Vu: null };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'sl1', test: 'RC-SL1', name: 'Test: 150 mm slab, one end continuous, Mu = 18 kN·m/m', mode: 'strip', method: 'USD', inputs: P({ dFrom: 'typed' }),
    expect: { hmin: 120.0, Rn: 1.3889, rho: 0.005170, AsReq: 620.39, AsMin: 300, sCalc: 182.3, sPractical: 175, sMaxMain: 450, AsTemp: 300, sTemp: 261.8, sTempPractical: 250, sMaxTemp: 450, phiVc: 70.113 }, pass: true, equilibrium: true },
  { id: 'sl2', test: 'RC-SL2', name: 'Test: 125 mm slab, both ends continuous, Mu = 9 kN·m/m', mode: 'strip', method: 'USD', inputs: P({ span: 3000, support: 'bothEnds', h: 125, dFrom: 'typed', d: 100, fc: 28, fy: 420, dbm: 10, Mu: 9 }),
    expect: { hmin: 107.14, Rn: 1.000, rho: 0.0024332, AsReq: 243.32, AsMin: 225, sCalc: 322.79, sPractical: 300, sMaxMain: 375, sTemp: 349.07 }, pass: true, equilibrium: true },
  { id: 'sl3', name: 'Example: simple span 3.0 m from floor loads', mode: 'strip', method: 'USD', inputs: P({ span: 3000, support: 'simple', h: 150, fc: 28, fy: 420, muFrom: 'loads', wD: 5.2, wL: 4.8, Vu: 20 }) }
];
