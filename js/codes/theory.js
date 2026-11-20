// Theory data that is not a code provision: soil mechanics and statics.
// Kept beside the edition files so that calculator files hold no tabulated value.

// Terzaghi bearing capacity factors, general shear failure: [phi, Nc, Nq, Ngamma].
// Nc at 18 degrees is 15.52 (the textbook prints 15.12, a known misprint).
const TERZAGHI = [
  [0, 5.70, 1.00, 0.00], [1, 6.00, 1.10, 0.01], [2, 6.30, 1.22, 0.04], [3, 6.62, 1.35, 0.06], [4, 6.97, 1.49, 0.10],
  [5, 7.34, 1.64, 0.14], [6, 7.73, 1.81, 0.20], [7, 8.15, 2.00, 0.27], [8, 8.60, 2.21, 0.35], [9, 9.09, 2.44, 0.44],
  [10, 9.61, 2.69, 0.56], [11, 10.16, 2.98, 0.69], [12, 10.76, 3.29, 0.85], [13, 11.41, 3.63, 1.04], [14, 12.11, 4.02, 1.26],
  [15, 12.86, 4.45, 1.52], [16, 13.68, 4.92, 1.82], [17, 14.60, 5.45, 2.18], [18, 15.52, 6.04, 2.59], [19, 16.56, 6.70, 3.07],
  [20, 17.69, 7.44, 3.64], [21, 18.92, 8.26, 4.31], [22, 20.27, 9.19, 5.09], [23, 21.75, 10.23, 6.00], [24, 23.36, 11.40, 7.08],
  [25, 25.13, 12.72, 8.34], [26, 27.09, 14.21, 9.84], [27, 29.24, 15.90, 11.60], [28, 31.61, 17.81, 13.70], [29, 34.24, 19.98, 16.18],
  [30, 37.16, 22.46, 19.13], [31, 40.41, 25.28, 22.65], [32, 44.04, 28.52, 26.87], [33, 48.09, 32.23, 31.94], [34, 52.64, 36.50, 38.04],
  [35, 57.75, 41.44, 45.41], [36, 63.53, 47.16, 54.36], [37, 70.01, 53.80, 65.27], [38, 77.50, 61.55, 78.61], [39, 85.97, 70.61, 95.03],
  [40, 95.66, 81.27, 115.31], [41, 106.81, 93.85, 140.51], [42, 119.67, 108.75, 171.99], [43, 134.58, 126.50, 211.56], [44, 151.95, 147.74, 261.60],
  [45, 172.28, 173.28, 325.34], [46, 196.22, 204.19, 407.11], [47, 224.55, 241.80, 512.84], [48, 258.28, 287.85, 650.67], [49, 298.71, 344.63, 831.99],
  [50, 347.50, 415.14, 1072.80]
];

