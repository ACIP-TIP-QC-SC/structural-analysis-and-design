// Presets for steel/beam-columns.
export const meta = { module: 'steel/beam-columns', calc: 'js/modules/steel/beam-columns.calc.js' };
const sec = { shape: 'W250x73', Ag: 9290, rx: 110, ry: 64.5, bf2tf: 8.93, htw: 23.1, Zx: 989.8e3, Sx: 894.7e3, J: 578.6e3, rts: 72.1, ho: 239.8, Zy: 463.8e3, Sy: 306.4e3,
  dsec: 254, bf: 254, tf: 14.2, tw: 8.6, Ix: 113.21e6, Iy: 38.88e6, grade: 'A992', Fy: 345 };
const ia = Object.assign({}, sec, { Kx: 1, Lx: 4000, Ky: 1, Ly: 4000, Lb: 4000, Cb: 1.0, Pr: 800, Mrx: 120, Mry: 0 });
const am = Object.assign({}, sec, { axis: 'major', K1L: 4000, b1From: 'computed', B1: 1.0, cmFrom: 'typed', Cm: 1.0, M1: 60, M2: 120, curvature: 'single',
  Pnt: 800, Plt: 0, Mnt: 100, Mlt: 60, sway: false, pe2From: 'storey', frame: 'moment', SH: 300, dH: 12, Lst: 4000, SPe2: 85000, SPnt: 6000 });
const I = (o) => Object.assign({}, ia, o), A = (o) => Object.assign({}, am, o);
const bc1 = { klr: 62.016, Fe: 513.25, Fcr: 260.40, Pn: 2419.1, Lp: 2733.2, Lr: 9626.5, Mp: 341.48, Mnx: 318.43, flange: 'compact' };
export default [
  { id: 'i1', test: 'BC-1', name: 'Test: W250x73, Pr 800, Mrx 120 (LRFD)', mode: 'interaction', method: 'LRFD', inputs: I({}), expect: Object.assign({ Pc: 2177.2, Mcx: 286.59, ratio: 0.36745, eq: 'a', interaction: 0.73964 }, bc1), pass: true },
  { id: 'i1a', test: 'BC-1a', name: 'Test: W250x73, Pa 530, Mrx 80 (ASD)', mode: 'interaction', method: 'ASD', inputs: I({ Pr: 530, Mrx: 80 }), expect: Object.assign({ Pc: 1448.5, Mcx: 190.68, ratio: 0.36588, eq: 'a', interaction: 0.73882 }, bc1), pass: true },
  { id: 'i2', name: 'Example: light axial load with biaxial bending (Eq. b)', mode: 'interaction', method: 'LRFD', inputs: I({ Pr: 250, Mrx: 150, Mry: 30 }) },
  { id: 'i3', name: 'Example: overloaded beam-column (fails on purpose)', mode: 'interaction', method: 'LRFD', inputs: I({ Pr: 1400, Mrx: 150 }) },
  { id: 'b1', test: 'BC-2', name: 'Test: B1 with Cm 1.0, Pr 800 (LRFD)', mode: 'amplify', method: 'LRFD', inputs: A({}), expect: { Pe1: 13967, B1: 1.0608 }, pass: null },
  { id: 'b1b', test: 'BC-2b', name: 'Test: B1 with Cm 0.4 (the minimum governs)', mode: 'amplify', method: 'LRFD', inputs: A({ Cm: 0.4 }), expect: { B1: 1.0 }, pass: null },
  { id: 'b1c', test: 'BC-2c', name: 'Test: B1 with Cm 1.0, Pr 530 (ASD)', mode: 'amplify', method: 'ASD', inputs: A({ Pnt: 530 }), expect: { B1: 1.0646 }, pass: null },
  { id: 'b2', test: 'BC-3', name: 'Test: B2 in a moment frame, Mnt 100, Mlt 60 (LRFD)', mode: 'amplify', method: 'LRFD', inputs: A({ sway: true, b1From: 'typed', B1: 1.0 }), expect: { SPe2: 85000, B2: 1.0759, Mr: 164.56 }, pass: null },
  { id: 'b2a', test: 'BC-3a', name: 'Test: B2 with ΣPnt 4000 (ASD)', mode: 'amplify', method: 'ASD', inputs: A({ sway: true, b1From: 'typed', B1: 1.0, SPnt: 4000 }), expect: { SPe2: 85000, B2: 1.0814 }, pass: null }
];
