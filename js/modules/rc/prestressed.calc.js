// Prestressed concrete beams (NSCP 2015 Secs. 409.6, 420.3, 421.2, 422.5.8, 424): service stresses, flexural strength
// and shear by the approximate method. Pure calculation.
// Units: mm, mm², mm⁴, MPa, kN, kN·m, kN/m, kN/m³; span in m. Signs: compression negative, tension positive;
// eccentricity positive below the centroid.
import { S, v, u, si, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { sqrtFc } from './shear-torsion.calc.js';
import { fmt } from '../../core/format.js';

const L = 'length_mm', LM = 'length_m', A = 'area', I = 'inertia', ST = 'stress', F = 'force', M = 'moment', W = 'lineload', APM = 'area_per_mm';

// Rectangle about its centroid: ∫ y² dA. Midspan moment of a simple span under a uniform load: w L² / 8.
const rectI = (b, h) => 2 * b * Math.pow(h / 2, 3) / 3;
const midMoment = (w, span) => w * span * span / (2 * 4);
const clause = (ed, key) => (ed.clauses[key] ? ed.clauses[key].nscp : '');

// Fibre stresses (MPa) for a force P (kN) at eccentricity e (mm) and a moment M (kN·m).
export function fibres(sec, P, e, Mk) {
  const Pn = P * 1e3, Mn = Mk * 1e6;
  return { top: -Pn / sec.A + Pn * e * sec.yt / sec.I - Mn * sec.yt / sec.I, bot: -Pn / sec.A - Pn * e * sec.yb / sec.I + Mn * sec.yb / sec.I };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const mode = input.mode === 'flexure' || input.mode === 'shear' ? input.mode : 'stresses';
  return mode === 'flexure' ? flexure(input, ctx.edition) : mode === 'shear' ? shear(input, ctx.edition) : stresses(input, ctx.edition);
}

const lambdaOf = (input) => (input.lambda > 0 ? input.lambda : 1);

// ---------------------------------------------------------------- stresses (424.5)
function stresses(input, ed) {
  const PS = ed.concrete.prestress, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const custom = input.section === 'custom';
  if (custom ? !positive(input, ['A', 'I', 'yt', 'yb', 'h']) : !positive(input, ['b', 'h'])) return stop(custom ? 'A, I, yt, yb and h need numbers above zero.' : 'b and h need numbers above zero.');
  const sec = custom ? { A: input.A, I: input.I, yt: input.yt, yb: input.yb, h: input.h } : { A: input.b * input.h, I: rectI(input.b, input.h), yt: input.h / 2, yb: input.h / 2, h: input.h };
  if (!positive(input, ['span', 'fci', 'fc'])) return stop("The span, f'ci and f'c need numbers above zero.");
  const steel = input.force !== 'direct';
  let Pi, Pe;
  if (steel) {
    if (!positive(input, ['Aps', 'fpi']) || !(input.losses >= 0 && input.losses < 100)) return stop('Aps and fpi need numbers above zero, and the losses a percentage from 0 to below 100.');
    Pi = input.Aps * input.fpi / 1e3; Pe = Pi * (1 - input.losses / 100);
  } else {
    if (!positive(input, ['Pi', 'Pe'])) return stop('Pi and Pe need numbers above zero.');
    Pi = input.Pi; Pe = input.Pe;
  }
  const eMid = Number.isFinite(input.eMid) ? input.eMid : 0, eEnd = Number.isFinite(input.eEnd) ? input.eEnd : eMid;
  const span = input.span, gammaC = input.gammaC > 0 ? input.gammaC : 0, wD = input.wD > 0 ? input.wD : 0, wL = input.wL > 0 ? input.wL : 0;
  const sL = input.sustainedL > 0 ? Math.min(input.sustainedL, 1) : 0, fci = input.fci, fc = input.fc;
  if (Math.abs(eMid) >= Math.max(sec.yt, sec.yb) || Math.abs(eEnd) >= Math.max(sec.yt, sec.yb)) return stop('The eccentricity places the tendon outside the section.');
  rec.add('Section properties', custom ? S`custom section` : S`A = b h;  I = b h³ / 12;  yt = yb = h / 2`,
    custom ? null : S`A = ${v(input.b, L)} · ${v(input.h, L)};  I = ${v(input.b, L)} · ${v(input.h, L)}³ / 12`, S`A = ${u(sec.A, A)};  I = ${u(sec.I, I)};  yt = ${u(sec.yt, L)}, yb = ${u(sec.yb, L)}`, 'theory.prestress');
  if (steel) rec.add('Prestress forces', S`Pi = Aps fpi;  Pe = Pi (1 − losses)`, S`Pi = ${v(input.Aps, A)} · ${v(input.fpi, ST)};  Pe = ${v(Pi, F)} · (1 − ${input.losses} / 100)`, S`Pi = ${u(Pi, F)};  Pe = ${u(Pe, F)}`, 'ps.losses');
  else rec.add('Prestress forces', S`given directly`, null, S`Pi = ${u(Pi, F)};  Pe = ${u(Pe, F)}`, 'ps.losses');
  const wSelf = gammaC * sec.A / 1e6, Mself = midMoment(wSelf, span), Msus = midMoment(wSelf + wD + sL * wL, span), Mtot = midMoment(wSelf + wD + wL, span);
  rec.add('Midspan moments', S`wself = γc A;  M = w L² / 8 for self weight, sustained (wself + wD + ${sL} wL) and total (wself + wD + wL) loads`,
    S`wself = ${v(gammaC, 'unitweight')} · ${v(sec.A, A)} × 10⁻⁶ = ${u(wSelf, W)};  L = ${v(span, LM)}`, S`Mself = ${u(Mself, M)};  Msus = ${u(Msus, M)};  Mtot = ${u(Mtot, M)}`, 'theory.prestress',
    gammaC ? '' : 'γc = 0: the self weight is inside wD.');
  const tm = fibres(sec, Pi, eMid, Mself), te = fibres(sec, Pi, eEnd, 0), su = fibres(sec, Pe, eMid, Msus), sm = fibres(sec, Pe, eMid, Mtot), se = fibres(sec, Pe, eEnd, 0);
  const fl = 'top = −P / A + P e yt / I − M yt / I;  bottom = −P / A − P e yb / I + M yb / I';
  rec.add('Stresses at transfer', S`${fl}  (Pi; midspan with Mself, ends with M = 0)`, S`midspan: P = ${v(Pi, F)}, e = ${v(eMid, L)}, M = ${v(Mself, M)};  ends: e = ${v(eEnd, L)}`,
    S`midspan: top ${u(tm.top, ST)}, bottom ${u(tm.bot, ST)};  ends: top ${u(te.top, ST)}, bottom ${u(te.bot, ST)}`, 'theory.prestress');
  rec.add('Stresses under sustained load', S`Pe with Msus at midspan`, S`P = ${v(Pe, F)}, M = ${v(Msus, M)}`, S`top ${u(su.top, ST)}, bottom ${u(su.bot, ST)}`, 'theory.prestress');
  rec.add('Stresses under total service load', S`Pe with Mtot at midspan, M = 0 at the ends`, S`P = ${v(Pe, F)}, M = ${v(Mtot, M)}`,
    S`midspan: top ${u(sm.top, ST)}, bottom ${u(sm.bot, ST)};  ends: top ${u(se.top, ST)}, bottom ${u(se.bot, ST)}`, 'theory.prestress');
  // Limits.
  const T = PS.transfer, SV = PS.service, CL = PS.classes, base = SV.base === 'fci' ? fci : fc;
  const lim = { compTransferMid: T.compMid * fci, compTransferEnd: T.compEnd * fci, tenTransferMid: T.tensMid * Math.sqrt(fci), tenTransferEnd: T.tensEnd * Math.sqrt(fci),
    compSustained: SV.sustained * base, compTotal: SV.total * base, classU: CL.U * Math.sqrt(fc), classT: CL.T * Math.sqrt(fc) };
  rec.add('Permissible stresses', S`transfer: compression ${T.compMid} f'ci (midspan), ${T.compEnd} f'ci (ends);  tension ${T.tensMid} √f'ci (midspan), ${T.tensEnd} √f'ci (ends)`,
    S`service: compression ${SV.sustained} f'c (sustained), ${SV.total} f'c (total);  class limits ${CL.U} √f'c (U), ${CL.T} √f'c (T)`,
    S`${u(lim.compTransferMid, ST)}, ${u(lim.compTransferEnd, ST)};  ${u(lim.tenTransferMid, ST)}, ${u(lim.tenTransferEnd, ST)};  ${u(lim.compSustained, ST)}, ${u(lim.compTotal, ST)};  U ${u(lim.classU, ST)}, T ${u(lim.classT, ST)}`, 'ps.transferComp');
  const comp = (f) => (f.top <= f.bot ? ['top', -f.top] : ['bottom', -f.bot]), tens = (f) => (f.top >= f.bot ? ['top', f.top] : ['bottom', f.bot]);
  const add = (name, pick, f, limit, key) => { const [fib, val] = pick(f), dem = Math.max(val, 0); out.checks.push(check(name + ' (' + fib + ' fibre)', [fib === 'top' ? 'f top' : 'f bottom', dem, ST], ['limit', limit, ST], dem / limit, key)); };
  add('Transfer compression, midspan', comp, tm, lim.compTransferMid, 'ps.transferComp');
  add('Transfer compression, ends', comp, te, lim.compTransferEnd, 'ps.transferComp');
  add('Transfer tension, midspan', tens, tm, lim.tenTransferMid, 'ps.transferTens');
  add('Transfer tension, ends', tens, te, lim.tenTransferEnd, 'ps.transferTens');
  add('Sustained compression, midspan', comp, su, lim.compSustained, 'ps.serviceComp');
  add('Total service compression, midspan', comp, sm, lim.compTotal, 'ps.serviceComp');
  add('Total service compression, ends', comp, se, lim.compTotal, 'ps.serviceComp');
  const ft = sm.bot, cls = ft <= lim.classU ? 'U' : ft <= lim.classT ? 'T' : 'C';
  rec.add('Class of the member', S`ft at the precompressed tensile fibre (bottom, midspan): U if ft ≤ ${CL.U} √f'c, T if ft ≤ ${CL.T} √f'c, C above`, S`ft = ${u(ft, ST)}`, S`Class ${cls}`, 'ps.class');
  out.notes.push('Tension limits at transfer may be exceeded where bonded reinforcement resists the tensile force (' + clause(ed, 'ps.transferTens') + ').');
  if (SV.base !== 'fci') out.notes.push("NSCP 2015 prints f'ci in " + clause(ed, 'ps.serviceComp') + "; f'c is used, as in ACI 318-14.");
  if (cls === 'T') out.notes.push('Class T: deflections are computed with the cracked transformed section (bilinear) and the crack control of the code applies to the non-prestressed reinforcement.');
  if (cls === 'C') out.warnings.push('Class C: the cracked-section stress check and crack control of ' + clause(ed, 'ps.class') + ' (Δfps limit) are needed and are not built here.');
  if (steel) {
    const J = PS.jacking, fpu = input.fpu > 0 ? input.fpu : null, fpy = input.fpy > 0 ? input.fpy : fpu ? PS.fpyRatio['strand-lr'] * fpu : null;
    if (fpu) out.notes.push('Jacking stress limit min(' + J.fpy + ' fpy, ' + J.fpu + ' fpu) = ' + fmt(Math.min(J.fpy * fpy, J.fpu * fpu)) + ' MPa; post-tensioned anchorages immediately after transfer ' + J.anchor + ' fpu = ' + fmt(J.anchor * fpu) + ' MPa (' + clause(ed, 'ps.jacking') + '). fpi is the stress after transfer, so it is not compared here.');
  }
  Object.assign(vals, { A: sec.A, I: sec.I, Pi, Pe, wSelf, Mself, Msus, Mtot,
    transfer: { topMid: tm.top, botMid: tm.bot, topEnd: te.top, botEnd: te.bot }, sustained: { topMid: su.top, botMid: su.bot },
    service: { topMid: sm.top, botMid: sm.bot, topEnd: se.top, botEnd: se.bot }, cls, lim });
  out.results = [res('Pi', Pi, F), res('Pe', Pe, F), res('Mtot (midspan)', Mtot, M), res('Service ft (bottom, midspan)', ft, ST), res('Class', cls, 'text')];
  out.diagram = { mode: 'stresses', h: sec.h, b: custom ? null : input.b, yt: sec.yt, yb: sec.yb, eMid, eEnd, span, Aps: steel ? input.Aps : null,
    blocks: [{ name: 'Transfer, midspan', f: tm, c: lim.compTransferMid, t: lim.tenTransferMid }, { name: 'Transfer, ends', f: te, c: lim.compTransferEnd, t: lim.tenTransferEnd },
      { name: 'Service, midspan', f: sm, c: lim.compTotal, t: lim.classT }, { name: 'Service, ends', f: se, c: lim.compTotal, t: lim.classT }],
    Pi, Pe, sec, Mself, Mtot, chips: [S`Pi = ${u(Pi, F)}`, S`Pe = ${u(Pe, F)}`, ['Class ' + cls]] };
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}

// ---------------------------------------------------------------- flexural strength (420.3.2, 421.2, 409.6.2)
function flexure(input, ed) {
  const C = ed.concrete, PS = C.prestress, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  if (!positive(input, ['b', 'h', 'dp', 'Aps', 'fpu', 'fpy', 'fse', 'fc'])) return stop("b, h, dp, Aps, fpu, fpy, fse and f'c need numbers above zero.");
  const { b, h, dp, Aps, fpu, fpy, fse, fc } = input, bonded = input.bond !== 'unbonded', lambda = lambdaOf(input);
  const As = input.As > 0 ? input.As : 0, fy = input.fy > 0 ? input.fy : 0, d = input.d > 0 ? input.d : dp;
  if (As > 0 && !(fy > 0)) return stop('fy is needed with the non-prestressed reinforcement As.');
  if (!(dp < h) || !(d < h)) return stop('dp and d must be smaller than h.');
  out.diagram = { mode: 'flexure', b, h, dp, d, As, Aps, bonded };
  rec.add('Effective prestress', S`fse ≥ ${PS.bonded.fseMin} fpu for the approximate fps`, S`${v(fse, ST)} against ${PS.bonded.fseMin} · ${v(fpu, ST)} = ${u(PS.bonded.fseMin * fpu, ST)}`, null, bonded ? 'ps.fpsBonded' : 'ps.fpsUnbonded',
    'NSCP 2015 prints this condition with fps; fse is used, as in ACI 318-14.');
  if (fse < PS.bonded.fseMin * fpu) return stop('fse is below ' + PS.bonded.fseMin + ' fpu: strain compatibility needed (not built).');
  const beta1 = C.beta1(fc), rhoP = Aps / (b * dp), fpyRatio = fpy / fpu;
  let fps, gammaP = null, fpsFormula = null, lnh = null;
  if (bonded) {
    const row = PS.gammaP.find((r) => fpyRatio >= r.min);
    if (!row) return stop('fpy/fpu is below ' + PS.gammaP[PS.gammaP.length - 1].min + ': γp is not tabulated.');
    gammaP = row.value;
    const rho = As > 0 ? As / (b * d) : 0;
    fps = fpu * (1 - gammaP / beta1 * (rhoP * fpu / fc + (d / dp) * (fy / fc) * rho));
    rec.add('Stress in the bonded tendons', S`fps = fpu {1 − γp / β1 [ρp fpu / f'c + (d / dp)(fy / f'c) ρ]};  γp from fpy / fpu = ${fpyRatio}`,
      S`γp = ${gammaP};  β1 = ${beta1};  ρp = ${v(Aps, A)} / (${v(b, L)} · ${v(dp, L)}) = ${rhoP};  ρ = ${rho}`, S`fps = ${u(fps, ST)}`, 'ps.fpsBonded',
      'Compression reinforcement is not modelled.');
  } else {
    const U = PS.unbonded;
    if (!(input.span > 0)) return stop('The span is needed for unbonded tendons (ln / h).');
    lnh = input.span * 1e3 / h;
    const short = lnh <= U.lnh, div = short ? U.div[0] : U.div[1], cap = short ? U.cap[0] : U.cap[1];
    fpsFormula = fse + U.add + fc / (div * rhoP);
    fps = Math.min(fpsFormula, fpy, fse + cap);
    rec.add('Stress in the unbonded tendons', S`ln / h ${short ? '≤' : '>'} ${U.lnh}: fps = min(fse + ${U.add} + f'c / (${div} ρp), fpy, fse + ${cap})`,
      S`ln / h = ${v(input.span, LM)} / ${v(h, L)} = ${lnh};  ρp = ${rhoP};  fse + ${U.add} + ${v(fc, ST)} / (${div} · ${rhoP}) = ${u(fpsFormula, ST)}`, S`fps = ${u(fps, ST)}`, 'ps.fpsUnbonded');
  }
  const a = (Aps * fps + As * fy) / (C.sb * fc * b), c = a / beta1, epsT = C.ecu * (dp - c) / c;
  const phi = C.phi.flexAxial(epsT, PS.etyPS * C.Es), Mn = (Aps * fps * (dp - a / 2) + As * fy * (d - a / 2)) / 1e6, phiMn = phi * Mn;
  rec.add('Depth of the stress block', S`a = (Aps fps + As fy) / (${C.sb} f'c b);  c = a / β1`, S`a = (${v(Aps, A)} · ${v(fps, ST)} + ${v(As, A)} · ${v(fy, ST)}) / (${C.sb} · ${v(fc, ST)} · ${v(b, L)}) = ${u(a, L)}`, S`c = ${u(c, L)}`, 'ps.fpsBonded');
  rec.add('Strain and strength reduction factor', S`εt = ${C.ecu} (dp − c) / c;  φ from εt with εty = ${PS.etyPS}`, S`εt = ${C.ecu} · (${v(dp, L)} − ${v(c, L)}) / ${v(c, L)} = ${epsT}`, S`φ = ${phi}`, 'ps.phi');
  rec.add('Nominal flexural strength', S`Mn = Aps fps (dp − a / 2) + As fy (d − a / 2)`, S`Mn = ${v(Aps, A)} · ${v(fps, ST)} · (${v(dp, L)} − ${v(a, L)} / 2) + ${v(As, A)} · ${v(fy, ST)} · (${v(d, L)} − ${v(a, L)} / 2)`,
    S`Mn = ${u(Mn, M)};  φMn = ${phi} · ${v(Mn, M)} = ${u(phiMn, M)}`, 'ps.phi');
  // Minimum flexural strength or reinforcement.
  const Ag = b * h, Ig = rectI(b, h), yb = h / 2, e = dp - h / 2, Pe = Aps * fse;
  const fr = C.fr(fc, lambda), fpe = Pe / Ag + Pe * e * yb / Ig, Mcr = (fr + fpe) * Ig / yb / 1e6, Mcr12 = PS.minFlex * Mcr, AsMin = PS.minUnbonded * b * h / 2;
  if (bonded) {
    rec.add('Cracking moment', S`fr = ${C.frCoef} λ √f'c;  fpe = Pe / A + Pe e yb / I, Pe = Aps fse, e = dp − h / 2;  Mcr = (fr + fpe) I / yb`,
      S`fr = ${u(fr, ST)};  fpe = ${u(fpe, ST)}`, S`Mcr = ${u(Mcr, M)};  ${PS.minFlex} Mcr = ${u(Mcr12, M)}`, 'ps.Mcr');
    out.checks.push(check('Minimum flexural strength, φMn ≥ ' + PS.minFlex + ' Mcr', [PS.minFlex + 'Mcr', Mcr12, M], ['φMn', phiMn, M], Mcr12 / phiMn, 'ps.minFlex'));
    out.notes.push('The ' + PS.minFlex + ' Mcr requirement is waived for flexural members with shear and flexural strength at least twice that required (' + clause(ed, 'ps.minFlexWaiver') + ').');
  } else {
    rec.add('Minimum bonded reinforcement (unbonded tendons)', S`As,min = ${PS.minUnbonded} Act;  Act = b h / 2`, S`As,min = ${PS.minUnbonded} · ${v(b, L)} · ${v(h, L)} / 2`, S`As,min = ${u(AsMin, A)}`, 'ps.minUnbonded');
    out.checks.push(check('Minimum bonded reinforcement', ['As,min', AsMin, A], ['As', As, A], As > 0 ? AsMin / As : Infinity, 'ps.minUnbonded'));
  }
  const hasMu = Number.isFinite(input.Mu) && input.Mu > 0;
  if (hasMu) out.checks.unshift(check('Flexural strength', ['Mu', input.Mu, M], ['φMn', phiMn, M], input.Mu / phiMn, 'ps.phi'));
  else out.notes.push('No Mu given: the strength is reported without an adequacy verdict.');
  Object.assign(vals, { fpyRatio, gammaP, beta1, rhoP, lnh, fpsFormula, fps, a, c, epsT, phi, Mn, phiMn, fr, fpe, Mcr, Mcr12, AsMin });
  out.results = [res('fps', fps, ST), res('a', a, L), res('εt', epsT, 'strain'), res('φ', phi), res('Mn', Mn, M), res('φMn', phiMn, M)].concat(bonded ? [res('1.2 Mcr', Mcr12, M)] : [res('As,min', AsMin, A)]);
  Object.assign(out.diagram, { a, c, fps, phiMn, epsT, chips: [S`fps = ${u(fps, ST)}`, S`φMn = ${u(phiMn, M)}`] });
  out.steps = rec.steps;
  out.verdict = hasMu ? verdictOf(out.checks) : null;
  return { vals, result: out };
}

// ---------------------------------------------------------------- shear, approximate method (422.5.8.2)
function shear(input, ed) {
  const C = ed.concrete, PS = C.prestress, H = PS.shear, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  if (!positive(input, ['bw', 'h', 'dp', 'Aps', 'fpu', 'fse', 'fc', 'Vu', 'Mu', 'fyt'])) return stop("bw, h, dp, Aps, fpu, fse, f'c, Vu, Mu (at the same section) and fyt need numbers above zero.");
  const { bw, h, dp, Aps, fpu, fse, fc, Vu, Mu, fyt } = input, lambda = lambdaOf(input), As = input.As > 0 ? input.As : 0, fy = input.fy > 0 ? input.fy : 0;
  if (As > 0 && !(fy > 0)) return stop('fy is needed with the non-prestressed reinforcement As.');
  if (!(dp < h)) return stop('dp must be smaller than h.');
  const d = Math.max(dp, H.dMin * h), rf = sqrtFc(fc, ed), phiV = C.phi.shear;
  rec.add('Effective depth for shear', S`d = max(dp, ${H.dMin} h)`, S`d = max(${v(dp, L)}, ${H.dMin} · ${v(h, L)})`, S`d = ${u(d, L)}`, 'ps.shearD');
  if (Math.sqrt(fc) > C.shear.sqrtFcMax) out.notes.push('√f\'c is limited to ' + C.shear.sqrtFcMax + ' MPa (' + clause(ed, 'shear.sqrtFcCap') + ').');
  const approxOk = Aps * fse >= H.apply * (Aps * fpu + As * fy);
  rec.add('Condition for the approximate method', S`Aps fse ≥ ${H.apply} (Aps fpu + As fy)`, S`${v(Aps * fse / 1e3, F)} against ${H.apply} · ${v((Aps * fpu + As * fy) / 1e3, F)}`, [approxOk ? 'Satisfied.' : 'Not satisfied.'], 'ps.Vc');
  let Vc, VuDpMu = null, VcA = null, VcB = null, VcC = null, VcMin = null;
  if (approxOk) {
    VuDpMu = Math.min(Vu * dp / (Mu * 1e3), H.ratioMax);
    VcA = (H.a * lambda * rf + H.b * VuDpMu) * bw * d / 1e3; VcB = (H.a * lambda * rf + H.b) * bw * d / 1e3; VcC = H.c * lambda * rf * bw * d / 1e3; VcMin = H.min * lambda * rf * bw * d / 1e3;
    Vc = Math.max(Math.min(VcA, VcB, VcC), VcMin);
    rec.add('Concrete shear strength', S`Vc = max[min((${H.a} λ √f'c + ${H.b} Vu dp / Mu) bw d, (${H.a} λ √f'c + ${H.b}) bw d, ${H.c} λ √f'c bw d), ${H.min} λ √f'c bw d];  Vu dp / Mu ≤ ${H.ratioMax}`,
      S`Vu dp / Mu = ${v(Vu, F)} · ${v(dp, L)} / (${v(Mu, M)} × 10³) → ${VuDpMu};  (a) ${v(VcA, F)}, (b) ${v(VcB, F)}, (c) ${v(VcC, F)}, minimum ${v(VcMin, F)}`, S`Vc = ${u(Vc, F)}`, 'ps.Vc');
  } else {
    Vc = C.shear.vc * lambda * rf * bw * d / 1e3;
    rec.add('Concrete shear strength', S`approximate method not permitted: Vc = ${C.shear.vc} λ √f'c bw d (non-prestressed)`, S`Vc = ${C.shear.vc} · ${lambda} · ${si(rf, ST)} · ${v(bw, L)} · ${v(d, L)}`, S`Vc = ${u(Vc, F)}`, 'shear.Vc');
    out.notes.push('Aps fse < ' + H.apply + ' (Aps fpu + As fy): the non-prestressed Vc is used.');
  }
  out.notes.push('The detailed method with Vci and Vcw is not covered.');
  const phiVc = phiV * Vc, VsReq = Math.max(Vu / phiV - Vc, 0), VsMax = C.shear.vsMax * rf * bw * d / 1e3;
  rec.add('Required shear reinforcement', S`Vs = Vu / φ − Vc ≥ 0;  φ = ${phiV}`, S`Vs = ${v(Vu, F)} / ${phiV} − ${v(Vc, F)}`, S`φVc = ${u(phiVc, F)};  Vs required = ${u(VsReq, F)}`, 'shear.Vs');
  if (VsReq > VsMax) return stop('The section is too small: the required Vs exceeds ' + C.shear.vsMax + ' √f\'c bw d = ' + fmt(VsMax) + ' kN (' + clause(ed, 'shear.sectionLimit') + ').');
  const AV = PS.avMin, AvsMin = Math.min(Math.max(AV.a * rf * bw / fyt, AV.b * bw / fyt), Aps * fpu / (AV.c * fyt * d) * Math.sqrt(d / bw));
  const need = Vu > C.shear.minAbove * phiVc;
  rec.add('Minimum shear reinforcement', S`Av,min / s = min[max(${AV.a} √f'c bw / fyt, ${AV.b} bw / fyt), Aps fpu / (${AV.c} fyt d) √(d / bw)]`,
    S`max(${v(AV.a * rf * bw / fyt, APM)}, ${v(AV.b * bw / fyt, APM)});  ${v(Aps * fpu / (AV.c * fyt * d) * Math.sqrt(d / bw), APM)}`, S`Av,min / s = ${u(AvsMin, APM)}`, 'ps.Avmin',
    need ? 'Vu > ' + C.shear.minAbove + ' φVc: minimum shear reinforcement is required.' : 'Vu ≤ ' + C.shear.minAbove + ' φVc: minimum shear reinforcement is not required by this rule.');
  const SP = PS.spacing, low = VsReq * 1e3 <= SP.Vs * rf * bw * d, row = low ? SP.low : SP.high, smax = Math.min(row.h * h, row.max);
  rec.add('Maximum stirrup spacing', S`Vs ≤ ${SP.Vs} √f'c bw d: s ≤ min(${SP.low.h} h, ${SP.low.max} mm);  otherwise min(${SP.high.h} h, ${SP.high.max} mm)`, S`${SP.Vs} √f'c bw d = ${u(SP.Vs * rf * bw * d / 1e3, F)}`, S`smax = ${u(smax, L)}`, 'ps.spacing');
  const AvsReq = Math.max(VsReq * 1e3 / (fyt * d), need ? AvsMin : 0);
  Object.assign(vals, { d, approxOk, VuDpMu, VcA, VcB, VcC, VcMin, Vc, phiVc, VsReq, AvsMin, smax, AvsReq });
  out.results = [res('d', d, L), res('Vc', Vc, F), res('φVc', phiVc, F), res('Vs required', VsReq, F), res('Av/s required', AvsReq, APM), res('Av,min / s', AvsMin, APM), res('smax', smax, L)];
  out.notes.push('Design calculation: choose stirrups with Av / s ≥ ' + fmt(AvsReq) + ' mm²/mm at a spacing ≤ ' + fmt(smax) + ' mm.');
  out.diagram = { mode: 'shear', b: bw, h, dp, Aps, d, chips: [S`φVc = ${u(phiVc, F)}`, S`Vs = ${u(VsReq, F)}`, S`smax = ${u(smax, L)}`] };
  out.steps = rec.steps; out.verdict = null;
  return { vals, result: out };
}