export default {
  gammaW: 9.81,                      // unit weight of water, kN/m3
  terzaghi: {
    table: TERZAGHI,
    phiMax: 50,
    // Linear interpolation for non-integer friction angles.
    factors(phi) {
      const p = Math.min(Math.max(phi, 0), 50);
      const i = Math.min(Math.floor(p), 49), t = p - i;
      const a = TERZAGHI[i], b = TERZAGHI[i + 1];
      return { Nc: a[1] + t * (b[1] - a[1]), Nq: a[2] + t * (b[2] - a[2]), Ng: a[3] + t * (b[3] - a[3]) };
    },
    // qu = sc c' Nc + q Nq + sg gamma B Ngamma
    shape: { strip: { sc: 1.0, sg: 0.5 }, square: { sc: 1.3, sg: 0.4 }, circular: { sc: 1.3, sg: 0.3 } }
  },
  general: {
    NcPhi0: 5.14,
    half: 0.5,
    shapeGamma: 0.4,                 // F gamma s = 1 - 0.4 (B/L)
    depthC0: 0.4,                    // phi = 0: Fcd = 1 + 0.4 (Df/B)
    factors(phi) {
      const r = phi * Math.PI / 180;
      if (phi <= 0) return { Nq: 1, Nc: 5.14, Ng: 0 };
      const Nq = Math.pow(Math.tan(Math.PI / 4 + r / 2), 2) * Math.exp(Math.PI * Math.tan(r));
      return { Nq, Nc: (Nq - 1) / Math.tan(r), Ng: 2 * (Nq + 1) * Math.tan(r) };
    }
  },
  eccentricity: { kern: 6, limit: 2 },   // e <= B/6 inside the kern; e < B/2 required
  // Elastic beam deflection coefficients: delta = k * load * L^n / (E I)
  deflection: {
    simpleUniform: { k: 5 / 384, label: '5 w L⁴ / (384 E I)', point: false },
    simplePoint: { k: 1 / 48, label: 'P L³ / (48 E I)', point: true },
    cantileverUniform: { k: 1 / 8, label: 'w L⁴ / (8 E I)', point: false },
    cantileverPoint: { k: 1 / 3, label: 'P L³ / (3 E I)', point: true }
  },
  tributary: { oneWayRatio: 2 },     // long/short >= 2 is one-way action
  // Settlement (Das, Principles of Foundation Engineering, Ch. 8 and 9).
  settlement: {
    zbarB: 5,                        // Es averaged to a depth of min(5B, H) (Eq. 9.23)
    rigid: 0.93,                     // rigid footing: about 0.93 x the flexible centre settlement
    alpha: { center: 4, corner: 1 }, // Steinbrenner: alpha = 4 at the centre (B' = B/2), 1 at the corner (B' = B)
    simpson: [1, 4, 1],              // average stress increase over the clay: (top + 4 mid + bottom) / 6
    spread: 2                        // 2:1 method: the load spreads 1 horizontal per 2 vertical on each side
  },
  // Piles (owner's foundation engineering textbook). pa = atmospheric pressure, kPa.
  pile: {
    pa: 100,
    NqStar: [[20, 12.4], [21, 13.8], [22, 15.5], [23, 17.9], [24, 21.4], [25, 26.0], [26, 29.5], [27, 34.0], [28, 39.7], [29, 46.5], [30, 56.7], [31, 68.2], [32, 81.0],
      [33, 96.0], [34, 115.0], [35, 143.0], [36, 168.0], [37, 194.0], [38, 231.0], [39, 276.0], [40, 346.0], [41, 420.0], [42, 525.0], [43, 650.0], [44, 780.0], [45, 930.0]],
    limitK: 0.5,                         // Qp <= Ap 0.5 pa Nq* tan(phi)
    critDepth: 15,                       // L' = 15 D
    clayNc: 9,                           // Qp = 9 cu Ap
    alpha: [[0.1, 1.00], [0.2, 0.92], [0.3, 0.82], [0.4, 0.74], [0.6, 0.62], [0.8, 0.54], [1.0, 0.48], [1.2, 0.42], [1.4, 0.40], [1.6, 0.38], [1.8, 0.36], [2.0, 0.35], [2.4, 0.34], [2.8, 0.34]],
    groupDiv: 90,                        // Converse-Labarre
    sandSpacing: 3,                      // efficiency applies when d <= 3 D
    blockNc: 9,
    Kguide: 'K ≈ 1 − sin φ\' for bored piles, up to 1.4 (1 − sin φ\') for low-displacement driven and 1.8 (1 − sin φ\') for high-displacement driven piles; δ\' between 0.5 φ\' and 0.8 φ\'.'
  },
  // Immediate deflection of RC members: delta = K * 5 Ma L^2 / (48 Ec Ie), with Ma by case.
  rcDeflection: {
    simpleUniform: { K: 1.0, label: 'Simply supported, uniform load', Ma: 'w L² / 8', ma: (w, L) => w * L * L / 8, point: false },
    cantileverUniform: { K: 2.4, label: 'Cantilever, uniform load', Ma: 'w L² / 2', ma: (w, L) => w * L * L / 2, point: false },
    simplePoint: { K: 0.8, label: 'Simply supported, point load at midspan', Ma: 'P L / 4', ma: (P, L) => P * L / 4, point: true },
    cantileverPoint: { K: 3.2, label: 'Cantilever, point load at the end', Ma: 'P L', ma: (P, L) => P * L, point: true }
  }
};
