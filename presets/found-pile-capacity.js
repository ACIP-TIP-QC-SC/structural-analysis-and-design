// Presets for found/pile-capacity.
export const meta = { module: 'found/pile-capacity', calc: 'js/modules/found/pile-capacity.calc.js' };
const sand = [{ t: 20, gamma: 17, phi: 35, cu: 0 }], clay = [{ t: 25, gamma: 18, phi: 0, cu: 60 }];
const base = { shape: 'round', D: 0.4, L: 15, layers: sand, wt: null, K: 1.3, delta: 28, FS: 3, Q: null, n1: 3, n2: 4, sp: 1.2, Qu: 1692.34, soil: 'sand', cu: 60, Nc: 9 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'p1', test: 'PL-1', name: 'Test: 0.4 m round pile, 15 m in dry sand', mode: 'skin', inputs: P({}),
    expect: { Ap: 0.12566, p: 1.2566, qNq: 36465, ql: 5006.5, Qp: 629.13, Lcrit: 6.0, fMax: 70.505, Qs: 1063.2, Qu: 1692.3, Qall: 564.11 }, pass: null },
  { id: 'p1p', test: 'PL-1p', name: 'Test: point resistance only, the same pile', mode: 'point', inputs: P({}), expect: { NqStar: 143, Qp: 629.13 }, pass: null },
  { id: 'p2', test: 'PL-2', name: 'Test: 0.4 m round pile, 20 m in clay, cu 60 kPa', mode: 'skin', inputs: P({ L: 20, layers: clay }), expect: { Qp: 67.858, Qs: 934.94, Qu: 1002.8, Qall: 334.27 }, pass: null },
  { id: 'p4', name: 'Example: two layers with a water table, load 300 kN', mode: 'skin', inputs: P({ L: 18, layers: [{ t: 6, gamma: 18, phi: 0, cu: 40 }, { t: 15, gamma: 19, phi: 32, cu: 0 }], wt: 3, Q: 300, K: 1.0, delta: 22 }) },
  { id: 'g1', test: 'PL-3', name: 'Test: 3 × 4 group in sand, spacing 1.2 m', mode: 'group', inputs: P({}), expect: { theta: 18.435, eta: 0.70982, Qg: 14415 }, pass: null },
  { id: 'g2', test: 'PL-3b', name: 'Test: 3 × 4 group in clay, block failure checked', mode: 'group', inputs: P({ soil: 'clay', Qu: 1002.80, L: 20 }), expect: { block: 22368, sumQu: 12034, Qg: 12034 }, pass: null }
];
