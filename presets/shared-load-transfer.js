// Presets for shared/load-transfer.
export const meta = { module: 'shared/load-transfer', calc: 'js/modules/shared/load-transfer.calc.js' };
const pan = { S: 4, Lg: 6, wD: 4.8, wL: 2.4, loadType: 'factored', bothSides: false };
const tak = { wD: 4.8, wL: 2.4, roofD: 4.8, roofL: 2.4, tribW: 3, beamSpan: 6, bw: 300, bh: 500, gammaC: 24, wWall: 0, colW: 6, colL: 7.5, floors: 3, extraD: 0 };
export default [
  { id: 'l1', test: 'SH-L1', name: 'Test: 4 × 6 m panel, two-way', mode: 'panel', inputs: pan,
    expect: { ratio: 1.5, action: 'two-way', w: 9.6, peak: 19.2, shortTotal: 38.4, longTotal: 76.8, sum: 230.4, total: 230.4, shortEqM: 12.8, longEqM: 16.356 }, pass: null },
  { id: 'l2', test: 'SH-L2', name: 'Test: 3 × 7.5 m panel, one-way', mode: 'panel', inputs: Object.assign({}, pan, { S: 3, Lg: 7.5 }), expect: { ratio: 2.5, action: 'one-way', longLine: 14.4, sum: 216, total: 216 }, pass: null },
  { id: 'l3', name: 'Example: interior beam between two 3.5 × 5 m panels', mode: 'panel', inputs: Object.assign({}, pan, { S: 3.5, Lg: 5, bothSides: true }) },
  { id: 'k1', test: 'SH-L2b', name: 'Test: column with a 6 × 7.5 m tributary area', mode: 'takeoff', inputs: tak, expect: { area: 45, perFloorFactored: 432, PD: 864, PL: 432 }, pass: null },
  { id: 'k2', name: 'Example: two-storey frame with a wall load on the beam', mode: 'takeoff', inputs: Object.assign({}, tak, { floors: 1, wWall: 8, colW: 4, colL: 5, tribW: 4, beamSpan: 5, extraD: 20 }) }
];
