// Presets for rc/shear-torsion.
export const meta = { module: 'rc/shear-torsion', calc: 'js/modules/rc/shear-torsion.calc.js' };
const sh = { task: 'design', bw: 300, d: 440, fc: 28, fyt: 280, lambda: 1, dbs: 10, legs: 2, s: 150, Vu: 180 };
const to = { b: 350, h: 600, d: 540, cover: 45, fc: 28, fy: 420, fyt: 420, lambda: 1, dbs: 10, Tu: 40, Vu: 150, torsionType: 'equilibrium' };
const P = (o) => Object.assign({}, sh, o), T = (o) => Object.assign({}, to, o);
export default [
  { id: 's1', test: 'RC-S1', name: 'Test: stirrups designed, Vu = 180 kN', mode: 'shear', method: 'USD', inputs: P({}),
    expect: { Vc: 118.74, phiVc: 89.056, stirrups: 'designed', Av: 157.08, VsReq: 121.26, VsMax: 461.0, sStrength: 159.59, sMax: 220, sAvMin: 418.88, sUse: 159.59, sPractical: 150 }, pass: true },
  { id: 's2', test: 'RC-S2', name: 'Test: minimum stirrups, Vu = 60 kN', mode: 'shear', method: 'USD', inputs: P({ Vu: 60 }),
    expect: { halfPhiVc: 44.528, phiVc: 89.056, stirrups: 'minimum', VsReq: 0, sUse: 220, sPractical: 200 }, pass: true },
  { id: 's3', test: 'RC-S3', name: 'Test: heavy shear, closer spacing limit', mode: 'shear', method: 'USD', inputs: P({ bw: 350, d: 540, fc: 21, fyt: 420, Vu: 420 }),
    expect: { Vc: 147.24, phiVc: 110.43, VsReq: 412.76, vsBreak: 285.8, sMax: 135, sStrength: 86.31, sUse: 86.31, sPractical: 75 }, pass: true },
  { id: 's4', test: 'RC-S4', name: 'Test: analyze 10 mm stirrups at 150 mm', mode: 'shear', method: 'USD', inputs: P({ task: 'analyze' }),
    expect: { Vs: 129.01, phiVn: 185.82 }, pass: true },
  { id: 's5', name: 'Example: 250 × 400 beam, Vu = 95 kN', mode: 'shear', method: 'USD', inputs: P({ bw: 250, d: 340, fc: 21, Vu: 95 }) },
  { id: 't1', test: 'RC-T1', name: 'Test: equilibrium torsion, Tu = 40 kN·m', mode: 'torsion', method: 'USD', inputs: T({}),
    expect: { Acp: 210000, pcp: 1900, Aoh: 132600, ph: 1540, Ao: 112710, phiTth: 7.6455, phiTcr: 30.398, sectLhs: 2.2084, sectRhs: 3.294, AtS: 0.56332, AvS: 0.1322, total: 1.2588, minTotal: 0.29167, sReq: 124.78, sPractical: 100, sMax: 192.5, Al: 867.52, AlMin: 243.7 }, pass: true },
  { id: 't2', name: 'Example: compatibility torsion, Tu = 45 kN·m', mode: 'torsion', method: 'USD', inputs: T({ Tu: 45, torsionType: 'compatibility' }) },
  { id: 't3', name: 'Example: small torsion that may be neglected', mode: 'torsion', method: 'USD', inputs: T({ Tu: 6 }) }
];
