// NSCP 2015 (7th Edition, Volume I) edition data.
// Every code factor, limit, load combination and clause number used by the calculators lives here.
// To add another edition: copy this file, change the values and clause numbers, and register it
// in js/codes/index.js. No calculator file changes.
import theory from './theory.js';

const sqrt = Math.sqrt;
const Es = 200000;

// ---------------------------------------------------------------- concrete (Chapter 4), SI
const concrete = {
  Es,                                   // 420.2.2.2
  EcCoef: 4700,                         // 419.2.2.1, normal-weight concrete, MPa
  EcCoefUS: 57000,                      // the same expression with f'c in psi (display only)
  Ec(fc) { return 4700 * sqrt(fc); },
  frCoef: 0.62,                         // 419.2.3.1
  fr(fc, lambda = 1) { return 0.62 * lambda * sqrt(fc); },
  ecu: 0.003,                           // 422.2.2.1
  sb: 0.85,                             // stress block intensity 0.85 f'c, 422.2.2.4.1
  beta1Data: { max: 0.85, min: 0.65, fcLow: 28, fcHigh: 55, drop: 0.05, per: 7 },   // Table 422.2.2.4.3
  beta1(fc) {
    if (fc <= 28) return 0.85;
    if (fc >= 55) return 0.65;
    return 0.85 - 0.05 * (fc - 28) / 7;
  },
  ety(fy) { return fy / Es; },          // 421.2.2.1
  etTension: 0.005,                     // tension-controlled limit, Table 421.2.2
  phi: {
    tension: 0.90, tied: 0.65, spiral: 0.75,          // Table 421.2.2
    shear: 0.75, torsion: 0.75, bearing: 0.65,        // Table 421.2.1
    flexAxial(et, fy, spiral = false) {
      const ety = fy / Es, lo = spiral ? 0.75 : 0.65;
      if (et <= ety) return lo;
      if (et >= 0.005) return 0.90;
      return lo + (0.90 - lo) * (et - ety) / (0.005 - ety);
    }
  },
  etMinBeam: 0.004,                     // 409.3.3.1
  etMinSlab: 0.004,                     // 407.3.3.1
  asMinBeam: { a: 0.25, b: 1.4, aUS: 3, bUS: 200, waiver: 4 / 3 },    // 409.6.1.2, 409.6.1.3
  AsMinBeam(fc, fy, bw, d) { return Math.max(0.25 * sqrt(fc) / fy, 1.4 / fy) * bw * d; },
  asMinSlab: { fyBreak: 420, below: 0.0020, at: 0.0018, floor: 0.0014 },   // Tables 407.6.1.1, 424.4.3.2
  AsMinSlabRatio(fy) { return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014); },
  slabSpacing: { main: { timesH: 3, max: 450 }, temp: { timesH: 5, max: 450 } },   // 407.7.2.3, 424.4.3.3
  // Minimum thickness: span divided by the tabulated number, fy = 420, normal weight.
  minDepth: {
    slab: { simple: 20, oneEnd: 24, bothEnds: 28, cantilever: 10 },   // Table 407.3.1.1
    beam: { simple: 16, oneEnd: 18.5, bothEnds: 21, cantilever: 8 },  // Table 409.3.1.1
    fyRef: 420, fyA: 0.4, fyB: 700,                                   // 407.3.1.1.1, 409.3.1.1.1
    factor(fy) { return fy === 420 ? 1 : 0.4 + fy / 700; }
  },
  supports: [
    { value: 'simple', label: 'Simply supported' }, { value: 'oneEnd', label: 'One end continuous' },
    { value: 'bothEnds', label: 'Both ends continuous' }, { value: 'cantilever', label: 'Cantilever' }
  ],
  // Effective flange overhang, Table 406.3.2.1: least of timesH x slab thickness, sw / swDiv, ln / lnDiv.
  flange: { T: { timesH: 8, swDiv: 2, lnDiv: 8, sides: 2 }, L: { timesH: 6, swDiv: 2, lnDiv: 12, sides: 1 } },
  barClearMin: 50,                      // 425.2.1 as printed in NSCP 2015
  barClearMinSource: 25,                // ACI 318-14 25.2.1, shown for comparison only
  barClearAgg: 4 / 3,
  designAssume: { phi: 0.90, cover: 40, stirrup: 10 },   // bar-fit assumptions in Design mode
  shear: {
    vc: 0.17,                           // Eq. 422.5.5.1
    vsMax: 0.66,                        // Eq. 422.5.1.2
    sqrtFcMax: 8.3,                     // 422.5.3.1
    minAbove: 0.5,                      // stirrups required where Vu > 0.5 phi Vc, 409.6.3.1
    avMinA: 0.062, avMinB: 0.35,        // Table 409.6.3.3
    spacingBreak: 0.33,                 // Table 409.7.6.2.2
    sLow: { dDiv: 2, max: 600 }, sHigh: { dDiv: 4, max: 300 },
    practical: 25                       // spacings are rounded down to this multiple
  },
  torsion: {
    th: 0.083,                          // Table 422.7.4.1(a)
    cr: 0.33,                           // Table 422.7.5.1
    AoFactor: 0.85, thetaDeg: 45,       // 422.7.6.1.1, 422.7.6.1.2
    limitDen: 1.7,                      // 422.7.7.1
    alMin: 0.42, alMinB: 0.175,         // 409.6.4.3
    sMaxDiv: 8, sMax: 300               // 409.7.6.3.3
  },
  twoWay: { a: 0.33, b: 0.17, c: 0.083, alpha: { interior: 40, edge: 30, corner: 20 } },   // Table 422.6.5.2
  footing: { dMin: 150 },               // 413.3.1.2
  cover: { ground: 75, weatherLarge: 50, weatherSmall: 40, slab: 20, beam: 40 },   // Table 420.6.1.3.1
  bars: [10, 12, 16, 20, 25, 28, 32, 36],
  fcChoices: [17, 21, 24, 28, 35, 42],
  fyChoices: [{ value: 280, label: 'Grade 280' }, { value: 420, label: 'Grade 420' }, { value: 520, label: 'Grade 520' }],
  fcRange: [17, 70], fyRange: [230, 550],
  defaults: { fc: 28, fy: 420, gammaC: 24 },
  // ---- columns (Section 9.2 of the hand-off)
  column: {
    PnMax: { tied: 0.80, spiral: 0.85 },                 // Table 422.4.2.1
    rhoMin: 0.01, rhoMax: 0.08,                          // 410.6.1.1
    minBars: { tied: 4, spiral: 6 },                     // 410.7.3.1
    wsdAllow: 0.40,                                      // 429.7.1
    sweepTop: 3, sweepBottom: 0.02, sweepSteps: 240,     // interaction curve sweep of c / h
    tie: { smallMax: 32, small: 10, large: 12, longDb: 16, tieDb: 48 },   // 425.7.2.2, 425.7.2.1
    spiral: { k: 0.45, fytMax: 700, clearMin: 25, clearMax: 75, barMin: 10 },   // 425.7.3.3, 425.7.3.1, 425.7.3.2
    radius: { rect: 0.30, circ: 0.25 },                  // 406.2.5.1
    slender: { unbraced: 22, a: 34, b: 12, cap: 40 },    // 406.2.5
    EIeff: 0.4,                                          // Eq. 406.6.4.4.4a
    Pc075: 0.75,                                         // Eq. 406.6.4.5.2
    Cm: { a: 0.6, b: 0.4, transverse: 1.0 },             // 406.6.4.5.3
    M2min: { a: 15, b: 0.03 },                           // Eq. 406.6.4.5.4 (mm)
    deltaMax: 1.4,                                       // 406.2.6
    sway: 'Sway frames need a second-order or moment magnifier analysis of the whole storey (406.6.4.6). This calculator covers braced columns.',
    tooSlender: 'Second-order moment exceeds 1.4 times the first-order moment (406.2.6). Enlarge the column.'
  },
  // ---- development and splices (Section 9.3)
  dev: {
    sqrtFcMax: 8.3,                                      // 425.4.1.4
    smallBarMax: 20,                                     // "20 mm and smaller"
    simple: { good: { small: 2.1, large: 1.7 }, other: { small: 1.4, large: 1.1 } },   // Table 425.4.2.2
    general: { k: 1.1, confMax: 2.5, ktr: 40 },          // Eq. 425.4.2.3a, 425.4.2.3b
    psiT: { top: 1.3, other: 1.0 },                      // Table 425.4.2.4
    psiE: { epoxyClose: 1.5, epoxy: 1.2, none: 1.0 },
    psiTEMax: 1.7,
    psiS: { small: 0.8, large: 1.0 },
    ldMin: 300,                                          // 425.4.2.1
    topBarDepth: 300,                                    // ψt applies with more than 300 mm of fresh concrete below the bar
    hook: { k: 0.24, minDb: 8, min: 150, psiE: 1.2, psiC: 0.7, psiR: 0.8, maxBar: 36, sideCover: 65, extCover: 50, tieSpacingDb: 3 },   // 425.4.3.1, Table 425.4.3.2
    hookGeometry: { ext90: 12, ext180Db: 4, ext180Min: 65, bend: [{ max: 25, db: 6 }, { max: 36, db: 8 }, { max: Infinity, db: 10 }] },   // Table 425.3.1
    comp: { k: 0.24, k2: 0.043, min: 200, psiR: 0.75, tieDb: 12, tieSpacing: 100 },  // 425.4.9.2, 425.4.9.1, Table 425.4.9.3
    lapT: { A: 1.0, B: 1.3, ratio: 2.0, maxSpliced: 0.5, min: 300 },   // Table 425.5.2.1
    lapC: { fyBreak: 420, a: 0.071, b: 0.13, c: 24, min: 300, fcLow: 21, lowFactor: 4 / 3 }   // 425.5.5.1
  },
  // ---- deflection and crack control (Section 9.4)
  service: {
    rhoP: 50,                                                            // Eq. 424.2.4.1.1
    xi: [{ value: '3m', label: '3 months', xi: 1.0 }, { value: '6m', label: '6 months', xi: 1.2 }, { value: '12m', label: '12 months', xi: 1.4 }, { value: '5y', label: '5 years or more', xi: 2.0 }],   // Table 424.2.4.1.3
    immediate: [{ value: 'roof', label: 'Flat roof: immediate live load deflection ≤ L/180', ratio: 180 }, { value: 'floor', label: 'Floor: immediate live load deflection ≤ L/360', ratio: 360 }],   // Table 424.2.2
    attached: [{ value: 'damage', label: 'Supports elements likely to be damaged: ≤ L/480', ratio: 480 }, { value: 'noDamage', label: 'Supports elements not likely to be damaged: ≤ L/240', ratio: 240 }],
    continuousNote: 'For continuous spans, Ie may be averaged between midspan and supports (424.2.3.6); this calculator uses the critical section only.'
  },
  crack: { a: 380, b: 2.5, c: 300, ref: 280, fsFactor: 2 / 3 },         // Table 424.3.2, 424.3.2.1
  // ---- shear walls, basic (Section 9.11)
  wall: {
    dFactor: 0.8,                                                       // 411.5.4.2
    vnMax: 0.83,                                                        // 411.5.4.3
    rhoT: 0.0025, rhoLBase: 0.0025, rhoLk: 0.5, hwRatio: 2.5,           // 411.6.2
    spacing: { timesH: 3, max: 450, lwDiv: 3 },                         // 411.7.2.1, 411.7.3.1 (lw/3 as printed for both)
    twoCurtains: 250,                                                   // 411.7.2.3
    minSteel: { smallMax: 16, fyMin: 420, small: { rhoL: 0.0012, rhoT: 0.0020 }, other: { rhoL: 0.0015, rhoT: 0.0025 } },   // Table 411.6.1
    simplified: { k: 0.55, div: 32, phi: 0.65, eDiv: 6,                 // 411.5.3.1, 411.5.3.3
      kValues: [{ value: 0.8, label: 'Braced top and bottom, restrained against rotation at one or both ends (k = 0.8)' }, { value: 1.0, label: 'Braced top and bottom, unrestrained at both ends (k = 1.0)' }, { value: 2.0, label: 'Not braced against lateral translation (k = 2.0)' }] },   // Table 411.5.3.2
    hMin: { min: 100, div: 25 },                                        // Table 411.3.1.1
    scopeNote: 'Ordinary cast-in-place structural walls. Special (seismic) structural walls of Section 418 are outside the scope of this calculator.'
  },
  // ---- two-way slabs, direct design method (Section 9.1)
  twoWaySlab: {
    // Table 408.3.1.1: minimum h = ln / divisor, slabs without interior beams.
    divisors: [
      { fy: 280, noDrop: { extNoEdge: 33, extEdge: 36, interior: 36 }, drop: { extNoEdge: 36, extEdge: 40, interior: 40 } },
      { fy: 420, noDrop: { extNoEdge: 30, extEdge: 33, interior: 33 }, drop: { extNoEdge: 33, extEdge: 36, interior: 36 } },
      { fy: 520, noDrop: { extNoEdge: 28, extEdge: 31, interior: 31 }, drop: { extNoEdge: 31, extEdge: 34, interior: 34 } }
    ],
    hMin: { noDrop: 125, drop: 100 },                                   // 408.3.1.1
    edgeBeamAlpha: 0.8,
    beams: { lowAlpha: 0.2, highAlpha: 2.0, a: 0.8, fyDiv: 1400, base: 36, k1: 5, k2: 9, minMid: 125, minHigh: 90 },   // Table 408.3.1.2
    roundTo: 10,
    lnMinRatio: 0.65,                                                   // 408.10.3.2.1
    ratioMax: 2, spanDiff: 1 / 3, liveToDead: 2, minSpans: 3,           // 408.10.2
    interior: { neg: 0.65, pos: 0.35 },                                 // 408.10.4.1
    // Table 408.10.4.2, end span coefficients
    endSpan: [
      { value: 'unrestrained', label: 'Exterior edge unrestrained', intNeg: 0.75, pos: 0.63, extNeg: 0 },
      { value: 'allBeams', label: 'Slab with beams between all supports', intNeg: 0.70, pos: 0.57, extNeg: 0.16 },
      { value: 'noEdgeBeam', label: 'No beams between interior supports, without edge beam', intNeg: 0.70, pos: 0.52, extNeg: 0.26 },
      { value: 'edgeBeam', label: 'No beams between interior supports, with edge beam', intNeg: 0.70, pos: 0.50, extNeg: 0.30 },
      { value: 'restrained', label: 'Exterior edge fully restrained', intNeg: 0.65, pos: 0.35, extNeg: 0.65 }
    ],
    csWidth: 0.25,                                                      // 408.4.1.5: 2 × 0.25 × min(l1, l2)
    // Column strip shares at l2/l1 = 0.5, 1.0, 2.0 (408.10.5.1, 408.10.5.2, 408.10.5.5)
    ratios: [0.5, 1.0, 2.0],
    shares: {
      intNeg: { a0: [0.75, 0.75, 0.75], a1: [0.90, 0.75, 0.45] },
      extNegBt0: [1.00, 1.00, 1.00],
      extNeg: { a0: [0.75, 0.75, 0.75], a1: [0.90, 0.75, 0.45] },
      pos: { a0: [0.60, 0.60, 0.60], a1: [0.90, 0.75, 0.45] }
    },
    betaTMax: 2.5,
    beamShare: 0.85,                                                    // 408.10.5.7
    asMin: { fyBreak: 420, below: 0.0020, at: 0.0018, floor: 0.0014 },   // Table 408.6.1.1: 0.0018 x 420 / fy, not less than 0.0014, for fy >= 420 (see AsMinSlabRatio)
    sMax: { timesH: 2, max: 450 }                                       // 408.7.2.2
  },
  punching: { gammaF: 2 / 3 }                                           // 408.4.2.3.2
};

