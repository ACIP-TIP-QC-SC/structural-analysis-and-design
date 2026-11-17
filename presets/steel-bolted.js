// Presets for steel/bolted.
export const meta = { module: 'steel/bolted', calc: 'js/modules/steel/bolted.calc.js' };
const base = { grade: 'A325', bolt: 20, threads: 'N', planes: 1, lines: 2, perLine: 2, t: 12, Fu: 400, Le: 40, s: 75, edge: 'sheared', deformation: true, V: 300, T: null,
  surface: 'A', hole: 'std', level: 'service', Tslip: null, Nb: 1, layout: 'pattern', rows: 3, cols: 2, pitch: 75, gauge: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 75 }, { x: 100, y: 75 }], P: 150, angle: 0, ex: 200, ey: 0 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'b1', test: 'BT-1', name: 'Test: 4 M20 A325-N bolts in a 12 mm plate (LRFD)', mode: 'bearing', method: 'LRFD', inputs: P({}),
    expect: { Ab: 314.16, RnShear: 116.87, shearLRFD: 87.65, shearASD: 58.434, bearingEnd: 167.04, bearingOther: 230.4, bearingSum: 794.88, bearingLRFD: 596.16, shearN: 467.47, shearNLRFD: 350.6, connection: 350.6 }, governing: 'Bolt shear', pass: true },
  { id: 'b1a', test: 'BT-1a', name: 'Test: the same connection (ASD)', mode: 'bearing', method: 'ASD', inputs: P({ V: 200 }), expect: { shearNASD: 233.73, connection: 233.73 }, pass: true },
  { id: 'b2', test: 'BT-2', name: 'Test: combined, shear 50 and tension 60 per bolt (LRFD)', mode: 'bearing', method: 'LRFD', inputs: P({ V: 200, T: 60 }), expect: { frv: 159.15, FntMod: 452.32, combinedAvail: 106.58 }, pass: true },
  { id: 'b2a', test: 'BT-2a', name: 'Test: combined, shear 33 per bolt (ASD)', mode: 'bearing', method: 'ASD', inputs: P({ V: 132, T: 40 }), expect: { frv: 105.04, FntMod: 455.86, combinedAvail: 71.606 }, pass: true },
  { id: 'b5', name: 'Example: overloaded single-shear splice (fails on purpose)', mode: 'bearing', method: 'LRFD', inputs: P({ V: 420 }) },
  { id: 's1', test: 'BT-3', name: 'Test: slip-critical M20 A325, Class A, one plane (LRFD)', mode: 'slip', method: 'LRFD', inputs: P({ V: 200 }),
    expect: { RnSlip: 56.161, servLRFD: 56.161, servASD: 37.441, strLRFD: 47.737, strASD: 31.91 }, pass: true },
  { id: 's1b', test: 'BT-3b', name: 'Test: slip-critical with Tu = 30 kN on one bolt', mode: 'slip', method: 'LRFD', inputs: P({ V: 150, Tslip: 30, Nb: 1 }), expect: { ks: 0.81304 }, pass: true },
  { id: 's1c', test: 'BT-3c', name: 'Test: slip-critical with two slip planes', mode: 'slip', method: 'LRFD', inputs: P({ V: 300, planes: 2 }), expect: { RnSlipPlanes: 112.32 }, pass: true },
  { id: 'e1', test: 'BT-4', name: 'Test: eccentric group, 6 bolts, 150 kN at 200 mm (threads excluded)', mode: 'eccentric', method: 'LRFD', inputs: P({ threads: 'X' }),
    expect: { J: 37500, M: 30000, direct: 25.0, rx: 60.0, ry: 40.0, R: 88.459 }, pass: true },
  { id: 'e2', name: 'Example: the same group with threads included (fails on purpose)', mode: 'eccentric', method: 'LRFD', inputs: P({}) }
];
