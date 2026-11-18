// Presets for matrix/beam, generated from the Excel test tabs by tools/make_presets.py.
// units "consistent": every number is in the workbook tab's own force and length units (see "units").
// expect = the tab's EXPECTED ANSWERS (book or workbook values); expectRef = every DOF, reaction and
// member end force from tools/matrix_reference.py (independent numpy solver).
export const meta = { module: 'matrix/beam', calc: 'js/modules/matrix/beam.calc.js' };
export default [
 {
  "id": "bm-1",
  "name": "Test: Test 1, reactions from the record of BEAM TEST PROB 3 (as printed); the other rows are the original program's Excel-saved results",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 1",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 3.0,
     "support": "free"
    },
    {
     "id": 3,
     "x": 7.0,
     "support": "pin",
     "M": 10.0
    },
    {
     "id": 4,
     "x": 9.0,
     "support": "free",
     "FY": -8.0
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 200000000.0,
     "I": 0.0002,
     "release": "none"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 200000000.0,
     "I": 0.0002,
     "release": "none"
    },
    {
     "id": 3,
     "i": 3,
     "j": 4,
     "E": 200000000.0,
     "I": 0.0002,
     "release": "none"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "point",
     "value": -24.0,
     "a": 1.2
    },
    {
     "member": 1,
     "type": "couple",
     "value": 15.0,
     "a": 2.0
    },
    {
     "member": 2,
     "type": "linear",
     "value": 0.0,
     "w2": -12.0,
     "a": 0.0
    },
    {
     "member": 3,
     "type": "uniform",
     "value": -6.0,
     "a": 0.0
    }
   ]
  },
  "test": "BM-1",
  "expect": {
   "R.Fv1": 27.353,
   "R.M1": 23.271,
   "R.Fv3": 40.647,
   "U.Uv2": -0.00031142973761,
   "U.D2": -1.508483965e-05,
   "U.D3": -8.567142857e-05,
   "U.Uv4": -0.00100467619048,
   "U.D4": -0.00068567142857,
   "Q.1.2": 23.27053061226667,
   "Q.1.4": 0.5882682215999999,
   "Q.2.2": -0.588268221549999,
   "Q.2.4": -17.99999999995,
   "Q.3.2": 28.000000000399996
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": -0.000311429738,
   "U.D2": -1.508484e-05,
   "U.Uv3": 0.0,
   "U.D3": -8.5671429e-05,
   "U.Uv4": -0.00100467619,
   "U.D4": -0.000685671429,
   "R.Fv1": 27.352932944606,
   "R.M1": 23.270530612245,
   "R.Fv3": 40.647067055394,
   "Q.1.1": 27.352932944606,
   "Q.1.2": 23.270530612245,
   "Q.1.3": -3.352932944606,
   "Q.1.4": 0.588268221574,
   "Q.2.1": 3.352932944606,
   "Q.2.2": -0.588268221574,
   "Q.2.3": 20.647067055394,
   "Q.2.4": -18.0,
   "Q.3.1": 20.0,
   "Q.3.2": 28.0,
   "Q.3.3": -8.0,
   "Q.3.4": 0.0
  }
 },
 {
  "id": "bm-2",
  "name": "Test: Test 2, M1 and M3 from Hibbeler Prob. 15-2 (book answers as printed); the other rows are the original program's Excel-saved results",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 2",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 6.0,
     "support": "pin",
     "settle": 0.005
    },
    {
     "id": 3,
     "x": 10.0,
     "support": "fixed"
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 60000.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 60000.0,
     "I": 1.0,
     "release": "none"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "uniform",
     "value": -25.0,
     "a": 0.0
    }
   ]
  },
  "test": "BM-2",
  "expect": {
   "R.Fv1": 59.5833333333333,
   "R.M1": 27.5,
   "R.Fv2": 149.479166666667,
   "R.Fv3": -59.0625,
   "R.M3": 116.25,
   "U.D2": 0.000125,
   "Q.1.2": 27.5,
   "Q.1.4": -120.0,
   "Q.2.2": 120.0,
   "Q.2.4": 116.25
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": 0.005,
   "U.D2": 0.000125,
   "U.Uv3": 0.0,
   "U.D3": 0.0,
   "R.Fv1": 59.583333333333,
   "R.M1": 27.5,
   "R.Fv2": 149.479166666667,
   "R.Fv3": -59.0625,
   "R.M3": 116.25,
   "Q.1.1": 59.583333333333,
   "Q.1.2": 27.5,
   "Q.1.3": 90.416666666667,
   "Q.1.4": -120.0,
   "Q.2.1": 59.0625,
   "Q.2.2": 120.0,
   "Q.2.3": -59.0625,
   "Q.2.4": 116.25
  }
 },
 {
  "id": "bm-3",
  "name": "Test: Test 3, reactions from Hibbeler Prob. 15-6 (book answers as printed); the other rows are the original program's Excel-saved results (E x I = 1)",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 3",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 6.0,
     "support": "pin"
    },
    {
     "id": 3,
     "x": 14.0,
     "support": "pin"
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "uniform",
     "value": -10.0,
     "a": 0.0
    },
    {
     "member": 2,
     "type": "uniform",
     "value": -10.0,
     "a": 0.0
    }
   ]
  },
  "test": "BM-3",
  "expect": {
   "R.Fv1": 22.0,
   "R.M1": 14.0,
   "R.Fv2": 85.75,
   "R.Fv3": 32.25,
   "U.D2": -48.0,
   "U.D3": 130.666666666667,
   "Q.1.2": 14.0,
   "Q.1.4": -62.0,
   "Q.2.2": 62.000000000000085
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": 0.0,
   "U.D2": -48.0,
   "U.Uv3": 0.0,
   "U.D3": 130.666666666667,
   "R.Fv1": 22.0,
   "R.M1": 14.0,
   "R.Fv2": 85.75,
   "R.Fv3": 32.25,
   "Q.1.1": 22.0,
   "Q.1.2": 14.0,
   "Q.1.3": 38.0,
   "Q.1.4": -62.0,
   "Q.2.1": 47.75,
   "Q.2.2": 62.0,
   "Q.2.3": 32.25,
   "Q.2.4": 0.0
  }
 },
 {
  "id": "bm-4",
  "name": "Test: Test 4, reactions and end moments from the hand solution on this tab (slope-deflection, as written, ccw +); displacements are the original progr",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 4",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 3.0,
     "support": "pin"
    },
    {
     "id": 3,
     "x": 7.0,
     "support": "pin"
    },
    {
     "id": 4,
     "x": 8.0,
     "support": "free",
     "FY": -30.0
    },
    {
     "id": 5,
     "x": 9.0,
     "support": "free",
     "FY": -40.0
    },
    {
     "id": 6,
     "x": 10.0,
     "support": "pin"
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 3,
     "i": 3,
     "j": 4,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 4,
     "i": 4,
     "j": 5,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 5,
     "i": 5,
     "j": 6,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "uniform",
     "value": -10.0,
     "a": 0.0
    },
    {
     "member": 2,
     "type": "uniform",
     "value": -10.0,
     "a": 0.0
    }
   ]
  },
  "test": "BM-4",
  "expect": {
   "R.Fv1": 14.8308,
   "R.M1": 7.3304,
   "R.Fv2": 31.141,
   "R.Fv3": 65.3451,
   "R.Fv6": 28.6831,
   "U.D2": -0.25157232704403,
   "U.D3": -10.4926624737945,
   "U.Uv4": -15.5823433496389,
   "U.D4": -13.7858141160028,
   "U.Uv5": -18.7992080130445,
   "U.D5": 9.23829489867225,
   "U.D6": 23.5796645702306,
   "Q.1.2": 7.3304,
   "Q.1.4": -7.8379,
   "Q.2.2": 7.8379,
   "Q.2.4": -23.9507,
   "Q.3.2": 23.9507
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": 0.0,
   "U.D2": -0.251572327044,
   "U.Uv3": 0.0,
   "U.D3": -10.492662473795,
   "U.Uv4": -15.582343349639,
   "U.D4": -13.785814116003,
   "U.Uv5": -18.799208013044,
   "U.D5": 9.238294898672,
   "U.Uv6": 0.0,
   "U.D6": 23.579664570231,
   "R.Fv1": 14.832285115304,
   "R.M1": 7.332285115304,
   "R.Fv2": 31.138626834382,
   "R.Fv3": 65.346348707198,
   "R.Fv6": 28.682739343117,
   "Q.1.1": 14.832285115304,
   "Q.1.2": 7.332285115304,
   "Q.1.3": 15.167714884696,
   "Q.1.4": -7.835429769392,
   "Q.2.1": 15.970911949686,
   "Q.2.2": 7.835429769392,
   "Q.2.3": 24.029088050314,
   "Q.2.4": -23.95178197065,
   "Q.3.1": 41.317260656883,
   "Q.3.2": 23.95178197065,
   "Q.3.3": -41.317260656883,
   "Q.3.4": 17.365478686233,
   "Q.4.1": 11.317260656883,
   "Q.4.2": -17.365478686233,
   "Q.4.3": -11.317260656883,
   "Q.4.4": 28.682739343117,
   "Q.5.1": -28.682739343117,
   "Q.5.2": -28.682739343117,
   "Q.5.3": 28.682739343117,
   "Q.5.4": 0.0
  }
 },
 {
  "id": "bm-5",
  "name": "Test: Test 5, reference values from the original program's Excel-saved results (E x I = 1)",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 5",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 3.0,
     "support": "free",
     "FY": -10.0,
     "M": -5.0
    },
    {
     "id": 3,
     "x": 5.0,
     "support": "pin"
    },
    {
     "id": 4,
     "x": 11.0,
     "support": "pin"
    },
    {
     "id": 5,
     "x": 13.0,
     "support": "free"
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 3,
     "i": 3,
     "j": 4,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    },
    {
     "id": 4,
     "i": 4,
     "j": 5,
     "E": 1.0,
     "I": 1.0,
     "release": "none"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "linear",
     "value": -10.0,
     "w2": 0.0,
     "a": 0.0
    },
    {
     "member": 2,
     "type": "linear",
     "value": -8.0,
     "w2": -12.0,
     "a": 0.0
    },
    {
     "member": 3,
     "type": "linear",
     "value": -12.0,
     "w2": -24.0,
     "a": 0.0
    },
    {
     "member": 4,
     "type": "linear",
     "value": -24.0,
     "w2": -28.0,
     "a": 0.0
    }
   ]
  },
  "test": "BM-5",
  "expect": {
   "R.Fv1": 11.5518153846154,
   "R.M1": 4.55702564102564,
   "R.Fv3": 79.3033982905983,
   "R.Fv4": 114.144786324786,
   "U.Uv2": 4.47655384615385,
   "U.D2": 4.56209230769231,
   "U.D3": -24.1374358974359,
   "U.D4": 18.4687179487179,
   "U.Uv5": -16.9292307692308,
   "U.D5": -17.531282051282,
   "Q.1.2": 4.55702564102564,
   "Q.1.4": 0.09842051282051312,
   "Q.2.2": -5.098420512820506,
   "Q.2.4": -40.464615384615385,
   "Q.3.2": 40.464615384615364,
   "Q.3.4": -53.33333333333337,
   "Q.4.2": 53.33333333333333
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": 4.476553846154,
   "U.D2": 4.562092307692,
   "U.Uv3": 0.0,
   "U.D3": -24.137435897436,
   "U.Uv4": 0.0,
   "U.D4": 18.468717948718,
   "U.Uv5": -16.929230769231,
   "U.D5": -17.531282051282,
   "R.Fv1": 11.551815384615,
   "R.M1": 4.557025641026,
   "R.Fv3": 79.303398290598,
   "R.Fv4": 114.144786324786,
   "Q.1.1": 11.551815384615,
   "Q.1.2": 4.557025641026,
   "Q.1.3": 3.448184615385,
   "Q.1.4": 0.098420512821,
   "Q.2.1": -13.448184615385,
   "Q.2.2": -5.098420512821,
   "Q.2.3": 33.448184615385,
   "Q.2.4": -40.464615384615,
   "Q.3.1": 45.855213675214,
   "Q.3.2": 40.464615384615,
   "Q.3.3": 62.144786324786,
   "Q.3.4": -53.333333333333,
   "Q.4.1": 52.0,
   "Q.4.2": 53.333333333333,
   "Q.4.3": 0.0,
   "Q.4.4": 0.0
  }
 },
 {
  "id": "bm-6",
  "name": "Test: Test 6, independent solver (numpy; every element cut into short sub-elements with textbook full-length loads, cuts at every load position) - see",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 6",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 8.0,
     "support": "pin"
    },
    {
     "id": 3,
     "x": 12.0,
     "support": "pin",
     "settle": -0.003
    },
    {
     "id": 4,
     "x": 14.5,
     "support": "free",
     "FY": -5.0
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 200000000.0,
     "I": 0.0003,
     "release": "none"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 200000000.0,
     "I": 0.0002,
     "release": "none"
    },
    {
     "id": 3,
     "i": 3,
     "j": 4,
     "E": 200000000.0,
     "I": 0.0002,
     "release": "none"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "point",
     "value": -20.0,
     "a": 1.5
    },
    {
     "member": 1,
     "type": "uniform",
     "value": -8.0,
     "a": 2.0,
     "b": 5.0
    },
    {
     "member": 1,
     "type": "couple",
     "value": 12.0,
     "a": 3.5
    },
    {
     "member": 1,
     "type": "linear",
     "value": -4.0,
     "w2": -10.0,
     "a": 4.5,
     "b": 7.5
    },
    {
     "member": 1,
     "type": "point",
     "value": -15.0,
     "a": 6.0
    },
    {
     "member": 2,
     "type": "uniform",
     "value": -6.0,
     "a": 0.0
    },
    {
     "member": 3,
     "type": "couple",
     "value": -4.0,
     "a": 1.25
    }
   ]
  },
  "test": "BM-6",
  "expect": {
   "R.Fv1": 42.86639404295704,
   "R.M1": 67.57119140622018,
   "R.Fv2": 55.54361572271439,
   "R.Fv3": 10.58999023426186,
   "U.D2": 0.0005296679687482952,
   "U.D3": -0.0016023339843696306,
   "U.Uv4": -0.007891251627584384,
   "U.D4": -0.0021179589843662926,
   "Q.1.2": 67.57119140622018,
   "Q.1.4": -42.14003906253896,
   "Q.2.2": 42.140039062539174,
   "Q.2.4": -16.499999999820222,
   "Q.3.2": 16.49999999985721
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": 0.0,
   "U.D2": 0.000529667969,
   "U.Uv3": -0.003,
   "U.D3": -0.001602333984,
   "U.Uv4": -0.007891251628,
   "U.D4": -0.002117958984,
   "R.Fv1": 42.866394042969,
   "R.M1": 67.57119140625,
   "R.Fv2": 55.543615722656,
   "R.Fv3": 10.589990234375,
   "Q.1.1": 42.866394042969,
   "Q.1.2": 67.57119140625,
   "Q.1.3": 37.133605957031,
   "Q.1.4": -42.1400390625,
   "Q.2.1": 18.410009765625,
   "Q.2.2": 42.1400390625,
   "Q.2.3": 5.589990234375,
   "Q.2.4": -16.5,
   "Q.3.1": 5.0,
   "Q.3.2": 16.5,
   "Q.3.3": -5.0,
   "Q.3.4": 0.0
  }
 },
 {
  "id": "bm-7",
  "name": "Test: Test 7, Kassimali, Matrix Analysis of Structures (SI, 3rd ed.), Problem 7.1 - answers as printed (d, Q1, Q2, R); both members are hinged at join",
  "mode": "joints",
  "units": "kN, m",
  "workbook": "BEAM_PROGRAM_V4.xlsm",
  "tab": "B TEST 7",
  "inputs": {
   "units": "consistent",
   "joints": [
    {
     "id": 1,
     "x": 0.0,
     "support": "fixed"
    },
    {
     "id": 2,
     "x": 4.0,
     "support": "free"
    },
    {
     "id": 3,
     "x": 7.0,
     "support": "fixed"
    }
   ],
   "members": [
    {
     "id": 1,
     "i": 1,
     "j": 2,
     "E": 200000000.0,
     "I": 3e-05,
     "release": "j"
    },
    {
     "id": 2,
     "i": 2,
     "j": 3,
     "E": 200000000.0,
     "I": 3e-05,
     "release": "i"
    }
   ],
   "memberLoads": [
    {
     "member": 1,
     "type": "uniform",
     "value": -37.5,
     "a": 0.0
    },
    {
     "member": 2,
     "type": "uniform",
     "value": -37.5,
     "a": 0.0
    }
   ]
  },
  "test": "BM-7",
  "expect": {
   "R.Fv1": 122.957,
   "R.M1": 191.827,
   "R.M2": 0.0,
   "R.Fv3": 139.543,
   "R.M3": -249.88,
   "U.Uv2": -0.10385,
   "Q.1.2": 191.827,
   "Q.1.4": 0.0,
   "Q.2.2": 0.0,
   "Q.2.4": -249.88
  },
  "expectRef": {
   "U.Uv1": 0.0,
   "U.D1": 0.0,
   "U.Uv2": -0.103846153846,
   "U.D2": 0.0,
   "U.Uv3": 0.0,
   "U.D3": 0.0,
   "R.Fv1": 122.956730769231,
   "R.M1": 191.826923076923,
   "R.M2": 0.0,
   "R.Fv3": 139.543269230769,
   "R.M3": -249.879807692308,
   "Q.1.1": 122.956730769231,
   "Q.1.2": 191.826923076923,
   "Q.1.3": 27.043269230769,
   "Q.1.4": 0.0,
   "Q.2.1": -27.043269230769,
   "Q.2.2": 0.0,
   "Q.2.3": 139.543269230769,
   "Q.2.4": -249.879807692308
  }
 }
];