// ---------------------------------------------------------------- WSD (Section 429)
const wsd = {
  loadFactor: 1.0,                      // 429.3.1
  fcAllow: 0.45,                        // 429.4.1
  fsLow: 140, fsHigh: 170, fsBreak: 420,   // 429.4.2
  fsAllow(fy) { return fy >= 420 ? 170 : 140; },
  nMin: 6,                              // 429.6.4
  compSteel: 2,                         // 429.6.5: compression steel transformed with 2 Es/Ec
  columnAllow: 0.40                     // 429.7.1
};

// ---------------------------------------------------------------- loads (Section 203)
const mul = (c, x) => ({ mul: c, x });
const sum = (...xs) => ({ sum: xs });
const or = (...xs) => ({ or: xs });
const div = (c, x) => ({ div: c, x });
const LrR = or('Lr', 'R');
const WorE = or(mul(0.6, 'W'), div(1.4, 'E'));
const loads = {
  symbols: [
    ['D', 'dead'], ['L', 'live'], ['Lr', 'roof live'], ['R', 'rain'], ['W', 'wind'], ['E', 'earthquake'],
    ['H', 'soil and water lateral pressure'], ['F', 'fluid'], ['T', 'self-straining']
  ],
  reversible: ['W', 'E'],
  f1Options: [
    { value: 0.5, label: '0.5 (other live loads)' },
    { value: 1.0, label: '1.0 (public assembly, live load over 4.8 kPa, garages)' }
  ],
  basicNote: 'Eqs. 203-11 and 203-13 are shown with the plus sign that the printed NSCP 2015 text omits.',
  alternateNote: 'A one-third stress increase is permitted with the alternate basic combinations that include W or E (203.4.2).',
  // Gravity-only factors used by the footing and load transfer modules (Eqs. 203-1 and 203-2).
  gravity: { D1: 1.4, D: 1.2, L: 1.6 },
  strength: [                                                    // 203.3.1
    { eq: '203-1', expr: sum(mul(1.4, sum('D', 'F'))) },
    { eq: '203-2', expr: sum(mul(1.2, sum('D', 'F', 'T')), mul(1.6, sum('L', 'H')), mul(0.5, LrR)) },
    { eq: '203-3', expr: sum(mul(1.2, 'D'), mul(1.6, LrR), or(mul('f1', 'L'), mul(0.5, 'W'))) },
    { eq: '203-4', expr: sum(mul(1.2, 'D'), mul(1.0, 'W'), mul('f1', 'L'), mul(0.5, LrR)) },
    { eq: '203-5', expr: sum(mul(1.2, 'D'), mul(1.0, 'E'), mul('f1', 'L')) },
    { eq: '203-6', expr: sum(mul(0.9, 'D'), mul(1.0, 'W'), mul(1.6, 'H')) },
    { eq: '203-7', expr: sum(mul(0.9, 'D'), mul(1.0, 'E'), mul(1.6, 'H')) }
  ],
  basic: [                                                       // 203.4.1
    { eq: '203-8', expr: sum('D', 'F') },
    { eq: '203-9', expr: sum('D', 'H', 'F', 'L', 'T') },
    { eq: '203-10', expr: sum('D', 'H', 'F', LrR) },
    { eq: '203-11', expr: sum('D', 'H', 'F', mul(0.75, sum('L', 'T', LrR))) },
    { eq: '203-12', expr: sum('D', 'H', 'F', WorE) },
    { eq: '203-13', expr: sum('D', 'H', 'F', mul(0.75, sum('L', 'Lr', WorE))) }
  ],
  alternate: [                                                   // 203.4.2
    { eq: '203-14', expr: sum(mul(0.6, 'D'), mul(0.6, 'W'), 'H') },
    { eq: '203-15', expr: sum(mul(0.6, 'D'), div(1.4, 'E'), 'H') },
    { eq: '203-16', expr: sum('D', 'L', LrR) },
    { eq: '203-17', expr: sum('D', 'L', mul(0.6, 'W')) },
    { eq: '203-18', expr: sum('D', 'L', div(1.4, 'E')) }
  ],
  special: [                                                     // stored, not shown in Phase 1
    { eq: '203-19', expr: sum(mul(1.2, 'D'), mul('f1', 'L'), mul(1.0, 'Em')) },
    { eq: '203-20', expr: sum(mul(0.9, 'D'), mul(1.0, 'Em')) }
  ]
};

