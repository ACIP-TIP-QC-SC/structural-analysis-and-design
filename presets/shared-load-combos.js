// Presets for shared/load-combos.
export const meta = { module: 'shared/load-combos', calc: 'js/modules/shared/load-combos.calc.js' };
const base = { quantity: 'force', D: 100, L: 60, Lr: 20, R: 0, W: 40, E: 50, H: 0, F: 0, T: 0, f1: 0.5 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'c1', test: 'SH-C1', name: 'Test: strength combinations, D 100, L 60, Lr 20, W 40, E 50', mode: 'strength', inputs: P({}),
    expect: { 'rows.203-1': 140, 'rows.203-2a': 226, 'rows.203-3a': 182, 'rows.203-3b': 172, 'rows.203-4a': 200, 'rows.203-5': 200, 'rows.203-6': 130, 'rows.203-6(-W)': 50, 'rows.203-7': 140, 'rows.203-7(-E)': 40, max: 226, min: 40, maxId: '203-2a', minId: '203-7(-E)' }, pass: null },
  { id: 'c2', test: 'SH-C1b', name: 'Test: allowable basic combinations, same loads', mode: 'basic', inputs: P({}),
    expect: { 'rows.203-8': 100, 'rows.203-9': 160, 'rows.203-10a': 120, 'rows.203-11a': 160, 'rows.203-12a': 124, 'rows.203-12b': 135.71, 'rows.203-13a': 178, 'rows.203-13b': 186.79, 'rows.203-13a(-W)': 142, 'rows.203-13b(-E)': 133.21 }, pass: null },
  { id: 'c3', name: 'Example: allowable alternate combinations, same loads', mode: 'alternate', inputs: P({}) },
  { id: 'c4', name: 'Example: beam moments, D 85, L 60, E 110 kN·m', mode: 'strength', inputs: P({ quantity: 'moment', D: 85, L: 60, Lr: 0, W: 0, E: 110 }) },
  {"id": "c5", "test": "SH-C3", "name": "Test: special seismic combinations, D 100, L 50, Em 112", "mode": "special", "inputs": {"quantity": "force", "D": 100, "L": 50, "Lr": 0, "R": 0, "W": 0, "E": 0, "H": 0, "F": 0, "T": 0, "f1": 0.5, "Em": 112}, "expect": {"rows.203-19": 257.0, "rows.203-19(-Em)": 33.0, "rows.203-20": 202.0, "rows.203-20(-Em)": -22.0, "max": 257.0, "min": -22.0, "maxId": "203-19", "minId": "203-20(-Em)"}, "pass": null}
];
