// Presets for rc/development.
export const meta = { module: 'rc/development', calc: 'js/modules/rc/development.calc.js' };
const base = { db: 25, fc: 28, fy: 420, lambda: 1, top: false, coating: 'none', favourable: true, method: 'general', cb: 50, Atr: null, sTr: null, nSpliced: null, excess: null, available: null,
  psiC: false, psiR: false, confined: false, ratio2: false, half: false, db2: null, lapType: 'tension' };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'd1', test: 'DEV-1', name: 'Test: 25 mm bottom bar in tension', mode: 'tension', inputs: P({}), expect: { ldSimpleGood: 1167.2, ldSimpleOther: 1803.9, ldGeneral: 902.0, conf: 2.0, ld: 902.0 }, pass: null },
  { id: 'd1b', test: 'DEV-1b', name: 'Test: 16 mm top bar in tension', mode: 'tension', inputs: P({ db: 16, top: true, cb: 40 }), expect: { ldSimpleGood: 786.17, ldGeneral: 480.28, conf: 2.5, ld: 480.28 }, pass: null },
  { id: 'd1c', name: 'Example: 20 mm bar with 600 mm available (fails on purpose)', mode: 'tension', inputs: P({ db: 20, cb: 40, available: 600, coating: 'epoxyClose' }) },
  { id: 'd2', test: 'DEV-2', name: 'Test: standard hook, 20 mm bar', mode: 'hooks', inputs: P({ db: 20 }), expect: { ldh: 380.99, min8db: 160 }, pass: null },
  { id: 'd2b', test: 'DEV-2b', name: 'Test: standard hook, 20 mm bar with ψc = 0.7', mode: 'hooks', inputs: P({ db: 20, psiC: true }), expect: { ldh: 266.69 }, pass: null },
  { id: 'd3', test: 'DEV-3', name: 'Test: 25 mm bar in compression', mode: 'compression', inputs: P({}), expect: { ldcA: 476.24, ldcB: 451.5, ldc: 476.24 }, pass: null },
  { id: 'd4', test: 'DEV-4', name: 'Test: lap splices, 25 mm bars, simplified favourable ℓd', mode: 'laps', inputs: P({ method: 'simplified' }), expect: { classA: 1167.2, classB: 1517.4, lapClass: 'B', lapTension: 1517.4, lapComp: 745.5 }, pass: null },
  { id: 'd4b', test: 'DEV-4b', name: 'Test: compression lap with fy = 520 MPa', mode: 'laps', inputs: P({ method: 'simplified', fy: 520 }), expect: { lapComp: 1090.0 }, pass: null },
  { id: 'd4c', test: 'DEV-4c', name: "Test: compression lap with f'c = 17 MPa", mode: 'laps', inputs: P({ method: 'simplified', fc: 17 }), expect: { lapComp: 994.0 }, pass: null },
  { id: 'd4d', name: 'Example: Class A lap with 1.2 m available', mode: 'laps', inputs: P({ method: 'simplified', ratio2: true, half: true, available: 1200 }) }
];