// ---------------------------------------------------------------- steel (Chapter 5), SI
const steel = {
  E: 200000,
  tension: {
    yield: { phi: 0.90, omega: 1.67 },                           // Eq. 504.2-1
    rupture: { phi: 0.75, omega: 2.00 },                         // Eq. 504.2-2
    slenderness: 300                                             // 504.1 user note (preferred, not a limit)
  },
  blockShear: { phi: 0.75, omega: 2.00, k: 0.6, ubs: [{ value: 1.0, label: '1.0 (uniform tension stress)' }, { value: 0.5, label: '0.5 (nonuniform tension stress)' }] },   // Eq. 510.4-5
  holeAdd: 2,                                                    // 504.3.2: hole width for net area = hole + 2 mm
  holes: { 16: 18, 20: 22, 22: 24, 24: 27, 27: 30, 30: 33 },     // Table 510.3.3, standard holes
  holeLargeAdd: 3,                                               // M36 and larger: d + 3
  holeDia(d) { return this.holes[d] != null ? this.holes[d] : d + 3; },
  bolts: [16, 20, 22, 24, 27, 30, 36],
  splicePlateMax: 0.85,                                          // 510.4.1
  // Shear lag factor U, Table 504.3.1.
  shearLag: [
    { value: 'case1', label: 'Case 1: load transmitted to every element', U: 1.0 },
    { value: 'case2', label: 'Case 2: U = 1 − x̄/ℓ' },
    { value: 'case4', label: 'Case 4: plate, longitudinal welds only' },
    { value: 'case7f', label: 'Case 7: W, M, S, HP; flange connected, 3 or more fasteners per line' },
    { value: 'case7w', label: 'Case 7: W, M, S, HP; web connected, 4 or more fasteners per line', U: 0.70 },
    { value: 'case8a', label: 'Case 8: single angle, 4 or more fasteners per line', U: 0.80 },
    { value: 'case8b', label: 'Case 8: single angle, 2 or 3 fasteners per line', U: 0.60 },
    { value: 'typed', label: 'Typed value of U' }
  ],
  shearLagData: {
    case7f: { ratio: 2 / 3, wide: 0.90, narrow: 0.85 },
    case4: [{ min: 2, U: 1.0 }, { min: 1.5, U: 0.87 }, { min: 1, U: 0.75 }]
  },
  compression: { phi: 0.90, omega: 1.67, limit: 4.71, feRatio: 0.44, inelastic: 0.658, elastic: 0.877, klrMax: 200,
    slenderMessage: 'This section has slender elements for compression. The reduction of Section 505.7 is not included in this calculator yet.' },   // 505.1 to 505.3
  flexure: {
    phi: 0.90, omega: 1.67,                                      // 506.1
    lp: 1.76, lr: 1.95, residual: 0.7, lrK: 6.76, fcrK: 0.078,   // Eqs. 506.2-4 to 506.2-6
    cb: { num: 12.5, max: 2.5, a: 3, b: 4, c: 3, cap: 3.0, Rm: 1.0 },   // Eq. 506.1-1
    minorCap: 1.6                                                // Eq. 506.6-1
  },
  shear: {
    k: 0.6,
    rolled: { limit: 2.24, phi: 1.00, omega: 1.50, Cv: 1.0 },    // 507.2.1(a)
    other: { phi: 0.90, omega: 1.67 },                           // 507.1
    kv: 5, htwMax: 260, c1: 1.10, c2: 1.37, c3: 1.51             // Eqs. 507.2-3 to 507.2-5
  },
  // Local buckling limits, Tables 502.4.1 and 502.4.2: coefficient x sqrt(E/Fy).
  local: {
    flexFlange: { lp: 0.38, lr: 1.0 },      // Case 1
    compFlange: { lr: 0.56 },               // Case 3
    compAngle: { lr: 0.45 },                // Case 5
    flexWeb: { lp: 3.76, lr: 5.70 },        // Case 9
    compWeb: { lr: 1.49 }                   // Case 10
  },
  grades: [
    { value: 'A36', label: 'ASTM A36', Fy: 248, Fu: 400 },
    { value: 'A572-50', label: 'ASTM A572 Grade 50', Fy: 345, Fu: 450 },
    { value: 'A992', label: 'ASTM A992', Fy: 345, Fu: 450 }
  ],
  deflection: { limit: 360, note: 'Limits are set by the designer; L/360 is a common limit for live load.' },
  // ---- beam-columns (Section 9.5)
  interaction: { break: 0.2, k: 8 / 9, half: 2 },                      // Eqs. 508.1-1a, 508.1-1b
  amplification: { alpha: { LRFD: 1.00, ASD: 1.60 }, RM: { braced: 1.0, moment: 0.85 }, Cm: { a: 0.6, b: 0.4, transverse: 1.0 } },   // 503.2
  // ---- bolts (Section 9.6). Nominal stresses from Table 510.3.2 as printed in NSCP 2015 (MPa).
  bolt: {
    grades: [
      { value: 'A325', label: 'A325 (A325M)', Fnt: 620, FnvN: 372, FnvX: 457 },
      { value: 'A490', label: 'A490 (A490M)', Fnt: 780, FnvN: 457, FnvX: 579 },
      { value: 'A307', label: 'A307', Fnt: 310, FnvN: 165, FnvX: 165 }
    ],
    sizes: [16, 20, 22, 24, 27, 30, 36],
    shear: { phi: 0.75, omega: 2.00 },                                   // 510.3.6
    bearing: { phi: 0.75, omega: 2.00, def: { lc: 1.2, d: 2.4 }, noDef: { lc: 1.5, d: 3.0 } },   // Eqs. 510.3-6a, 510.3-6b
    combined: { k: 1.3, ruleOfThumb: 0.30 },                             // 510.3.7
    slip: { mu: { A: 0.35, B: 0.50 }, Du: 1.13, hsc: [{ value: 'std', label: 'Standard holes', h: 1.00 }, { value: 'over', label: 'Oversized or short-slotted holes', h: 0.85 }, { value: 'long', label: 'Long-slotted holes', h: 0.70 }],
      service: { phi: 1.00, omega: 1.50 }, strength: { phi: 0.85, omega: 1.76 }, ksASD: 1.5 },   // 510.3.8, Eqs. 510.3-4, 510.3-5a, 510.3-5b
    pretension: { A325: { 16: 91, 20: 142, 22: 176, 24: 205, 27: 267, 30: 326, 36: 475 }, A490: { 16: 114, 20: 179, 22: 221, 24: 257, 27: 334, 30: 408, 36: 595 } },   // Table 510.3.1, kN
    spacing: { min: 8 / 3, preferred: 3 },                               // 510.3.3
    edgeMin: { 16: [28, 22], 20: [34, 26], 22: [38, 28], 24: [42, 30], 27: [48, 34], 30: [52, 38], 36: [64, 46], largeSheared: 1.75, largeRolled: 1.25 },   // Table 510.3.4 [sheared, rolled]
    edgeMax: { t: 12, max: 150 },                                        // 510.3.5
    eccentricNote: 'The elastic method is conservative compared with the instantaneous centre of rotation method.'
  },
  // ---- welds (Section 9.7)
  weld: {
    electrodes: [{ value: 415, label: 'E60 (415 MPa)' }, { value: 480, label: 'E70 (480 MPa)' }, { value: 550, label: 'E80 (550 MPa)' }],
    throat: 0.707,                                                       // 510.2.2.1, equal legs
    k: 0.60,                                                             // Table 510.2.5
    fillet: { phi: 0.75, omega: 2.00 },
    group: { a: 0.85, b: 1.5 },                                          // Eqs. 510.2-9a, 510.2-9b
    angle: { k: 0.50, p: 1.5 },                                          // Eq. 510.2-5
    baseRupture: { k: 0.60, phi: 0.75, omega: 2.00 }, baseYield: { k: 0.60, phi: 1.00, omega: 1.50 },   // 510.4.2
    minSize: [{ t: 6, w: 3 }, { t: 13, w: 5 }, { t: 19, w: 6 }, { t: Infinity, w: 8 }],               // Table 510.2.4
    maxSize: { tLimit: 6, less: 2 },                                     // 510.2.2.2
    minLength: 4,                                                        // 510.2.2.2
    longWeld: { start: 100, a: 1.2, b: 0.002, cap: 300, use: 180 },      // Eq. 510.2-1
    cjp: { tension: { k: 1.0, phi: 0.90, omega: 1.67 }, shear: { k: 0.60, phi: 1.00, omega: 1.50 } },   // Table 510.2.5
    pjp: { tension: { k: 0.60, phi: 0.80, omega: 1.88 }, shear: { k: 0.60, phi: 0.75, omega: 2.00 } }
  },
  // ---- base plates and anchor rods (Section 9.12)
  basePlate: {
    bearing: { k: 0.85, cap: 1.7, phi: 0.65, omega: 2.31 },             // 510.8, Eqs. 510.8-1, 510.8-2 (φc and Ωc as printed)
    yield: { phi: 0.90, omega: 1.67 },                                   // plate flexure
    cantilever: { m: 0.95, n: 0.80, xK: 4, lamDiv: 4 },                 // cantilever method (theory)
    plates: [10, 12, 16, 20, 22, 25, 28, 32, 36, 40, 45, 50],
    anchor: { nt: 0.75, nvN: 0.450, nvX: 0.563, phi: 0.75, omega: 2.00,  // 510.9, 510.3.6, Table 510.3.2
      grades: [{ value: 400, label: 'Fu 400 MPa' }, { value: 520, label: 'Fu 520 MPa' }, { value: 860, label: 'Fu 860 MPa' }],
      sizes: [16, 20, 24, 27, 30, 36, 42, 48] },
    concreteNote: 'Concrete breakout, pullout and embedment are governed by NSCP 2015 Section 417 and are not checked here.',
    scopeNote: 'Axially loaded column base plates. Bases with moment are outside the scope of this calculator.'
  }
};

