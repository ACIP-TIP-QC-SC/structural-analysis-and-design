// Presets for rc/serviceability.
export const meta = { module: 'rc/serviceability', calc: 'js/modules/rc/serviceability.calc.js' };
const dfl = { b: 300, h: 500, d: 440, As: 1472.6, Asp: null, dp: 60, fc: 28, lambda: 1, span: 6000, loadCase: 'simpleUniform', wD: 15, wL: 10, PD: 40, PL: 25, Kt: 1, MaD: 60, MaDL: 100,
  psi: 0.3, duration: '5y', member: 'floor', elements: 'noDamage' };
const sp = { fy: 420, fsFrom: 'typed', fs: 280, cc: 50, sProv: null };
const D = (o) => Object.assign({}, dfl, o), P = (o) => Object.assign({}, sp, o);
const sv1 = { n: 8.0418, kd: 151.04, Icr: 1.3334e9, Ig: 3.125e9, fr: 3.2807, Mcr: 41.009, MaD: 67.5, MaDL: 112.5, IeD: 1.7352e9, IeDL: 1.4202e9, dD: 5.8657, dDL: 11.944, dL: 6.0787, limImmediate: 16.667, lam: 2.0, longTerm: 15.379, after: 21.457 };
export default [
  { id: 's1', test: 'SV-1', name: 'Test: 6 m simple span, elements not likely to be damaged', mode: 'deflection', method: 'USD', inputs: D({}), expect: Object.assign({ limAttached: 25.0 }, sv1),
    status: { 'Immediate live load deflection': 'OK', 'Deflection after attachment': 'OK' }, pass: true },
  { id: 's1b', test: 'SV-1b', name: 'Test: the same span supporting elements likely to be damaged (fails on purpose)', mode: 'deflection', method: 'USD', inputs: D({ elements: 'damage' }), expect: Object.assign({ limAttached: 12.5 }, sv1),
    status: { 'Deflection after attachment': 'NG' }, pass: false },
  { id: 's3', name: 'Example: cantilever 2 m with compression steel', mode: 'deflection', method: 'USD', inputs: D({ loadCase: 'cantileverUniform', span: 2000, Asp: 402, dp: 60, wD: 12, wL: 6 }) },
  { id: 's2', test: 'SV-2', name: 'Test: bar spacing, fs 280 MPa, cc 50 mm', mode: 'spacing', method: 'USD', inputs: P({}), expect: { sMax: 255.0 }, pass: null },
  { id: 's2b', test: 'SV-2b', name: 'Test: bar spacing, fs 250 MPa, cc 40 mm', mode: 'spacing', method: 'USD', inputs: P({ fs: 250, cc: 40 }), expect: { sMax: 325.6 }, pass: null },
  { id: 's2c', test: 'SV-2c', name: 'Test: bar spacing, fs 280 MPa, cc 75 mm', mode: 'spacing', method: 'USD', inputs: P({ cc: 75 }), expect: { sMax: 192.5 }, pass: null },
  { id: 's2d', name: 'Example: fs = 2/3 fy, 200 mm spacing provided', mode: 'spacing', method: 'USD', inputs: P({ fsFrom: 'default', sProv: 200 }) }
];
