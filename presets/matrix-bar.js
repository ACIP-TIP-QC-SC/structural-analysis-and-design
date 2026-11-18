// Tests of matrix/bar (hand-off Section 9, Phase M4), written for this calculator.
// expect = the closed-form hand solutions and expectRef = the independent numpy DSM, both from
// tools/bar_reference.py (output in tools/bar_reference_output.txt). Units: kN, m, kPa (consistent).
export const meta = { module: 'matrix/bar', calc: 'js/modules/matrix/bar.calc.js' };
export default [
 {
  "id": "br-1",
  "name": "Test: two elements between walls with a point load, a linear load and a node load (hand solution and independent DSM)",
  "mode": "nodes",
  "units": "kN, m",
  "test": "BR-1",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "support": "fixed"
    },
    {
     "id": 2,
     "support": "free",
     "FX": 30.0
    },
    {
     "id": 3,
     "support": "fixed"
    }
   ],
   "members": [
    {
     "i": 1,
     "j": 2,
     "E": 200000000.0,
     "A": 0.001,
     "L": 2.0
    },
    {
     "i": 2,
     "j": 3,
     "E": 70000000.0,
     "A": 0.0015,
     "L": 3.0
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "P": 60.0,
     "a": 1.2
    },
    {
     "member": 2,
     "w1": 5.0,
     "w2": 15.0
    }
   ]
  },
  "expect": {
   "U.U2": 0.0005814814814814814,
   "N1.1": 82.14814814814815,
   "N2.1": 22.148148148148145,
   "N1.2": -7.851851851851851,
   "N2.2": -37.85185185185185,
   "R.F1": -82.14814814814815,
   "R.F3": -37.85185185185185
  },
  "expectRef": {
   "U.U1": 0.0,
   "U.U2": 0.0005814814814814814,
   "U.U3": 0.0,
   "R.F1": -82.14814814814815,
   "R.F3": -37.85185185185185,
   "N1.1": 82.14814814814815,
   "N1.2": -7.851851851851851,
   "N2.1": 22.148148148148145,
   "N2.2": -37.85185185185185
  }
 },
 {
  "id": "br-2",
  "name": "Test: steel bar between walls heated 40 degrees, N = \u2212EA\u03b1\u0394T (hand solution and independent DSM)",
  "mode": "nodes",
  "units": "kN, m",
  "test": "BR-2",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "support": "fixed"
    },
    {
     "id": 2,
     "support": "free"
    },
    {
     "id": 3,
     "support": "fixed"
    }
   ],
   "members": [
    {
     "i": 1,
     "j": 2,
     "E": 200000000.0,
     "A": 0.002,
     "L": 2.0
    },
    {
     "i": 2,
     "j": 3,
     "E": 200000000.0,
     "A": 0.002,
     "L": 2.0
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "alpha": 1.17e-05,
     "dT": 40.0
    },
    {
     "member": 2,
     "alpha": 1.17e-05,
     "dT": 40.0
    }
   ]
  },
  "expect": {
   "U.U2": 0.0,
   "N1.1": -187.2,
   "N2.1": -187.2,
   "N1.2": -187.2,
   "N2.2": -187.2,
   "R.F1": 187.2,
   "R.F3": -187.2
  },
  "expectRef": {
   "U.U1": 0.0,
   "U.U2": 0.0,
   "U.U3": 0.0,
   "R.F1": 187.2,
   "R.F3": -187.2,
   "N1.1": -187.2,
   "N1.2": -187.2,
   "N2.1": -187.2,
   "N2.2": -187.2
  }
 },
 {
  "id": "br-3",
  "name": "Test: bolt and sleeve, bolt 0.2 mm too short (misfit) and both heated 50 degrees (hand solution and independent DSM)",
  "mode": "nodes",
  "units": "kN, m",
  "test": "BR-3",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "support": "fixed"
    },
    {
     "id": 2,
     "support": "free"
    }
   ],
   "members": [
    {
     "i": 1,
     "j": 2,
     "E": 200000000.0,
     "d": 0.02,
     "L": 0.15
    },
    {
     "i": 1,
     "j": 2,
     "E": 70000000.0,
     "A": 0.0006,
     "L": 0.15
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "e0": -0.0002,
     "alpha": 1.17e-05,
     "dT": 50.0
    },
    {
     "member": 2,
     "alpha": 2.3e-05,
     "dT": 50.0
    }
   ]
  },
  "expect": {
   "U.U2": 1.832691944874155e-06,
   "N1.1": 47.78684625543522,
   "N2.1": 47.78684625543522,
   "N1.2": -47.78684625543522,
   "N2.2": -47.78684625543522,
   "R.F1": 0.0
  },
  "expectRef": {
   "U.U1": 0.0,
   "U.U2": 1.8326919448741573e-06,
   "R.F1": 0.0,
   "N1.1": 47.78684625543523,
   "N1.2": -47.78684625543523,
   "N2.1": 47.78684625543523,
   "N2.2": -47.78684625543523
  }
 }
];