// ---------------------------------------------------------------- foundations (Chapter 3 and Chapter 4, Section 413)
const found = {
  defaults: { gammaC: 24, gammaS: 18, FS: 3 },
  roundUp: 0.1,                         // plan dimensions rounded up to 0.1 m
  // Table 304-1 presumptive allowable foundation pressures (kPa).
  presumptive: [
    { soil: 'Intact tuffaceous sandstone', q: 1000 },
    { soil: 'Lightly weathered tuffaceous sandstone', q: 500 },
    { soil: 'Sandy gravel', q: 100 },
    { soil: 'Sand, silty sand, clayey sand, silty gravel and clayey gravel', q: 75 },
    { soil: 'Clay, sandy clay, silty clay and clayey silt', q: 50 }
  ],
  presumptiveNote: 'May be increased 20% for each additional 300 mm of width or depth beyond 300 mm, up to three times the tabulated value (no increase for width in clay).',
  bandNote: 'see NSCP 2015 Section 413.3.3 for the band rule',
  // ---- column-to-footing bearing and dowels (Section 9.9)
  dowel: { frustum: 4, sqrtMax: 2, minRatio: 0.005, minBars: 4, footingBarLayers: 2 },  // Table 422.8.3.2, 416.3.4.1 (0.005 Ag); 4 bars is practice, not a code value
  // ---- combined and strap footings (Section 9.8)
  combined: { roundB: 0.05, stations: 400, thirdLow: 1 / 3, thirdHigh: 2 / 3 },
  pile: { note: 'Allowable pile loads shall be established by approved formulas, load tests or a foundation investigation (306.3). The static formulas here are one such method.', groupNote: 'Group action of piles is governed by 306.7.' },
  pileCap: { dMin: 300, edgeWarning: 'The critical perimeter around this pile extends beyond the cap edge, so the full perimeter overstates the strength. Check the corner perimeter by hand or increase the edge distance.' },
  mat: { note: 'Strips are then designed by Chapter 4 (413.3.4). The direct design method of Section 408.10 must not be used for mats (413.3.4.2).' },
  // ---- retaining walls (Section 9.10)
  retaining: {
    FSoverturning: 1.5, FSsliding: 1.5,                                   // 206.6
    minFluid: 4.7,                                                        // 206.6: drained, level backfill, kPa per m of depth
    earth: 1.6, dead: 1.2, surcharge: 1.6, toeDead: 0.9,                  // Eq. 203-2 load factors as used in the hand-off
    frictionNote: 'For silts and clays the friction used may not exceed one half of the normal force (305.7.4.1).',
    heelNote: 'Upward soil pressure under the heel is conservatively ignored.'
  }
};

