// Presets for found/mat. Coordinates in m from the mat centre.
export const meta = { module: 'found/mat', calc: 'js/modules/found/mat.calc.js' };
const xs = [-4.5, 0, 4.5], ys = [7.5, 2.5, -2.5, -7.5], Q = [[400, 500, 450], [1500, 1500, 1200], [1500, 1500, 1200], [400, 500, 350]];
const columns = [];
ys.forEach((y, i) => xs.forEach((x, j) => columns.push({ x, y, D: Q[i][j], L: 0 })));
const base = { B: 10, Lm: 16, columns, qa: 100, loads: 'service', strip: 'y', s1: -5, s2: -2.25 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'm1', test: 'MAT-1', name: 'Test: 10 × 16 m mat, twelve columns, strip x = −5 to −2.25', mode: 'rigid', inputs: P({}),
    expect: { Q: 11000, ex: -0.24545, ey: 0.068182, Ix: 3413.3, Iy: 1333.3, qAvg: 68.75, qA: 80.633, qB: 60.383, qC: 56.867, qD: 77.117,
      width: 2.75, qav: 76.091, soil: 3348.0, colSum: 3800, average: 3574.0, qmod: 81.227, F: 0.94052 }, pass: true },
  { id: 'm2', name: 'Example: the same mat with factored loads (all dead: 1.4 D)', mode: 'rigid', inputs: P({ loads: 'factored' }) },
  { id: 'm3', name: 'Example: interior strip in the x direction', mode: 'rigid', inputs: P({ strip: 'x', s1: 0, s2: 5 }) }
];
