// Isolated footing under a rectangular column: sizing, shear and flexure. Pure calculation.
// Units: kN, kN·m, kPa, m for plan dimensions and depths below grade; mm for h, d, column and bars; MPa.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings, roundUp } from '../rc/common.js';
import { oneWayShearVc } from '../rc/shear-torsion.calc.js';
import { netAllowable, twoWayVc, footingSteel } from './common.js';

const LM = 'length_m', L = 'length_mm', PR = 'pressure', F = 'force', M = 'moment', A = 'area', ST = 'stress';

// Governing gravity load: larger of the first two strength combinations with dead and live load only.
export function factoredGravity(D, Lv, ed) {
  const G = ed.loads.gravity, a = G.D1 * D, b = G.D * D + G.L * Lv;
  return { a, b, value: Math.max(a, b), eq: a > b ? '203-1' : '203-2' };
}
// Integral of a linear pressure q0 (1 + k x) from a to b, and its first moment about a.
const areaLin = (q0, k, a, b) => q0 * ((b - a) + k * (b * b - a * a) / 2);
const momentLin = (q0, k, a, b) => q0 * ((b - a) * (b - a) / 2 + k * ((b * b * b - a * a * a) / 3 - a * (b * b - a * a) / 2));

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, FD = ed.found, phiV = C.phi.shear, cover = C.cover.ground, analyze = input.mode === 'analyze';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  if (!positive(input, ['c1', 'c2', 'qa', 'fc', 'fy', 'h', 'db']) || !(input.PD >= 0) || !(input.PL >= 0) || !(input.PD + input.PL > 0)) return stop('The loads, column size, soil pressure, strengths and thickness need positive numbers.');
  const { PD, PL, c1, c2, fc, fy, h, db } = input, P = PD + PL;
  if (!input.qaNet && (!positive(input, ['gammaC', 'gammaS']) || !(input.Df > 0))) return stop('Give the depth of the footing base and the unit weights of concrete and soil.');
  if (!input.qaNet && input.Df * 1000 < h) return stop('The depth of the base Df cannot be less than the footing thickness h.');
  out.warnings.push(...materialWarnings(fc, fy, ed));
  out.diagram = { c1, c2, h, chips: [S`column ${v(c1, L)} × ${u(c2, L)}`, S`h = ${u(h, L)}, ${db} mm bars`] };

  // 1. net allowable pressure
  const na = netAllowable(input), qe = na.qe;
  if (input.qaNet) rec.add('Net allowable soil pressure', S`qe = qa (given as net)`, null, S`qe = ${u(qe, PR)}`, 'found.baseArea');
  else rec.add('Net allowable soil pressure', S`qe = qa − γc · h − γs (Df − h)`, S`qe = ${v(input.qa, PR)} − ${v(input.gammaC, 'unitweight')} · ${v(h / 1000, LM)} − ${v(input.gammaS, 'unitweight')} (${v(input.Df, LM)} − ${v(h / 1000, LM)})`, S`qe = ${u(qe, PR)}`, 'found.baseArea');
  vals.qe = qe;
  if (!(qe > 0)) return stop('The weight of the footing and soil uses up the whole allowable pressure. Check qa, Df and h.');

  // 2. plan size
  const Ms = input.Ms > 0 ? input.Ms : 0, MuIn = input.Mu > 0 ? input.Mu : 0;
  const qmaxOf = (B, Lf) => { const e = Ms / P; return e <= Lf / 6 ? P / (B * Lf) * (1 + 6 * e / Lf) : Infinity; };
  let B, Lf;
  const Areq = P / qe;
  vals.Areq = Areq;
  if (analyze) {
    if (!positive(input, ['B', 'L'])) return stop('Give the footing width B and length L.');
    B = input.B; Lf = input.L;
    rec.add('Footing size (given)', S`required area = (PD + PL) / qe`, S`(${v(PD, F)} + ${v(PL, F)}) / ${v(qe, PR)} = ${u(Areq, 'area_m2')}`, S`B × L = ${v(B, LM)} × ${u(Lf, LM)} = ${u(B * Lf, 'area_m2')}`, 'found.baseArea');
  } else if (input.plan === 'rect') {
    if (!(input.L > 0)) return stop('Give the footing length L for a rectangular footing.');
    Lf = input.L; const Bc = Areq / Lf; B = roundUp(Bc, FD.roundUp); vals.Bcalc = Bc;
    while (Ms > 0 && qmaxOf(B, Lf) > qe && B < 50) B = roundUp(B + FD.roundUp, FD.roundUp);
    rec.add('Footing size', S`required area = (PD + PL) / qe;  B = area / L, rounded up to ${u(FD.roundUp, LM)}`, S`area = (${v(PD, F)} + ${v(PL, F)}) / ${v(qe, PR)} = ${u(Areq, 'area_m2')};  B = ${v(Areq, 'area_m2')} / ${v(Lf, LM)} = ${u(Bc, LM)}`, S`Use B × L = ${v(B, LM)} × ${u(Lf, LM)}`, 'found.baseArea', Ms > 0 ? 'B is increased where needed so that the maximum pressure with the moment stays within qe.' : '');
  } else {
    const Bc = Math.sqrt(Areq); B = roundUp(Bc, FD.roundUp); vals.Bcalc = Bc;
    while (Ms > 0 && qmaxOf(B, B) > qe && B < 50) B = roundUp(B + FD.roundUp, FD.roundUp);
    Lf = B;
    rec.add('Footing size', S`required area = (PD + PL) / qe;  B = √area, rounded up to ${u(FD.roundUp, LM)}`, S`area = (${v(PD, F)} + ${v(PL, F)}) / ${v(qe, PR)} = ${u(Areq, 'area_m2')};  B = ${u(Bc, LM)}`, S`Use ${v(B, LM)} × ${u(B, LM)}`, 'found.baseArea', Ms > 0 ? 'The side is increased where needed so that the maximum pressure with the moment stays within qe.' : '');
  }
  const Bmm = B * 1000, Lmm = Lf * 1000;
  if (Bmm <= c2 || Lmm <= c1) return stop('The footing must be larger than the column in both directions.');
  Object.assign(vals, { B, L: Lf });
  Object.assign(out.diagram, { B, L: Lf });
  out.diagram.chips.push(S`B × L = ${v(B, LM)} × ${u(Lf, LM)}`);

  // service pressure
  let qs = P / (B * Lf), eS = 0;
  if (Ms > 0) {
    eS = Ms / P;
    if (eS > Lf / 6) return stop('The service resultant falls outside the middle third (e > L/6). Increase the footing length L.');
    const qmin = P / (B * Lf) * (1 - 6 * eS / Lf); qs = P / (B * Lf) * (1 + 6 * eS / Lf);
    rec.add('Service soil pressure with moment', S`e = M / P;  q = P / (B L) (1 ± 6e / L)`, S`e = ${v(Ms, M)} / ${v(P, F)} = ${u(eS, LM)} ≤ L/6 = ${u(Lf / 6, LM)}`, S`qmax = ${u(qs, PR)},  qmin = ${u(qmin, PR)}`, 'basic.statics');
    Object.assign(vals, { eService: eS, qmin });
  }
  vals.qService = qs;

  // 3. factored load and pressure
  const fg = factoredGravity(PD, PL, ed), G = ed.loads.gravity;
  const Pu = input.Pu > 0 ? input.Pu : fg.value, qu = Pu / (B * Lf);
  rec.add('Factored load and pressure', input.Pu > 0 ? S`Pu given;  qu = Pu / (B L)` : S`Pu = greater of ${G.D1} PD and ${G.D} PD + ${G.L} PL;  qu = Pu / (B L)`,
    input.Pu > 0 ? S`Pu = ${u(Pu, F)}` : S`Pu = greater of ${v(fg.a, F)} and ${v(fg.b, F)} = ${u(Pu, F)}`, S`qu = ${v(Pu, F)} / (${v(B, LM)} · ${v(Lf, LM)}) = ${u(qu, PR)}`, 'loads.strength');
  const eU = MuIn > 0 ? MuIn / Pu : 0, kq = 12 * eU / (Lf * Lf);   // q(x) = qu (1 + kq x), x from the centre along L
  if (eU > Lf / 6) return stop('The factored resultant falls outside the middle third (e > L/6). Increase the footing length L.');
  if (MuIn > 0) rec.add('Factored pressure with moment', S`e = Mu / Pu;  q(x) = qu (1 + 12 e x / L²), x measured from the centre along L`, S`e = ${v(MuIn, M)} / ${v(Pu, F)} = ${u(eU, LM)}`, S`qu,max = ${u(qu * (1 + 6 * eU / Lf), PR)},  qu,min = ${u(qu * (1 - 6 * eU / Lf), PR)}`, 'basic.statics', 'Shear and moment along L are found by integrating this trapezoidal pressure, not from the average.');
  Object.assign(vals, { Pu, qu });

  // 4. effective depth
  const d = h - cover - db, dm = d / 1000;
  rec.add('Effective depth', S`d = h − ${u(cover, L)} cover − db  (average of the two bar layers)`, S`d = ${v(h, L)} − ${v(cover, L)} − ${v(db, L)}`, S`d = ${u(d, L)}  (minimum ${u(C.footing.dMin, L)})`, 'found.minEffDepth', 'Cover of ' + cover + ' mm for concrete cast against and permanently in contact with ground.');
  vals.d = d;
  if (d < C.footing.dMin) return stop('The effective depth is below the ' + C.footing.dMin + ' mm minimum for footings. Increase the thickness h.');

  // 5. one-way shear in each direction
  const one = (name, span, col, width, lin) => {
    const arm = Math.max((span - col / 1000) / 2 - dm, 0);
    const Vu = lin ? width * areaLin(qu, kq, span / 2 - arm, span / 2) : qu * width * arm;
    const pVc = phiV * oneWayShearVc(width * 1000, d, fc, 1, ed) / 1e3;
    rec.add('One-way shear, section across ' + name, lin ? S`Vu = width × ∫ q dx from the section to the edge;  φVc = ${phiV} · ${C.shear.vc} √f'c · width · d` : S`Vu = qu · width · ((${name} − c) / 2 − d);  φVc = ${phiV} · ${C.shear.vc} √f'c · width · d`,
      S`Vu = ${v(qu, PR)} · ${v(width, LM)} · ${v(arm, LM)}${lin ? ' (trapezoid integrated)' : ''};  φVc = ${phiV} · ${C.shear.vc} · √(${si(fc, ST)}) · ${si(width * 1000, L)} · ${si(d, L)}`, S`Vu = ${u(Vu, F)},  φVc = ${u(pVc, F)},  D/C = ${dc(Vu / pVc)}`, 'found.shearSection', 'Critical section at d from the column face.');
    return { Vu, pVc, dc: Vu / pVc };
  };
  const s1 = one('L', Lf, c1, B, MuIn > 0), s2 = one('B', B, c2, Lf, false), sg = s1.dc >= s2.dc ? s1 : s2;
  Object.assign(vals, { Vu1: s1.Vu, phiVc1: s1.pVc, dc1: s1.dc, Vu1B: s2.Vu, phiVc1B: s2.pVc });

  // 6. two-way shear
  const b1 = c1 + d, b2 = c2 + d, bo = 2 * (b1 + b2), Vu2 = qu * (B * Lf - b1 * b2 / 1e6);
  const betaCol = Math.max(c1, c2) / Math.min(c1, c2), tw = twoWayVc(fc, betaCol, C.twoWay.alpha.interior, d, bo, 1, ed), pVc2 = phiV * tw.vc * bo * d / 1e3;
  rec.add('Two-way shear', S`bo = 2 (c1 + d) + 2 (c2 + d);  Vu = qu [B L − (c1 + d)(c2 + d)]`, S`bo = ${u(bo, L)};  Vu = ${v(qu, PR)} [${v(B * Lf, 'area_m2')} − ${v(b1 * b2 / 1e6, 'area_m2')}]`, S`Vu = ${u(Vu2, F)}`, 'found.twoWaySection', 'Critical section at d/2 from the column faces.');
  rec.add('Two-way shear strength', S`vc = least of ${C.twoWay.a} √f'c, ${C.twoWay.b} (1 + 2/β) √f'c, ${C.twoWay.c} (2 + αs d / bo) √f'c;  φVc = ${phiV} · vc · bo · d`,
    S`vc = least of ${si(tw.a, ST)}, ${si(tw.b, ST)}, ${si(tw.c, ST)}  (β = ${betaCol}, αs = ${C.twoWay.alpha.interior})`, S`vc = ${u(tw.vc, ST)},  φVc = ${u(pVc2, F)},  D/C = ${dc(Vu2 / pVc2)}`, 'found.twoWayVc');
  Object.assign(vals, { bo, Vu2, vc: tw.vc, phiVc2: pVc2, dc2: Vu2 / pVc2 });

  // 7. flexure in each direction
  const SP = C.slabSpacing.main, sMax = Math.min(SP.timesH * h, SP.max), Ab = barArea(1, db);
  const flex = (name, span, col, width, lin) => {
    const arm = (span - col / 1000) / 2;
    const Mu = lin ? width * momentLin(qu, kq, col / 2000, span / 2) : qu * width * arm * arm / 2;
    const fs = footingSteel(Mu, width * 1000, d, h, fc, fy, ed);
    if (!fs.ok) return null;
    let n = Math.max(2, Math.ceil(fs.AsUse / Ab - 1e-9));
    const space = (nn) => (width * 1000 - 2 * cover - db) / (nn - 1);
    while (space(n) > sMax) n++;
    rec.add('Flexure, bars parallel to ' + name, lin ? S`Mu = width × ∫ q (x − face) dx;  Rn = Mu / (${fs.phi} · width · d²);  As = ρ · width · d` : S`Mu = qu · width · ((${name} − c) / 2)² / 2;  Rn = Mu / (${fs.phi} · width · d²);  As = ρ · width · d`,
      S`Mu = ${u(Mu, M)};  Rn = ${u(fs.Rn, ST)};  ρ = ${fs.rho};  As = ${u(fs.As, A)};  As,min = ${fs.ratio} · width · h = ${u(fs.AsMin, A)}`,
      S`As to use = ${u(fs.AsUse, A)}:  ${n} - ${db} mm bars at about ${u(space(n), L)} (maximum ${u(sMax, L)})`, 'found.momentSection', 'Critical section at the face of the column. Minimum steel is the shrinkage and temperature ratio (' + ed.clauses['slab.minSteel'].nscp + ').');
    return { Mu, fs, n, spacing: space(n), prov: n * Ab };
  };
  const fL = flex('L', Lf, c1, B, MuIn > 0), fB = flex('B', B, c2, Lf, false);
  if (!fL || !fB) return stop('The footing is too thin for the bending moment. Increase the thickness h.');
  Object.assign(vals, { Mu: fL.Mu, Rn: fL.fs.Rn, AsReq: fL.fs.As, AsMin: fL.fs.AsMin, AsUse: fL.fs.AsUse, bars: fL.n, MuB: fB.Mu, AsReqB: fB.fs.As, AsUseB: fB.fs.AsUse, barsB: fB.n });

  // 8. band rule for rectangular footings
  const rect = Math.abs(Lf - B) > 1e-9;
  if (rect) {
    const long = Math.max(Lf, B), short = Math.min(Lf, B), bRatio = long / short, gs = 2 / (bRatio + 1);
    rec.add('Short-direction bars in the centre band', S`γs = 2 / (β + 1),  β = long side / short side`, S`β = ${v(long, LM)} / ${v(short, LM)} = ${bRatio}`, S`γs = ${gs}: this fraction of the short-direction steel goes in a centre band as wide as the short side`, 'found.momentSection', FD.bandNote);
    vals.bandFraction = gs;
    out.results.push(res('Band fraction γs', gs));
  }

  out.checks.push(check('Soil pressure', ['service pressure', qs, PR], ['qe', qe, PR], qs / qe, 'found.baseArea'));
  out.checks.push(check('One-way shear', ['Vu', sg.Vu, F], ['φVc', sg.pVc, F], sg.dc, 'found.shearSection', { note: 'governing direction: section across ' + (sg === s1 ? 'L' : 'B') }));
  out.checks.push(check('Two-way shear', ['Vu', Vu2, F], ['φVc', pVc2, F], Vu2 / pVc2, 'found.twoWayVc'));
  out.checks.push(check('Flexure, bars parallel to L', ['As required', fL.fs.AsUse, A], ['As provided', fL.prov, A], fL.fs.AsUse / fL.prov, 'found.momentSection'));
  out.checks.push(check('Flexure, bars parallel to B', ['As required', fB.fs.AsUse, A], ['As provided', fB.prov, A], fB.fs.AsUse / fB.prov, 'found.momentSection'));
  if (MuIn > 0) out.notes.push('Two-way shear uses the net upward force outside the critical section. Transfer of the column moment through the critical section is not included.');
  out.results = [res('B', B, LM), res('L', Lf, LM), res('qu', qu, PR), res('d', d, L), res('As parallel to L', fL.fs.AsUse, A), res('Bars parallel to L', fL.n + ' - ' + db + ' mm', 'text'), res('As parallel to B', fB.fs.AsUse, A), res('Bars parallel to B', fB.n + ' - ' + db + ' mm', 'text')].concat(out.results);
  Object.assign(out.diagram, { d, nL: fL.n, nB: fB.n, qu, quMax: qu * (1 + 6 * eU / Lf), quMin: qu * (1 - 6 * eU / Lf) });
  out.send = [{ to: 'found/dowels', mode: 'dowels', label: 'Check bearing and dowels at the column base', values: { Pu, c1, c2: input.c2, B, L: Lf, h, fcFtg: fc } }];
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}