// ---------------------------------------------------------------- clause map
// nscp: NSCP 2015 clause. src: clause of the reference code shown second (null = NSCP only).
// text: plain chip text for steps with no code basis.
const ACI = 'ACI 318-14', AISC = 'AISC 360';
const c4 = (nscp, src) => ({ nscp, src, code: ACI });
const c5 = (nscp, src) => ({ nscp, src, code: AISC });
const only = (nscp) => ({ nscp, src: null, code: null });
const clauses = {
  'mat.Ec': c4('419.2.2.1', '19.2.2.1'),
  'mat.Es': c4('420.2.2.2', '20.2.2.2'),
  'flexure.beta1': c4('Table 422.2.2.4.3', 'Table 22.2.2.4.3'),
  'flexure.stressBlock': c4('422.2.2.4.1', '22.2.2.4.1'),
  'flexure.strain': c4('422.2.1.2, 422.2.2.1', '22.2.1.2, 22.2.2.1'),
  'flexure.phi': c4('Table 421.2.2', 'Table 21.2.2'),
  'flexure.Mn': c4('422.3.1.1', '22.3.1.1'),
  'flexure.strength': c4('409.5.1.1', '9.5.1.1'),
  'flexure.minSteel': c4('409.6.1.2', '9.6.1.2'),
  'flexure.minSteelWaiver': c4('409.6.1.3', '9.6.1.3'),
  'flexure.ductility': c4('409.3.3.1', '9.3.3.1'),
  'flexure.flangeWidth': c4('Table 406.3.2.1', 'Table 6.3.2.1'),
  'flexure.minDepth': c4('Table 409.3.1.1', 'Table 9.3.1.1'),
  'detail.barSpacing': c4('425.2.1', '25.2.1'),
  'wsd.general': only('429.3.1'),
  'wsd.concrete': only('429.4.1'),
  'wsd.steel': only('429.4.2'),
  'wsd.theory': only('429.6'),
  'wsd.n': only('429.6.4'),
  'wsd.compSteel': only('429.6.5'),
  'shear.phi': c4('Table 421.2.1', 'Table 21.2.1'),
  'shear.Vn': c4('422.5.1.1', '22.5.1.1'),
  'shear.Vc': c4('422.5.5.1', '22.5.5.1'),
  'shear.Vs': c4('422.5.10.5.3', '22.5.10.5.3'),
  'shear.sectionLimit': c4('422.5.1.2', '22.5.1.2'),
  'shear.sqrtFcCap': c4('422.5.3.1', '22.5.3.1'),
  'shear.minRequired': c4('409.6.3.1', '9.6.3.1'),
  'shear.AvMin': c4('Table 409.6.3.3', 'Table 9.6.3.3'),
  'shear.maxSpacing': c4('Table 409.7.6.2.2', 'Table 9.7.6.2.2'),
  'shear.criticalSection': c4('409.4.3.2', '9.4.3.2'),
  'torsion.threshold': c4('Table 422.7.4.1(a)', 'Table 22.7.4.1(a)'),
  'torsion.neglect': c4('409.5.4.1', '9.5.4.1'),
  'torsion.cracking': c4('Table 422.7.5.1', 'Table 22.7.5.1'),
  'torsion.Tn': c4('422.7.6.1', '22.7.6.1'),
  'torsion.sectionLimit': c4('422.7.7.1', '22.7.7.1'),
  'torsion.minTransverse': c4('409.6.4.2', '9.6.4.2'),
  'torsion.minLongitudinal': c4('409.6.4.3', '9.6.4.3'),
  'torsion.maxSpacing': c4('409.7.6.3.3', '9.7.6.3.3'),
  'slab.minThickness': c4('Table 407.3.1.1', 'Table 7.3.1.1'),
  'slab.minSteel': c4('Table 407.6.1.1', 'Table 7.6.1.1'),
  'slab.tempSteel': c4('Table 424.4.3.2', 'Table 24.4.3.2'),
  'slab.maxSpacing': c4('407.7.2.3', '7.7.2.3'),
  'slab.tempSpacing': c4('424.4.3.3', '24.4.3.3'),
  'slab.strain': c4('407.3.3.1', '7.3.3.1'),
  'slab.strength': c4('407.5.1.1', '7.5.1.1'),
  'steel.tension.yield': c5('504.2 (Eq. 504.2-1)', 'D2'),
  'steel.tension.rupture': c5('504.2 (Eq. 504.2-2)', 'D2'),
  'steel.tension.netArea': c5('504.3.2', 'D3.2'),
  'steel.tension.shearLag': c5('Table 504.3.1', 'Table D3.1'),
  'steel.tension.slenderness': c5('504.1', 'D1'),
  'steel.blockShear': c5('510.4.3', 'J4.3'),
  'steel.splicePlate': c5('510.4.1', 'J4.1'),
  'steel.shearCv': c5('507.2.1 (Eqs. 507.2-3 to 507.2-5)', 'G2.1'),
  'steel.holes': c5('Table 510.3.3', 'Table J3.3M'),
  'steel.local': c5('Tables 502.4.1, 502.4.2', 'Table B4.1'),
  'steel.comp.Fcr': c5('505.3', 'E3'),
  'steel.comp.slenderness': c5('505.2', 'E2'),
  'steel.flex.yield': c5('506.2.1', 'F2.1'),
  'steel.flex.ltb': c5('506.2.2', 'F2.2'),
  'steel.flex.Cb': c5('506.1 (Eq. 506.1-1)', 'F1'),
  'steel.flex.flb': c5('506.3.2', 'F3.2'),
  'steel.flex.minor': c5('506.6', 'F6'),
  'steel.shear': c5('507.2.1', 'G2.1'),
  'steel.deflection': c5('512.3', 'L3'),
  'bp.bearing': c5('510.8 (Eqs. 510.8-1, 510.8-2)', 'J8 (Eqs. J8-1, J8-2)'),
  'bp.anchor': c5('510.9', 'J9'),
  'bp.anchorStress': c5('Table 510.3.2', 'Table J3.2'),
  'weld.throat': c5('510.2.2.1', 'J2.2.1'),
  'weld.strength': c5('510.2.4 (Table 510.2.5)', 'J2.4 (Table J2.5)'),
  'weld.group': c5('Eqs. 510.2-9a, 510.2-9b', 'Eqs. J2-9a, J2-9b'),
  'weld.angle': c5('Eq. 510.2-5', 'Eq. J2-5'),
  'weld.base': c5('510.4.2', 'J4.2'),
  'weld.minSize': c5('Table 510.2.4', 'Table J2.4'),
  'weld.limits': c5('510.2.2.2', 'J2.2.2'),
  'weld.long': c5('Eq. 510.2-1', 'Eq. J2-1'),
  'weld.groove': c5('Table 510.2.5', 'Table J2.5'),
  'bolt.shear': c5('510.3.6 (Eq. 510.3-1)', 'J3.6 (Eq. J3-1)'),
  'bolt.stresses': c5('Table 510.3.2', 'Table J3.2'),
  'bolt.bearing': c5('Eqs. 510.3-6a, 510.3-6b', 'Eqs. J3-6a, J3-6b'),
  'bolt.bearingSum': c5('510.3.10', 'J3.10'),
  'bolt.combined': c5('510.3.7 (Eqs. 510.3-3a, 510.3-3b)', 'J3.7 (Eqs. J3-3a, J3-3b)'),
  'bolt.spacing': c5('510.3.3', 'J3.3'),
  'bolt.edgeMin': c5('Table 510.3.4', 'Table J3.4M'),
  'bolt.edgeMax': c5('510.3.5', 'J3.5'),
  'bolt.slip': c5('510.3.8 (Eq. 510.3-4)', 'J3.8 (Eq. J3-4)'),
  'bolt.pretension': c5('Table 510.3.1', 'Table J3.1M'),
  'bolt.slipTension': c5('Eqs. 510.3-5a, 510.3-5b', 'Eqs. J3-5a, J3-5b'),
  'bc.interaction': c5('508.1.1', 'H1.1'),
  'bc.eqA': c5('Eq. 508.1-1a', 'Eq. H1-1a'),
  'bc.eqB': c5('Eq. 508.1-1b', 'Eq. H1-1b'),
  'bc.amplified': c5('503.2.1.2', 'C2.1.2'),
  'bc.Pe1': c5('Eq. 503.2-5', 'Eq. C2-5'),
  'bc.Cm': c5('Eq. 503.2-4', 'Eq. C2-4'),
  'bc.B1': c5('Eq. 503.2-2', 'Eq. C2-2'),
  'bc.Pe2': c5('Eqs. 503.2-6a, 503.2-6b', 'Eqs. C2-6a, C2-6b'),
  'bc.B2': c5('Eq. 503.2-3', 'Eq. C2-3'),
  'bc.Mr': c5('Eqs. 503.2-1a, 503.2-1b', 'Eqs. C2-1a, C2-1b'),
  'found.presumptive': only('Table 304-1'),
  'found.allowableCombos': only('304.3'),
  'found.minDepth': only('Table 305-1'),
  'found.baseArea': c4('413.3.1.1', '13.3.1.1'),
  'found.minEffDepth': c4('413.3.1.2', '13.3.1.2'),
  'found.momentSection': c4('Table 413.2.7.1', 'Table 13.2.7.1'),
  'found.shearSection': c4('413.2.7.2', '13.2.7.2'),
  'found.twoWayVc': c4('Table 422.6.5.2', 'Table 22.6.5.2'),
  'found.twoWaySection': c4('422.6.4.1', '22.6.4.1'),
  'found.cover': c4('Table 420.6.1.3.1', 'Table 20.6.1.3.1'),
  'loads.strength': only('203.3.1'),
  'loads.allowable': only('203.4.1'),
  'loads.alternate': only('203.4.2'),
  'theory.terzaghi': { text: 'Terzaghi bearing capacity theory' },
  'theory.general': { text: 'General bearing capacity equation (Meyerhof; DeBeer; Hansen)' },
  'theory.tributary': { text: 'Tributary area method' },
  'col.Po': c4('Eq. 422.4.2.2', 'Eq. 22.4.2.2'),
  'col.PnMax': c4('Table 422.4.2.1', 'Table 22.4.2.1'),
  'col.rho': c4('410.6.1.1', '10.6.1.1'),
  'col.minBars': c4('410.7.3.1', '10.7.3.1'),
  'col.strain': c4('422.2.1.2, 420.2.2.1', '22.2.1.2, 20.2.2.1'),
  'col.tieSize': c4('425.7.2.2', '25.7.2.2'),
  'col.tieSpacing': c4('425.7.2.1', '25.7.2.1'),
  'col.spiralRatio': c4('Eq. 425.7.3.3', 'Eq. 25.7.3.3'),
  'col.spiralSpacing': c4('425.7.3.1', '25.7.3.1'),
  'col.spiralBar': c4('425.7.3.2', '25.7.3.2'),
  'col.radius': c4('406.2.5.1', '6.2.5.1'),
  'col.slenderLimit': c4('406.2.5', '6.2.5'),
  'col.EIeff': c4('Eq. 406.6.4.4.4a', 'Eq. 6.6.4.4.4a'),
  'col.Pc': c4('Eq. 406.6.4.4.2', 'Eq. 6.6.4.4.2'),
  'col.Cm': c4('406.6.4.5.3', '6.6.4.5.3'),
  'col.M2min': c4('Eq. 406.6.4.5.4', 'Eq. 6.6.4.5.4'),
  'col.delta': c4('Eq. 406.6.4.5.2', 'Eq. 6.6.4.5.2'),
  'col.Mc': c4('Eq. 406.6.4.5.1', 'Eq. 6.6.4.5.1'),
  'col.deltaLimit': c4('406.2.6', '6.2.6'),
  'col.sway': c4('406.6.4.6', '6.6.4.6'),
  'dev.sqrtFc': c4('425.4.1.4', '25.4.1.4'),
  'dev.tension.simple': c4('Table 425.4.2.2', 'Table 25.4.2.2'),
  'dev.tension.general': c4('Eq. 425.4.2.3a', 'Eq. 25.4.2.3a'),
  'dev.tension.ktr': c4('Eq. 425.4.2.3b', 'Eq. 25.4.2.3b'),
  'dev.tension.factors': c4('Table 425.4.2.4', 'Table 25.4.2.4'),
  'dev.tension.min': c4('425.4.2.1', '25.4.2.1'),
  'dev.excess': c4('425.4.10.1, 425.4.10.2', '25.4.10.1, 25.4.10.2'),
  'dev.hook': c4('425.4.3.1', '25.4.3.1'),
  'dev.hook.factors': c4('Table 425.4.3.2', 'Table 25.4.3.2'),
  'dev.hook.geometry': c4('Table 425.3.1', 'Table 25.3.1'),
  'dev.comp': c4('425.4.9.2', '25.4.9.2'),
  'dev.comp.min': c4('425.4.9.1', '25.4.9.1'),
  'dev.comp.factors': c4('Table 425.4.9.3', 'Table 25.4.9.3'),
  'dev.lap.tension': c4('Table 425.5.2.1', 'Table 25.5.2.1'),
  'dev.lap.ld': c4('425.5.1.4', '25.5.1.4'),
  'dev.lap.comp': c4('425.5.5.1', '25.5.5.1'),
  'dev.lap.compSizes': c4('425.5.5.4', '25.5.5.4'),
  'dev.hookComp': c4('425.4.1.2', '25.4.1.2'),
  'col.wsd': only('429.7.1'),
  'mat.strength': c4('413.3.4', '13.3.4'),
  'pile.allowable': only('306.3'),
  'pc.number': c4('413.4.1.1', '13.4.1.1'),
  'pc.reactions': c4('413.4.2.2', '13.4.2.2'),
  'pc.shear': c4('413.4.2.3, 413.4.2.5', '13.4.2.3, 13.4.2.5'),
  'pc.dMin': c4('413.4.2.1', '13.4.2.1'),
  'pile.group': only('306.7'),
  'mat.noDDM': c4('413.3.4.2', '13.3.4.2'),
  'sw.d': c4('411.5.4.2', '11.5.4.2'),
  'sw.vnMax': c4('411.5.4.3', '11.5.4.3'),
  'sw.Vc': c4('411.5.4.5', '11.5.4.5'),
  'sw.Vs': c4('Eq. 411.5.4.8', 'Eq. 11.5.4.8'),
  'sw.rho': c4('411.6.2', '11.6.2'),
  'sw.minSteel': c4('Table 411.6.1', 'Table 11.6.1'),
  'sw.spacingL': c4('411.7.2.1', '11.7.2.1'),
  'sw.spacingT': c4('411.7.3.1', '11.7.3.1'),
  'sw.curtains': c4('411.7.2.3', '11.7.2.3'),
  'sw.simplified': c4('411.5.3.1', '11.5.3.1'),
  'sw.k': c4('Table 411.5.3.2', 'Table 11.5.3.2'),
  'sw.phi': c4('411.5.3.3', '11.5.3.3'),
  'sw.hMin': c4('Table 411.3.1.1', 'Table 11.3.1.1'),
  'rw.stability': only('206.6'),
  'rw.minFluid': only('206.6'),
  'rw.friction': only('305.7.4.1'),
  'cf.design': c4('413.2.6', '13.2.6'),
  'cf.minSteel': c4('413.3.4', '13.3.4'),
  'dw.colBearing': c4('Table 422.8.3.2(c)', 'Table 22.8.3.2(c)'),
  'dw.ftgBearing': c4('Table 422.8.3.2(a), (b)', 'Table 22.8.3.2(a), (b)'),
  'dw.minArea': c4('416.3.4.1', '16.3.4.1'),
  'dw.embed': c4('425.4.9', '25.4.9'),
  'tw.thickness': c4('Table 408.3.1.1', 'Table 8.3.1.1'),
  'tw.thicknessMin': c4('408.3.1.1', '8.3.1.1'),
  'tw.beams': c4('Table 408.3.1.2', 'Table 8.3.1.2'),
  'tw.limits': c4('408.10.2', '8.10.2'),
  'tw.ln': c4('408.10.3.2.1', '8.10.3.2.1'),
  'tw.Mo': c4('408.10.3.2', '8.10.3.2'),
  'tw.interior': c4('408.10.4.1', '8.10.4.1'),
  'tw.end': c4('Table 408.10.4.2', 'Table 8.10.4.2'),
  'tw.csWidth': c4('408.4.1.5', '8.4.1.5'),
  'tw.csIntNeg': c4('408.10.5.1', '8.10.5.1'),
  'tw.csExtNeg': c4('408.10.5.2', '8.10.5.2'),
  'tw.csPos': c4('408.10.5.5', '8.10.5.5'),
  'tw.beam': c4('408.10.5.7', '8.10.5.7'),
  'tw.ms': c4('408.10.6.1', '8.10.6.1'),
  'tw.minSteel': c4('Table 408.6.1.1', 'Table 8.6.1.1'),
  'tw.maxSpacing': c4('408.7.2.2', '8.7.2.2'),
  'tw.gammaF': c4('408.4.2.3.2', '8.4.2.3.2'),
  'tw.gammaV': c4('408.4.4.2.2', '8.4.4.2.2'),
  'tw.vuMax': c4('408.4.4.2.3', '8.4.4.2.3'),
  'punch.alpha': c4('422.6.5.3', '22.6.5.3'),
  'serv.fr': c4('Eq. 419.2.3.1', 'Eq. 19.2.3.1'),
  'serv.Mcr': c4('Eq. 424.2.3.5b', 'Eq. 24.2.3.5b'),
  'serv.Ie': c4('Eq. 424.2.3.5a', 'Eq. 24.2.3.5a'),
  'serv.lambda': c4('Eq. 424.2.4.1.1', 'Eq. 24.2.4.1.1'),
  'serv.xi': c4('Table 424.2.4.1.3', 'Table 24.2.4.1.3'),
  'serv.limits': c4('Table 424.2.2', 'Table 24.2.2'),
  'crack.spacing': c4('Table 424.3.2', 'Table 24.3.2'),
  'crack.fs': c4('424.3.2.1', '24.3.2.1'),
  'theory.plain': { text: 'Theory' },
  'theory.mechanics': { text: 'Mechanics of materials' },
  'theory.soil': { text: 'Soil mechanics' },
  'theory.matrix.dof': { text: 'Degrees of freedom and their numbering (Kassimali, Matrix Analysis of Structures, Ch. 3)' },
  'theory.matrix.truss': { text: 'Plane truss member stiffness (Kassimali Ch. 3)' },
  'theory.matrix.beam': { text: 'Beam member stiffness and fixed-end forces (Kassimali Ch. 5)' },
  'theory.matrix.frame': { text: 'Plane frame member stiffness and transformation (Kassimali Ch. 6)' },
  'theory.matrix.bar': { text: 'Axial bar element (Kassimali Ch. 3)' },
  'theory.matrix.assembly': { text: 'Structure stiffness matrix by assembly (Kassimali Ch. 3 to 6)' },
  'theory.matrix.solve': { text: 'Partitioned stiffness relations (Kassimali Ch. 3 and 7.3)' },
  'theory.matrix.release': { text: 'Member releases (Kassimali 7.1)' },
  'theory.matrix.support': { text: 'Support displacements (Kassimali 7.3)' },
  'theory.matrix.incline': { text: 'Inclined roller supports (Kassimali 9.4)' },
  'theory.matrix.statics': { text: 'Equilibrium (statics)' },
  'basic.barArea': { text: 'Bar properties' },
  'basic.statics': { text: 'Statics' },
  'basic.geometry': { text: 'Geometry' },
  'basic.section': { text: 'Section properties' },
  'basic.design': { text: 'Design aid' }
};

export default {
  id: 'nscp2015',
  label: 'NSCP 2015 (ACI 318-14M)',
  short: 'NSCP 2015',
  enabled: true,
  sources: { concrete: 'ACI 318-14', steel: 'AISC 360', loads: 'ASCE/SEI 7', legacy: ['UBC-1997', 'IBC-2009'] },
  concrete, wsd, steel, found, loads, theory, clauses
};
