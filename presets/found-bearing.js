// Presets for found/bearing. Soil units: m, kPa, kN/m³, degrees.
export const meta = { module: 'found/bearing', calc: 'js/modules/found/bearing.calc.js' };
const base = { shape: 'square', B: 1.5, Lf: 3.0, Df: 1.0, c: 0, phi: 30, gamma: 18, gammaSat: 20, water: 'none', Dw: 1.5, FS: 3, Q: null, e: null, beta: 0 };
const P = (o) => Object.assign({}, base, o);
const g4 = { Nc: 30.14, Nq: 18.401, Ng: 22.402, Fcs: 1.6105, Fqs: 1.5774, Fgs: 0.6, Fqd: 1.1925, Fcd: 1.2035 };
export default [
  { id: 'b1', test: 'FD-B1', name: 'Test: Terzaghi, square footing on sand', mode: 'terzaghi', inputs: P({}), expect: { Nc: 37.16, Nq: 22.46, Ng: 19.13, q: 18, qu: 610.88, qall: 203.63, qnet: 197.63, Qall: 458.16 }, pass: null },
  { id: 'b2', test: 'FD-B2', name: "Test: Terzaghi, strip footing, c' = 20 kPa, φ' = 25°", mode: 'terzaghi', inputs: P({ shape: 'strip', B: 1.2, c: 20, phi: 25, gamma: 17.5 }), expect: { q: 17.5, qu: 812.77, qall: 270.92, qnet: 265.09, Qall: 325.11 }, pass: null },
  { id: 'b3', test: 'FD-B3', name: 'Test: Terzaghi, square footing on clay, cu = 60 kPa', mode: 'terzaghi', inputs: P({ B: 2.0, Df: 1.5, c: 60, phi: 0 }), expect: { Nc: 5.70, qu: 471.6, qall: 157.2, qnet: 148.2, Qall: 628.8 }, pass: null },
  { id: 'b8', name: 'Example: Terzaghi, square footing carrying 400 kN', mode: 'terzaghi', inputs: P({ Q: 400 }) },
  { id: 'g4', test: 'FD-B4', name: 'Test: general equation, square footing on sand', mode: 'general', inputs: P({}), expect: Object.assign({ qu: 804.46, qall: 268.15 }, g4), pass: null },
  { id: 'g5', test: 'FD-B5', name: 'Test: general equation, 2 × 3 m rectangular footing', mode: 'general', inputs: P({ shape: 'rectangular', B: 2.0, Lf: 3.0, Df: 1.5, c: 15, phi: 28, gamma: 17 }),
    expect: { Nc: 25.803, Nq: 14.72, Ng: 16.717, Fcs: 1.3803, Fqs: 1.3545, Fgs: 0.73333, Fqd: 1.2245, Fcd: 1.2408, q: 25.5, qu: 1493.9, qall: 497.95 }, pass: null },
  { id: 'g6', test: 'FD-B6', name: 'Test: water table 0.5 m below the base (Case II)', mode: 'general', inputs: P({ water: 'depth', Dw: 1.5 }), expect: { waterCase: 'II', gammaPrime: 10.19, gammaEff: 12.793, qu: 751.97, qall: 250.66 }, pass: null },
  { id: 'g7', test: 'FD-B7', name: 'Test: water table above the base (Case I)', mode: 'general', inputs: P({ water: 'depth', Dw: 0.6 }), expect: { waterCase: 'I', q: 14.876, gammaEff: 10.19, qu: 617.6, qall: 205.87 }, pass: null },
  { id: 'g8', name: 'Example: eccentric load, 600 kN at e = 0.2 m', mode: 'general', inputs: P({ shape: 'rectangular', B: 2.0, Lf: 2.5, Q: 600, e: 0.2 }) }
];
