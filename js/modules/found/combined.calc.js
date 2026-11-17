// Combined footings for two columns: rectangular, trapezoidal and strap (cantilever). Pure calculation.
// Units: m along the footing, kN, kPa, kN/m, kN·m; mm for thickness, depth, columns and bars; MPa.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { materialWarnings, roundUp } from '../rc/common.js';
import { requiredSteelRect } from '../rc/beam-flexure.calc.js';
import { oneWayShearVc } from '../rc/shear-torsion.calc.js';
import { twoWayVc } from './common.js';
import { factoredGravity } from './isolated.calc.js';

const LM = 'length_m', L = 'length_mm', PR = 'pressure', F = 'force', M = 'moment', LL = 'lineload', A = 'area', ST = 'stress', AM = 'area_m2';

// Beam on the footing: upward line load w(x) given as a function, downward point loads. x from the left end (m).
// Shear V(x) and moment M(x) by numerical integration at the stations, with exact steps at the point loads.
export function beamDiagrams(Lf, wAt, loads, n) {
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(Lf * i / n);
  loads.forEach((p) => { xs.push(p.x - 1e-9, p.x + 1e-9); });
  xs.sort((a, b) => a - b);
  const out = [];
  let V = 0, Mv = 0, xp = 0, wp = wAt(0);
  xs.forEach((x) => {
    const w = wAt(x), dx = x - xp;
    const dV = (wp + w) / 2 * dx;
    Mv += V * dx + (2 * wp + w) / 6 * dx * dx;
    V += dV;
    loads.forEach((p) => { if (p.x > xp && p.x <= x) { V -= p.P; Mv -= p.P * (x - p.x); } });
    out.push({ x, V, M: Mv });
    xp = x; wp = w;
  });
  return out;
}
const near = (pts, x) => pts.reduce((m, p) => (Math.abs(p.x - x) < Math.abs(m.x - x) ? p : m), pts[0]);
const valueAt = (pts, x, key) => {
  for (let i = 1; i < pts.length; i++) if (pts[i].x >= x) {
    const a = pts[i - 1], b = pts[i], t = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0;
    return a[key] + t * (b[key] - a[key]);
  }
  return pts[pts.length - 1][key];
};

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, K = ed.found.combined, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const need = ['cA1', 'cA2', 'cB1', 'cB2', 's', 'a', 'qa'];
  if (!positive(input, need) || !(input.PDA >= 0 && input.PLA >= 0 && input.PDB >= 0 && input.PLB >= 0)) return stop('Every column size, load, spacing and the soil pressure need positive numbers.');
  const PA = input.PDA + input.PLA, PB = input.PDB + input.PLB, R = PA + PB, sp = input.s, a = input.a, qa = input.qa;
  if (!(PA > 0 && PB > 0)) return stop('Both columns need a load.');
  const fa = factoredGravity(input.PDA, input.PLA, ed), fb = factoredGravity(input.PDB, input.PLB, ed), PuA = fa.value, PuB = fb.value, Ru = PuA + PuB;
  const xbar = PB * sp / R;
  rec.add('Resultant of the service loads', S`R = PA + PB;  x̄ = PB s / R from column A`, S`R = ${v(PA, F)} + ${v(PB, F)} = ${u(R, F)};  x̄ = ${v(PB, F)} · ${v(sp, LM)} / ${v(R, F)}`, S`x̄ = ${u(xbar, LM)}`, 'basic.statics');
  Object.assign(vals, { R, xbar, PuA, PuB });
  const G = ed.loads.gravity;
  const factStep = () => rec.add('Factored column loads', S`Pu = greater of ${G.D1} PD and ${G.D} PD + ${G.L} PL`, S`A: ${u(PuA, F)};  B: ${u(PuB, F)}`, null, 'cf.design', 'Proportioning uses service loads and the net allowable pressure; strength design uses factored loads.');

  // ---------------------------------------------------------------- strap footing
  if (input.mode === 'strap') {
    if (!positive(input, ['L1'])) return stop('Give the length L1 of the exterior footing along the strap.');
    const L1 = input.L1, e = L1 / 2 - a;
    if (!(e > 0) || e >= sp) return stop('The exterior footing must extend beyond column A toward column B, and e must be less than the spacing.');
    const R1 = PA * sp / (sp - e), R2 = R - R1;
    rec.add('Eccentricity of the exterior footing', S`e = L1 / 2 − a`, S`e = ${v(L1, LM)} / 2 − ${v(a, LM)}`, S`e = ${u(e, LM)}`, 'basic.statics');
    rec.add('Soil reactions', S`R1 = PA s / (s − e);  R2 = PA + PB − R1`, S`R1 = ${v(PA, F)} · ${v(sp, LM)} / (${v(sp, LM)} − ${v(e, LM)})`, S`R1 = ${u(R1, F)},  R2 = ${u(R2, F)}`, 'basic.statics', 'The strap is assumed weightless and not bearing on the soil.');
    if (!(R2 > 0)) return stop('The interior reaction is not positive: column A pulls the strap up at column B. Change the layout.');
    const A1 = R1 / qa, B1 = A1 / L1, A2 = R2 / qa, side = Math.sqrt(A2);
    rec.add('Footing sizes', S`A1 = R1 / qa;  B1 = A1 / L1;  A2 = R2 / qa (square by default)`, S`A1 = ${u(A1, AM)};  A2 = ${u(A2, AM)}`, S`B1 = ${u(B1, LM)};  interior side = ${u(side, LM)}`, 'found.baseArea');
    factStep();
    const Ru1 = PuA * sp / (sp - e), Vs = Ru1 - PuA, Ms = PuA * (L1 - a) - Ru1 * L1 / 2;
    rec.add('Strap design forces', S`Ru1 = PuA s / (s − e);  shear in the strap = Ru1 − PuA;  moment at the inner edge of footing 1 = PuA (L1 − a) − Ru1 L1 / 2`, S`Ru1 = ${u(Ru1, F)}`, S`Vu = ${u(Vs, F)};  Mu = ${u(Math.abs(Ms), M)} (tension on top)`, 'cf.design');
    Object.assign(vals, { e, R1, R2, A1, B1, A2, side, Ru1, VuStrap: Vs, MuStrap: Math.abs(Ms) });
    out.notes.push('Design the exterior footing as a wall footing across B1 and the interior footing as an isolated footing with the reactions above.');
    out.notes.push('The strap moment is largest at the inner edge of footing 1; inside footing 1 the moment peaks where the shear is zero and belongs to the design of that footing.');
    out.results = [res('e', e, LM), res('R1', R1, F), res('R2', R2, F), res('B1', B1, LM), res('Interior side', side, LM), res('Strap Vu', Vs, F), res('Strap Mu', Math.abs(Ms), M)];
    const xs = [], Vd = [], Md = [];
    for (let i = 0; i <= 100; i++) {
      const x = -a + (sp + a) * i / 100, w1 = Ru1 / L1, inF = x <= L1 - a;
      const up = inF ? w1 * (x + a) : Ru1, mom = PuA * Math.max(x, 0) - (inF ? w1 * (x + a) * (x + a) / 2 : Ru1 * (x + a - L1 / 2));
      xs.push(x); Vd.push([x + a, (x >= 0 ? -PuA : 0) + up]); Md.push([x + a, -mom]);
    }
    out.diagram = { kind: 'strap', s: sp, a, L1, B1, side, V: Vd, M: Md, chips: [S`s = ${u(sp, LM)}`, S`L1 = ${u(L1, LM)}, B1 = ${u(B1, LM)}`] };
    return done();
  }

  // ---------------------------------------------------------------- rectangular and trapezoidal
  if (!positive(input, ['h', 'fc', 'fy', 'db'])) return stop('Give the thickness, strengths and bar size.');
  const { h, fc, fy, db } = input, d = h - C.cover.ground - db, dm = d / 1000;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  if (d < C.footing.dMin) return stop('The effective depth is below the minimum for footings. Increase h.');
  let Lf, width, widthAt, area;
  const trap = input.mode === 'trapezoidal';
  if (trap) {
    if (!positive(input, ['Lt'])) return stop('Give the footing length L for a trapezoidal footing.');
    Lf = input.Lt; area = R / qa;
    const xr = xbar + a;
    if (!(xr > K.thirdLow * Lf && xr < K.thirdHigh * Lf)) return stop('The resultant is outside the middle third of the length; a trapezoid cannot centre it.');
    const apb = 2 * area / Lf, a2b = 3 * xr * apb / Lf, wB = a2b - apb, wA = apb - wB;
    if (!(wA > 0 && wB > 0)) return stop('The resultant is outside the middle third of the length; a trapezoid cannot centre it.');
    rec.add('Trapezoid that centres the resultant', S`A = R / qa;  a + b = 2A / L;  a + 2b = 3 x̄' (a + b) / L,  x̄' from end A`, S`A = ${u(area, AM)};  x̄' = ${u(xr, LM)};  a + b = ${u(apb, LM)}`,
      S`width at end A = ${u(wA, LM)},  width at end B = ${u(wB, LM)}`, 'found.baseArea', 'Valid only while L/3 < x̄\' < 2L/3.');
    widthAt = (x) => wA + (wB - wA) * x / Lf; width = null;
    Object.assign(vals, { area, xbarEnd: xr, aPlusB: apb, widthA: wA, widthB: wB });
  } else {
    Lf = 2 * (xbar + a);
    const Breq = R / (qa * Lf), B = input.B > 0 ? input.B : roundUp(Breq, K.roundB);
    rec.add('Footing size', S`L = 2 (x̄ + a), so the centroid is under the resultant;  B = R / (qa L), rounded up to ${u(K.roundB, LM)}`, S`L = 2 (${v(xbar, LM)} + ${v(a, LM)}) = ${u(Lf, LM)};  B = ${v(R, F)} / (${v(qa, PR)} · ${v(Lf, LM)}) = ${u(Breq, LM)}`, S`Use L × B = ${v(Lf, LM)} × ${u(B, LM)}`, 'found.baseArea');
    width = B; widthAt = () => B; area = B * Lf;
    Object.assign(vals, { L: Lf, Breq, B });
  }
  factStep();
  const xA = a, xB = a + sp;
  if (xB >= Lf) return stop('Column B lies beyond the end of the footing. Increase the length.');
  // Factored pressure: linear along L when the factored resultant is off the centroid (rectangle).
  const xc = trap ? (xbar + a) : Lf / 2, xu = a + PuB * sp / Ru;
  let wAt, qu;
  if (trap) { qu = Ru / area; wAt = (x) => qu * widthAt(x); }
  else {
    qu = Ru / area;
    const e = xu - xc, k = 12 * e / (Lf * Lf);
    if (Math.abs(e) > Lf / 6) return stop('The factored resultant falls outside the middle third of the footing length.');
    wAt = (x) => qu * width * (1 + k * (x - xc));
    if (Math.abs(e) > 1e-9) rec.add('Factored soil pressure', S`resultant of the factored loads at ${u(xu, LM)} from end A, off the centroid by e = ${u(e, LM)};  q = ΣPu / (B L) (1 ± 6e / L)`, null, S`q = ${u(qu * (1 - 6 * Math.abs(e) / Lf), PR)} to ${u(qu * (1 + 6 * Math.abs(e) / Lf), PR)}`, 'basic.statics');
  }
  rec.add('Factored pressure and line load', trap ? S`qu = ΣPu / A;  w = qu × width at x` : S`qu = ΣPu / (B L);  w = qu B`, S`qu = ${v(Ru, F)} / ${v(area, AM)} = ${u(qu, PR)}`, trap ? S`w = ${u(wAt(0), LL)} at end A to ${u(wAt(Lf), LL)} at end B` : S`w = ${u(qu * width, LL)}`, 'cf.design');
  vals.qu = qu; vals.w = trap ? null : qu * width;
  const pts = beamDiagrams(Lf, wAt, [{ x: xA, P: PuA }, { x: xB, P: PuB }], K.stations);
  const Vat = (x) => valueAt(pts, x, 'V'), Mat = (x) => valueAt(pts, x, 'M');
  const VAl = Vat(xA - 1e-8), VAr = Vat(xA + 2e-9), VBl = Vat(xB - 2e-9), VBr = Vat(xB + 2e-9);
  // zero shear between the columns
  let lo = xA + 1e-6, hi = xB - 1e-6;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (Vat(mid) < 0) lo = mid; else hi = mid; }
  const x0 = (lo + hi) / 2, M0 = Mat(x0), MA = Mat(xA), MB = Mat(xB);
  rec.add('Shear and moment diagrams', S`beam loaded upward by w and downward by PuA at ${u(xA, LM)} and PuB at ${u(xB, LM)} from end A`,
    S`at A: V = ${u(VAl, F)} and ${u(VAr, F)};  at B: V = ${u(VBl, F)} and ${u(VBr, F)}`, S`zero shear at ${u(x0, LM)};  maximum negative moment ${u(Math.abs(M0), M)} (tension on top);  moment at B ${u(MB, M)}`, 'basic.statics',
    'Moments are positive with tension at the bottom.');
  Object.assign(vals, { VAleft: VAl, VAright: VAr, VBleft: VBl, VBright: VBr, xZero: x0, MnegMax: Math.abs(M0), MA, MB });
  // One-way shear at d from the faces of both columns, the larger governs.
  const phiV = C.phi.shear, cands = [];
  [[xA, input.cA1], [xB, input.cB1]].forEach(([xcCol, c]) => [-1, 1].forEach((sg) => {
    const x = xcCol + sg * (c / 2000 + dm);
    if (x > 0 && x < Lf) cands.push({ x, V: Math.abs(Vat(x)) });
  }));
  const one = cands.reduce((m, c) => (c.V > m.V ? c : m), cands[0]);
  const bw = widthAt(one.x), pVc1 = phiV * oneWayShearVc(bw * 1000, d, fc, 1, ed) / 1e3;
  rec.add('One-way shear at d from the column faces', S`Vu at the critical sections; φVc = ${phiV} · ${C.shear.vc} √f'c · width · d,  d = h − cover − db`, S`d = ${u(d, L)};  governing section at ${u(one.x, LM)} from end A, width ${u(bw, LM)}`,
    S`Vu = ${u(one.V, F)},  φVc = ${u(pVc1, F)}`, 'found.shearSection');
  out.checks.push(check('One-way shear', ['Vu', one.V, F], ['φVc', pVc1, F], one.V / pVc1, 'found.shearSection'));
  Object.assign(vals, { d, xOneWay: one.x, Vu1: one.V, phiVc1: pVc1 });
  // Two-way shear at each column
  const punch = (name, xcCol, c1, c2, Pu) => {
    const half = dm / 2, wid = widthAt(xcCol);
    const x1 = Math.max(xcCol - c1 / 2000 - half, 0), x2 = Math.min(xcCol + c1 / 2000 + half, Lf);
    const y1 = Math.max(-c2 / 2000 - half, -wid / 2), y2 = Math.min(c2 / 2000 + half, wid / 2);
    const sidesX = (x1 > 0 ? 1 : 0) + (x2 < Lf ? 1 : 0), sidesY = (y1 > -wid / 2 ? 1 : 0) + (y2 < wid / 2 ? 1 : 0);
    const bo = ((x2 - x1) * sidesY + (y2 - y1) * sidesX) * 1000, sides = sidesX + sidesY;
    let up = 0; const n = 40;
    for (let i = 0; i < n; i++) { const xx = x1 + (x2 - x1) * (i + 0.5) / n; up += wAt(xx) / widthAt(xx) * (y2 - y1) * (x2 - x1) / n; }
    const Vu = Pu - up, alpha = sides >= 4 ? C.twoWay.alpha.interior : sides === 3 ? C.twoWay.alpha.edge : C.twoWay.alpha.corner;
    const tw = twoWayVc(fc, Math.max(c1, c2) / Math.min(c1, c2), alpha, d, bo, 1, ed), pVc = phiV * tw.vc * bo * d / 1e3;
    rec.add('Two-way shear at column ' + name, S`critical perimeter at d/2 from the faces${sides < 4 ? ', ' + sides + '-sided because the column is within d/2 of the footing edge' : ''};  Vu = Pu − pressure inside the perimeter`,
      S`bo = ${u(bo, L)};  Vu = ${v(Pu, F)} − ${v(up, F)} = ${u(Vu, F)};  vc = ${u(tw.vc, ST)} (αs = ${alpha})`, S`φVc = ${u(pVc, F)}`, 'found.twoWaySection');
    out.checks.push(check('Two-way shear at ' + name, ['Vu', Vu, F], ['φVc', pVc, F], Vu / pVc, 'found.twoWayVc'));
    return { bo, Vu, pVc, sides };
  };
  const pA = punch('A', xA, input.cA1, input.cA2, PuA), pB = punch('B', xB, input.cB1, input.cB2, PuB);
  Object.assign(vals, { boA: pA.bo, VuA: pA.Vu, phiVcA: pA.pVc, boB: pB.bo, VuB: pB.Vu, phiVcB: pB.pVc });
  // Service soil pressure
  const qs = R / area;
  out.checks.unshift(check('Soil pressure', ['service pressure', qs, PR], ['qa', qa, PR], qs / qa, 'found.baseArea'));
  // Longitudinal steel
  const ratio = C.AsMinSlabRatio(fy);   // Table 408.6.1.1 (same values as Table 424.4.3.2)
  const steel = (Mu, wd) => { if (!(Mu > 0)) return 0; const r = requiredSteelRect({ b: wd * 1000, d, fc, fy, Mu: Mu * 1e6 }, ed); return r.ok ? r.As : NaN; };
  const wMid = widthAt(x0), AsTop = steel(Math.abs(Math.min(M0, 0)), wMid), AsBotB = steel(Math.max(MB, 0), widthAt(xB)), AsBotA = steel(Math.max(MA, 0), widthAt(xA));
  const AsMin = ratio * wMid * 1000 * h;
  if (!isFinite(AsTop) || !isFinite(AsBotB)) return stop('The footing is too thin for the bending moments. Increase h.');
  rec.add('Longitudinal steel', S`As from the rectangular flexure function over the footing width;  minimum ${ratio} B h`, S`top (negative moment): ${u(AsTop, A)};  bottom at B: ${u(AsBotB, A)};  bottom at A: ${u(AsBotA, A)}`, S`As,min = ${u(AsMin, A)}`, 'cf.minSteel');
  // Transverse bands under the columns
  const band = (name, xcCol, c1, c2, Pu) => {
    const wd = widthAt(xcCol), arm = (wd - c2 / 1000) / 2, Mu = (Pu / wd) * arm * arm / 2;
    const bw2 = Math.min(xcCol + c1 / 2000 + dm / 2, Lf) - Math.max(xcCol - c1 / 2000 - dm / 2, 0), As = steel(Mu, bw2);
    rec.add('Transverse band under column ' + name, S`band width = column + d/2 each side;  Mu = (Pu / B) ((B − c) / 2)² / 2`, S`band ${u(bw2, LM)};  Mu = ${u(Mu, M)}`, S`As = ${u(As, A)} in the band (minimum steel elsewhere)`, 'found.momentSection');
    return { Mu, As, band: bw2 };
  };
  const tA = band('A', xA, input.cA1, input.cA2, PuA), tB = band('B', xB, input.cB1, input.cB2, PuB);
  Object.assign(vals, { AsTop, AsBotB, AsBotA, AsMin, transA: tA.As, transB: tB.As });
  out.results = [res(trap ? 'Width at A' : 'L', trap ? vals.widthA : Lf, LM), res(trap ? 'Width at B' : 'B', trap ? vals.widthB : width, LM), res('qu', qu, PR), res('Maximum negative moment', Math.abs(M0), M),
    res('Top steel', Math.max(AsTop, AsMin), A), res('Bottom steel at B', Math.max(AsBotB, AsMin), A)];
  out.diagram = { kind: trap ? 'trap' : 'rect', L: Lf, xA, xB, widthA: widthAt(0), widthB: widthAt(Lf), cA: input.cA1, cB: input.cB1, d,
    V: pts.filter((p, i) => i % 4 === 0 || Math.abs(p.x - xA) < 1e-6 || Math.abs(p.x - xB) < 1e-6).map((p) => [p.x, p.V]), M: pts.filter((p, i) => i % 4 === 0).map((p) => [p.x, p.M]),
    chips: [trap ? S`L = ${u(Lf, LM)}, trapezoid` : S`L × B = ${v(Lf, LM)} × ${u(width, LM)}`, S`h = ${u(h, L)}`] };
  return done();
}
