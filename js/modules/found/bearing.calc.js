// Bearing capacity of shallow foundations: Terzaghi and the general equation. Pure calculation.
// Soil units: kPa, kN/m³, m, degrees, kN.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';

const LM = 'length_m', PR = 'pressure', UW = 'unitweight', DEG = 'angle_deg', F = 'force';
const rad = (deg) => deg * Math.PI / 180;

// Effective overburden and unit weight for the last term. Dw = null means no water table.
export function waterTable(p, ed) {
  const gw = ed.theory.gammaW;
  if (p.Dw == null) return { wcase: 'none', q: p.gamma * p.Df, gammaEff: p.gamma, gw };
  const gp = p.gammaSat - gw;
  if (p.Dw <= p.Df) return { wcase: 'I', q: p.gamma * p.Dw + gp * (p.Df - p.Dw), gammaEff: gp, gp, gw };
  const d = p.Dw - p.Df;
  if (d <= p.B) return { wcase: 'II', q: p.gamma * p.Df, gammaEff: gp + (d / p.B) * (p.gamma - gp), gp, d, gw };
  return { wcase: 'III', q: p.gamma * p.Df, gammaEff: p.gamma, d, gw };
}
// Shape, depth and inclination factors of the general equation.
export function generalFactors(p, N, ed) {
  const G = ed.theory.general, t = Math.tan(rad(p.phi)), sn = Math.sin(rad(p.phi)), r = p.Df / p.B, k = r <= 1 ? r : Math.atan(r);
  const Fcs = 1 + p.BL * (N.Nq / N.Nc), Fqs = 1 + p.BL * t, Fgs = 1 - G.shapeGamma * p.BL;
  let Fqd = 1, Fcd, Fgd = 1;
  if (p.phi <= 0) Fcd = 1 + G.depthC0 * k;
  else { Fqd = 1 + 2 * t * Math.pow(1 - sn, 2) * k; Fcd = Fqd - (1 - Fqd) / (N.Nc * t); }
  const Fci = Math.pow(1 - p.beta / 90, 2), Fqi = Fci, Fgi = p.phi > 0 ? Math.pow(1 - p.beta / p.phi, 2) : 1;
  return { Fcs, Fqs, Fgs, Fcd, Fqd, Fgd, Fci, Fqi, Fgi, depthTerm: k, deep: r > 1 };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, TH = ed.theory, general = input.mode === 'general', clause = general ? 'theory.general' : 'theory.terzaghi';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const shape = input.shape || 'square';
  if (!positive(input, ['B', 'gamma', 'FS']) || !(input.Df >= 0) || !(input.c >= 0) || !(input.phi >= 0)) return stop('B, the unit weight and the factor of safety need positive numbers; Df, c\' and φ\' cannot be negative.');
  if (input.c === 0 && input.phi === 0) return stop("The soil needs a cohesion c' or a friction angle φ' above zero.");
  if (!general && shape === 'rectangular') return stop('Rectangular footings are not offered in Terzaghi mode. Use the General equation mode.');
  if (!general && input.phi > TH.terzaghi.phiMax) return stop("The Terzaghi table covers φ' from 0 to " + TH.terzaghi.phiMax + ' degrees.');
  if (input.phi >= 60) return stop("φ' is outside the range of the bearing capacity equations.");
  const { B, Df, c, phi, gamma, FS } = input;
  const strip = shape === 'strip', Lf = shape === 'rectangular' ? input.Lf : strip ? 1 : B;
  if (shape === 'rectangular' && !(Lf > 0)) return stop('The footing length L needs a positive number.');
  const water = input.water === 'depth';
  if (water && (!(input.Dw >= 0) || !(input.gammaSat > 0))) return stop('Give the depth of the water table and the saturated unit weight.');
  const e = input.e > 0 ? input.e : 0, beta = general && input.beta > 0 ? input.beta : 0;
  if (e >= B / TH.eccentricity.limit) return stop('The eccentricity must be less than B/2.');
  if (e > 0 && shape === 'circular') return stop('Eccentric load on a circular footing is not covered. Use a square or rectangular footing.');
  if (beta > 0 && phi > 0 && beta >= phi) return stop("The load inclination β must be less than φ'.");
  out.diagram = { shape, B, Df, Lf, Dw: water ? input.Dw : null, e, chips: [S`${shape} footing, B = ${u(B, LM)}`, S`c' = ${u(c, PR)}, φ' = ${u(phi, DEG)}, γ = ${u(gamma, UW)}`] };

  const Bp = B - 2 * e;
  // Width and length used in the equation: the smaller plan dimension is the width.
  const wB = strip ? Bp : Math.min(Bp, Lf), wL = strip ? Infinity : Math.max(Bp, Lf);
  if (e > 0) rec.add('Effective width for eccentric load', S`B' = B − 2e`, S`B' = ${v(B, LM)} − 2 · ${v(e, LM)}`, S`B' = ${u(Bp, LM)}`, clause, "Meyerhof's effective area method: B' replaces B in the equation and in the shape factors.");
  const w = waterTable({ gamma, gammaSat: input.gammaSat, Df, Dw: water ? input.Dw : null, B: wB }, ed);
  if (w.wcase === 'none') rec.add('Effective overburden at the base', S`q = γ · Df`, S`q = ${v(gamma, UW)} · ${v(Df, LM)}`, S`q = ${u(w.q, PR)}`, 'theory.soil');
  else if (w.wcase === 'I') rec.add('Water table, Case I (at or above the base)', S`q = γ · Dw + (γsat − γw)(Df − Dw);  γ' = γsat − γw in the last term`, S`q = ${v(gamma, UW)} · ${v(input.Dw, LM)} + (${v(input.gammaSat, UW)} − ${v(w.gw, UW)})(${v(Df, LM)} − ${v(input.Dw, LM)})`, S`q = ${u(w.q, PR)},  γ' = ${u(w.gp, UW)}`, 'theory.soil');
  else if (w.wcase === 'II') rec.add('Water table, Case II (within B below the base)', S`q = γ · Df;  γ̄ = γ' + (d / B)(γ − γ'),  d = Dw − Df`, S`d = ${u(w.d, LM)};  γ' = ${v(input.gammaSat, UW)} − ${v(w.gw, UW)} = ${u(w.gp, UW)};  γ̄ = ${v(w.gp, UW)} + (${v(w.d, LM)} / ${v(wB, LM)})(${v(gamma, UW)} − ${v(w.gp, UW)})`, S`q = ${u(w.q, PR)},  γ̄ = ${u(w.gammaEff, UW)}`, 'theory.soil');
  else rec.add('Water table, Case III (deeper than B below the base)', S`q = γ · Df`, S`d = ${u(w.d, LM)} > B`, S`q = ${u(w.q, PR)}; the water table has no effect`, 'theory.soil');
  const q = w.q, ge = w.gammaEff;
  Object.assign(vals, { q, gammaEff: ge, waterCase: w.wcase, gammaPrime: w.gp, Bp });

  let qu, N;
  if (!general) {
    const T = TH.terzaghi, sh = T.shape[shape];
    N = T.factors(phi);
    rec.add('Terzaghi bearing capacity factors', S`From the table for φ' = ${u(phi, DEG)} (linear interpolation between whole degrees)`, null, S`Nc = ${N.Nc},  Nq = ${N.Nq},  Nγ = ${N.Ng}`, clause, 'General shear failure.');
    qu = sh.sc * c * N.Nc + q * N.Nq + sh.sg * ge * wB * N.Ng;
    rec.add('Ultimate bearing capacity', S`qu = ${sh.sc === 1 ? '' : S`${sh.sc} `}c' Nc + q Nq + ${sh.sg} γ B Nγ  (${shape})`, S`qu = ${sh.sc} · ${v(c, PR)} · ${N.Nc} + ${v(q, PR)} · ${N.Nq} + ${sh.sg} · ${v(ge, UW)} · ${v(wB, LM)} · ${N.Ng}`, S`qu = ${u(qu, PR)}`, clause);
  } else {
    const G = TH.general;
    N = G.factors(phi);
    rec.add('Bearing capacity factors', S`Nq = tan²(45° + φ'/2) e^(π tan φ');  Nc = (Nq − 1) cot φ';  Nγ = 2 (Nq + 1) tan φ'`, S`φ' = ${u(phi, DEG)}`, S`Nc = ${N.Nc},  Nq = ${N.Nq},  Nγ = ${N.Ng}`, clause, phi <= 0 ? 'For φ = 0, Nc = ' + G.NcPhi0 + '.' : '');
    const BL = strip ? 0 : wB / wL;
    const Fx = generalFactors({ phi, Df, B: wB, BL, beta }, N, ed);
    rec.add('Shape factors', S`Fcs = 1 + (B/L)(Nq/Nc);  Fqs = 1 + (B/L) tan φ';  Fγs = 1 − ${G.shapeGamma} (B/L)`, S`B/L = ${BL}`, S`Fcs = ${Fx.Fcs},  Fqs = ${Fx.Fqs},  Fγs = ${Fx.Fgs}`, clause);
    rec.add('Depth factors', phi <= 0 ? S`φ = 0: Fcd = 1 + ${G.depthC0} k;  Fqd = 1;  Fγd = 1` : S`Fqd = 1 + 2 tan φ' (1 − sin φ')² k;  Fcd = Fqd − (1 − Fqd) / (Nc tan φ');  Fγd = 1`,
      S`Df / B = ${Df / wB};  k = ${Fx.depthTerm}`, S`Fcd = ${Fx.Fcd},  Fqd = ${Fx.Fqd},  Fγd = 1`, clause, Fx.deep ? 'Df/B > 1, so k = arctan(Df/B) in radians.' : 'Df/B ≤ 1, so k = Df/B.');
    if (beta > 0) rec.add('Inclination factors', S`Fci = Fqi = (1 − β/90)²;  Fγi = (1 − β/φ')²`, S`β = ${u(beta, DEG)}`, S`Fci = Fqi = ${Fx.Fci},  Fγi = ${Fx.Fgi}`, clause);
    const t1 = c * N.Nc * Fx.Fcs * Fx.Fcd * Fx.Fci, t2 = q * N.Nq * Fx.Fqs * Fx.Fqd * Fx.Fqi, t3 = G.half * ge * wB * N.Ng * Fx.Fgs * Fx.Fgd * Fx.Fgi;
    qu = t1 + t2 + t3;
    rec.add('Ultimate bearing capacity', S`qu = c' Nc Fcs Fcd Fci + q Nq Fqs Fqd Fqi + ${G.half} γ B Nγ Fγs Fγd Fγi`, S`qu = ${v(t1, PR)} + ${v(t2, PR)} + ${v(t3, PR)}`, S`qu = ${u(qu, PR)}`, clause);
    Object.assign(vals, Fx);
  }
  const qall = qu / FS, qnet = (qu - q) / FS;
  const area = strip ? Bp : shape === 'circular' ? Math.PI * B * B / 4 : Bp * Lf, Qall = qall * area;
  const loadQ = strip ? 'lineload' : F;
  rec.add('Allowable bearing capacity', S`qall = qu / FS;  qnet(all) = (qu − q) / FS`, S`qall = ${v(qu, PR)} / ${FS};  qnet(all) = (${v(qu, PR)} − ${v(q, PR)}) / ${FS}`, S`qall = ${u(qall, PR)},  qnet(all) = ${u(qnet, PR)}`, clause);
  rec.add('Allowable gross load', strip ? S`Qall = qall · B  (per unit length of wall)` : shape === 'circular' ? S`Qall = qall · π B² / 4` : S`Qall = qall · ${e > 0 ? "B'" : 'B'} · L`, S`Qall = ${v(qall, PR)} · ${v(area, strip ? LM : 'area_m2')}`, S`Qall = ${u(Qall, loadQ)}`, clause);
  Object.assign(vals, { Nc: N.Nc, Nq: N.Nq, Ng: N.Ng, qu, qall, qnet, Qall, area });
  out.results = [res('qu', qu, PR), res('qall (gross)', qall, PR), res('qall (net)', qnet, PR), res('Allowable gross load', Qall, loadQ), res('Nc', N.Nc), res('Nq', N.Nq), res('Nγ', N.Ng)];
  if (input.Q > 0) {
    const Q = input.Q, fullArea = strip ? B : shape === 'circular' ? Math.PI * B * B / 4 : B * Lf, applied = Q / area;
    if (e > 0) {
      const kern = B / TH.eccentricity.kern, lenL = strip ? 1 : Lf;
      const qmax = e <= kern ? Q / (B * lenL) * (1 + 6 * e / B) : 4 * Q / (3 * lenL * (B - 2 * e)), qmin = e <= kern ? Q / (B * lenL) * (1 - 6 * e / B) : 0;
      rec.add('Contact pressure under the eccentric load', e <= kern ? S`e ≤ B/6: q = Q / (B L) (1 ± 6e / B)` : S`e > B/6: qmax = 4Q / (3 L (B − 2e)),  qmin = 0`, S`e = ${u(e, LM)}, B/6 = ${u(kern, LM)}`, S`qmax = ${u(qmax, PR)},  qmin = ${u(qmin, PR)}`, 'basic.statics');
      Object.assign(vals, { qmax, qmin });
      out.results.push(res('qmax', qmax, PR), res('qmin', qmin, PR));
    }
    rec.add('Applied pressure against the allowable', e > 0 ? S`q = Q / (B' L) on the effective area` : S`q = Q / area`, S`q = ${v(Q, loadQ)} / ${v(e > 0 ? area : fullArea, strip ? LM : 'area_m2')}`, S`q = ${u(applied, PR)};  q / qall = ${dc(applied / qall)}`, clause);
    out.checks.push(check('Bearing', ['applied pressure', applied, PR], ['qall', qall, PR], applied / qall, clause));
    vals.applied = applied;
  } else out.notes.push('No applied load was given, so there is no pass or fail check. Enter a load to compare the applied pressure with the allowable.');
  out.diagram.tables = [{ title: 'NSCP presumptive allowable pressures, for comparison (' + ed.clauses['found.presumptive'].nscp + ')', head: ['Soil or rock', 'Allowable pressure'],
    rows: ed.found.presumptive.map((r) => ({ cells: [r.soil, u(r.q, PR)] })), note: ed.found.presumptiveNote }];
  Object.assign(out.diagram, { wcase: w.wcase, qu });
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}
