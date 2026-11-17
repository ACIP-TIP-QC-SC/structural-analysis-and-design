// Presets for steel/beams. W250x45 properties are stored as numbers.
export const meta = { module: 'steel/beams', calc: 'js/modules/steel/beams.calc.js' };
const sec = { shape: 'W250x45', Zx: 599.8e3, Sx: 530.9e3, ry: 34.8, J: 258.9e3, rts: 40.6, ho: 253.7, dsec: 267, tw: 7.6, bf: 148, tf: 13.0, bf2tf: 5.70, htw: 29.5, Ix: 70.759e6, Zy: 144.9e3, Sy: 94.23e3, grade: 'A992', Fy: 345 };
const flex = Object.assign({}, sec, { axis: 'major', Lb: 1200, cbFrom: 'typed', Cb: 1.0, Mmax: 100, MA: 75, MB: 100, MC: 75, Mreq: 120 });
const shr = Object.assign({}, sec, { V: 250 });
const dfl = Object.assign({}, sec, { defCase: 'simpleUniform', span: 6000, load: 12, limitRatio: 360 });
const X = (o) => Object.assign({}, flex, o);
const common = { Mp: 206.93, Lp: 1474.7, Lr: 4907.9 };
export default [
  { id: 'b1', test: 'ST-B1', name: 'Test: W250x45, Lb = 1.2 m (yielding)', mode: 'flexure', method: 'LRFD', inputs: X({}), expect: Object.assign({ zone: 'yielding', Mn: 206.93, LRFD: 186.24, ASD: 123.91, flangeLp: 9.1493, webLp: 90.53, flange: 'compact', web: 'compact' }, common), pass: true },
  { id: 'b2', test: 'ST-B2', name: 'Test: W250x45, Lb = 3 m (inelastic LTB)', mode: 'flexure', method: 'LRFD', inputs: X({ Lb: 3000 }), expect: Object.assign({ zone: 'inelastic', Mn: 171.96, LRFD: 154.76, ASD: 102.97, avail: 154.76 }, common), pass: true },
  { id: 'b3', test: 'ST-B3', name: 'Test: W250x45, Lb = 7 m (elastic LTB)', mode: 'flexure', method: 'ASD', inputs: X({ Lb: 7000, Mreq: 40 }), expect: Object.assign({ zone: 'elastic', Mn: 82.352, LRFD: 74.117, ASD: 49.312, avail: 49.312 }, common), pass: true },
  { id: 'b4', test: 'ST-B4', name: 'Test: W250x45, Lb = 3 m, Cb = 1.14', mode: 'flexure', method: 'LRFD', inputs: X({ Lb: 3000, Cb: 1.14 }), expect: { Mn: 196.03, LRFD: 176.43, ASD: 117.38 }, pass: true },
  { id: 'b7', name: 'Example: Cb from the moment diagram, Lb = 4 m', mode: 'flexure', method: 'LRFD', inputs: X({ Lb: 4000, cbFrom: 'moments', Mmax: 150, MA: 112.5, MB: 150, MC: 112.5, Mreq: 150 }) },
  { id: 'b5', test: 'ST-B5', name: 'Test: W250x45 shear strength (LRFD)', mode: 'shear', method: 'LRFD', inputs: shr, expect: { shearLimit: 53.93, Cv: 1.0, Vn: 420.04, LRFD: 420.04, ASD: 280.03, avail: 420.04 }, pass: true },
  { id: 'b5a', test: 'ST-B5a', name: 'Test: W250x45 shear strength (ASD)', mode: 'shear', method: 'ASD', inputs: Object.assign({}, shr, { V: 170 }), expect: { Vn: 420.04, avail: 280.03 }, pass: true },
  { id: 'b6', test: 'ST-B6', name: 'Test: deflection, 6 m simple span, 12 kN/m live load', mode: 'deflection', method: 'LRFD', inputs: dfl, expect: { delta: 14.309, limit: 16.667 }, pass: true, status: { Deflection: 'OK' } },
  { id: 'b8', name: 'Example: cantilever 2 m with a 15 kN end load', mode: 'deflection', method: 'LRFD', inputs: Object.assign({}, dfl, { defCase: 'cantileverPoint', span: 2000, load: 15, limitRatio: 180 }) }
];
