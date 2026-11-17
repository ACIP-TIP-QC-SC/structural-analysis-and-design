// Presets for rc/shear-walls.
export const meta = { module: 'rc/shear-walls', calc: 'js/modules/rc/shear-walls.calc.js' };
const base = { h: 250, lw: 4000, hw: 3000, fc: 28, fy: 420, lambda: 1, Vu: 900, Nu: null, dbH: 12, dbV: 12, curtains: 2, s: null,
  method: 'simplified', strip: 1000, lc: 3000, lu: null, k: 0.8, e: 0, Pu: 1200, Mu: 1500, sV: 300, cover: 25 };
const P = (o) => Object.assign({}, base, o);
export default [
  { id: 'w1', test: 'SW-1', name: 'Test: 250 × 4000 wall, Vu 900 kN, 12 mm bars in two curtains', mode: 'shear', inputs: P({}),
    expect: { d: 3200, Vc: 719.64, phiVc: 539.73, VnMax: 3513.6, VsReq: 480.36, Av: 226.19, sStrength: 632.88, sRho: 361.91, sMax: 450, sUse: 361.91, sPractical: 350, rhoTAt: 0.0025851, rhoLMin: 0.0025744, phiVn: 1191.2 }, pass: true },
  { id: 'w2', name: 'Example: Vu 2000 kN with 12 mm bars at 200 mm (fails on purpose)', mode: 'shear', inputs: P({ Vu: 2000, s: 200 }) },
  { id: 'a1', test: 'SW-2', name: 'Test: simplified axial strength, 200 mm wall, ℓc 3 m', mode: 'axial', inputs: P({ h: 200, Pu: 1500 }), expect: { Pn: 2646.9, phiPn: 1720.5, hMin: 120 }, pass: true },
  { id: 'a2', name: 'Example: in-plane bending of a 4 m wall', mode: 'axial', inputs: P({ method: 'interaction', h: 250, dbV: 16, sV: 300, Pu: 3000, Mu: 6000 }) },
  { id: 'm1', name: 'Example: minimum steel, 200 mm wall, 12 mm bars, one curtain', mode: 'minimum', inputs: P({ h: 200, curtains: 1 }) }
];
