// Deflection of rectangular RC members and bar spacing for crack control. Pure calculation.
// Units: mm, mm², MPa, kN/m, kN, kN·m.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { materialWarnings } from './common.js';

const L = 'length_mm', A = 'area', ST = 'stress', M = 'moment', I = 'inertia';

// Cracked transformed section with n not rounded and compression steel transformed as (n − 1) A's.
export function crackedSectionService(p) {
  const nAs = p.n * p.As, m = p.Asp > 0 ? (p.n - 1) * p.Asp : 0, dp = p.dp || 0;
  const qb = nAs + m, qc = nAs * p.d + m * dp;
  const kd = (-qb + Math.sqrt(qb * qb + 2 * p.b * qc)) / p.b;
  return { kd, Icr: p.b * Math.pow(kd, 3) / 3 + m * Math.pow(kd - dp, 2) + nAs * Math.pow(p.d - kd, 2) };
}
// Effective moment of inertia.
export function effectiveI(Ma, Mcr, Ig, Icr) {
  if (Ma <= Mcr) return Ig;
  const r = Math.pow(Mcr / Ma, 3);
  return Math.min(r * Ig + (1 - r) * Icr, Ig);
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };

  if (input.mode === 'spacing') {
    const K = C.crack;
    if (!positive(input, ['fy', 'cc'])) return stop('Give fy and the clear cover cc.');
    const fs = input.fsFrom === 'typed' ? input.fs : K.fsFactor * input.fy;
    if (!(fs > 0)) return stop('Give the service steel stress fs.');
    if (input.fsFrom !== 'typed') rec.add('Steel stress at service loads', S`fs = (2/3) fy`, S`fs = (2/3) · ${v(input.fy, ST)}`, S`fs = ${u(fs, ST)}`, 'crack.fs');
    const a = K.a * (K.ref / fs) - K.b * input.cc, b = K.c * (K.ref / fs), sMax = Math.min(a, b);
    rec.add('Maximum bar spacing', S`s = lesser of ${K.a} (${K.ref} / fs) − ${K.b} cc and ${K.c} (${K.ref} / fs)`, S`lesser of ${K.a} (${K.ref} / ${si(fs, ST)}) − ${K.b} · ${si(input.cc, L)} = ${u(a, L)} and ${K.c} (${K.ref} / ${si(fs, ST)}) = ${u(b, L)}`, S`s,max = ${u(sMax, L)}`, 'crack.spacing',
      'fs is in MPa and cc in mm in this formula. cc is the least distance from the surface of the bar to the tension face.');
    Object.assign(vals, { fs, sA: a, sB: b, sMax });
    if (input.sProv > 0) out.checks.push(check('Bar spacing', ['s provided', input.sProv, L], ['s,max', sMax, L], input.sProv / sMax, 'crack.spacing'));
    else out.notes.push('Enter the spacing provided to check it.');
    out.results = [res('fs', fs, ST), res('s,max', sMax, L)];
    out.diagram = { kind: 'spacing', cc: input.cc, sMax, s: input.sProv, chips: [S`fs = ${u(fs, ST)}`, S`cc = ${u(input.cc, L)}`] };
    return done();
  }

  const S0 = C.service, T = ed.theory.rcDeflection;
  if (!positive(input, ['b', 'h', 'd', 'As', 'fc', 'lambda', 'span'])) return stop('The section, steel area, strength and span need positive numbers.');
  const { b, h, d, As, fc, lambda, span } = input;
  if (d >= h) return stop('Effective depth d must be less than the total depth h.');
  const Asp = input.Asp > 0 ? input.Asp : 0, dp = Asp > 0 ? input.dp : 0;
  if (Asp > 0 && !(dp > 0 && dp < d)) return stop("Give the depth d' of the compression steel.");
  out.warnings.push(...materialWarnings(fc, null, ed));
  const Ec = C.Ec(fc), n = C.Es / Ec, Ig = b * h * h * h / 12, fr = C.fr(fc, lambda), Mcr = fr * Ig / (h / 2) / 1e6;
  rec.add('Modulus of elasticity and modular ratio', S`Ec = ${C.EcCoef} √f'c;  n = Es / Ec (not rounded)`, S`Ec = ${u(Ec, ST)}`, S`n = ${n}`, 'mat.Ec');
  rec.add('Gross section and cracking moment', S`Ig = b h³ / 12;  fr = ${C.frCoef} λ √f'c;  Mcr = fr Ig / yt,  yt = h / 2`, S`Ig = ${u(Ig, I)};  fr = ${C.frCoef} · ${lambda} · √(${si(fc, ST)}) = ${u(fr, ST)}`, S`Mcr = ${u(Mcr, M)}`, 'serv.Mcr');
  const cs = crackedSectionService({ b, d, As, Asp, dp, n });
  rec.add('Cracked transformed section', Asp > 0 ? S`b kd² / 2 + (n − 1) A's (kd − d') = n As (d − kd);  Icr = b kd³ / 3 + (n − 1) A's (kd − d')² + n As (d − kd)²` : S`b kd² / 2 = n As (d − kd);  Icr = b kd³ / 3 + n As (d − kd)²`,
    S`kd = ${u(cs.kd, L)}`, S`Icr = ${u(cs.Icr, I)}`, 'serv.Ie');
  const kase = T[input.loadCase];
  let K, MaD, MaDL;
  const Lm = span / 1000;
  if (kase) {
    K = kase.K;
    const wD = kase.point ? input.PD : input.wD, wL = kase.point ? input.PL : input.wL;
    if (!(wD >= 0) || !(wL >= 0) || !(wD > 0)) return stop('Give the service dead load and live load.');
    MaD = kase.ma(wD, Lm); MaDL = kase.ma(wD + wL, Lm);
    rec.add('Service moments', S`Ma = ${kase.Ma}  (${kase.label.toLowerCase()})`, S`dead: Ma = ${u(MaD, M)};  dead + live: Ma = ${u(MaDL, M)}`, S`K = ${K}`, 'theory.plain', 'K is the theory coefficient of the deflection formula for this case.');
  } else {
    if (!positive(input, ['Kt', 'MaD', 'MaDL'])) return stop('Give K and the service moments for dead load and for dead plus live load.');
    K = input.Kt; MaD = input.MaD; MaDL = input.MaDL;
    rec.add('Service moments (typed)', S`K and Ma typed`, null, S`K = ${K};  Ma (dead) = ${u(MaD, M)};  Ma (dead + live) = ${u(MaDL, M)}`, 'theory.plain');
  }
  if (MaDL < MaD) return stop('The moment under dead plus live load cannot be less than under dead load.');
  const IeD = effectiveI(MaD, Mcr, Ig, cs.Icr), IeDL = effectiveI(MaDL, Mcr, Ig, cs.Icr);
  rec.add('Effective moment of inertia', S`Ie = (Mcr / Ma)³ Ig + [1 − (Mcr / Ma)³] Icr ≤ Ig;  Ie = Ig when Ma ≤ Mcr`, S`dead: Ma = ${u(MaD, M)} → Ie = ${u(IeD, I)};  dead + live: Ma = ${u(MaDL, M)}`, S`Ie = ${u(IeDL, I)}`, 'serv.Ie');
  const defl = (Ma, Ie) => K * 5 * Ma * 1e6 * span * span / (48 * Ec * Ie);
  const dD = defl(MaD, IeD), dDL = defl(MaDL, IeDL), dL = dDL - dD;
  rec.add('Immediate deflections', S`Δ = K · 5 Ma L² / (48 Ec Ie);  Δ(L) = Δ(D + L) − Δ(D)`, S`Δ(D) = ${u(dD, L)},  Δ(D + L) = ${u(dDL, L)}`, S`Δ(L) = ${u(dL, L)}`, 'theory.plain');
  const xi = (S0.xi.find((x) => x.value === input.duration) || S0.xi[S0.xi.length - 1]).xi;
  const rhoP = Asp / (b * d), lam = xi / (1 + S0.rhoP * rhoP), psi = input.psi >= 0 ? input.psi : 0;
  rec.add('Long-term multiplier', S`λΔ = ξ / (1 + ${S0.rhoP} ρ'),  ρ' = A's / (b d)`, S`ξ = ${xi},  ρ' = ${rhoP}`, S`λΔ = ${lam}`, 'serv.lambda', 'ξ from ' + ed.clauses['serv.xi'].nscp + '. ρ\' is taken at midspan, or at the support for a cantilever.');
  const lt = lam * (dD + psi * dL), after = lt + dL;
  rec.add('Long-term and after-attachment deflections', S`long-term = λΔ [Δ(D) + ψ Δ(L)];  after attachment = long-term + Δ(L)`, S`long-term = ${lam} [${v(dD, L)} + ${psi} · ${v(dL, L)}] = ${u(lt, L)}`, S`after attachment = ${u(after, L)}`, 'serv.limits');
  const im = S0.immediate.find((x) => x.value === input.member) || S0.immediate[1], at = S0.attached.find((x) => x.value === input.elements) || S0.attached[1];
  const limI = span / im.ratio, limA = span / at.ratio;
  rec.add('Deflection limits', S`immediate live load: L / ${im.ratio};  after attachment: L / ${at.ratio}`, S`L / ${im.ratio} = ${u(limI, L)};  L / ${at.ratio} = ${u(limA, L)}`, S`Δ(L) / limit = ${dc(dL / limI)};  after attachment / limit = ${dc(after / limA)}`, 'serv.limits');
  out.checks.push(check('Immediate live load deflection', ['Δ(L)', dL, L], ['L/' + im.ratio, limI, L], dL / limI, 'serv.limits'));
  out.checks.push(check('Deflection after attachment', ['Δ', after, L], ['L/' + at.ratio, limA, L], after / limA, 'serv.limits'));
  out.notes.push(S0.continuousNote);
  Object.assign(vals, { Ec, n, kd: cs.kd, Icr: cs.Icr, Ig, fr, Mcr, MaD, MaDL, IeD, IeDL, dD, dDL, dL, lam, longTerm: lt, after, limImmediate: limI, limAttached: limA });
  out.results = [res('Icr', cs.Icr, I), res('Ie (D + L)', IeDL, I), res('Δ(D)', dD, L), res('Δ(L)', dL, L), res('Long-term', lt, L), res('After attachment', after, L)];
  out.diagram = { kind: 'deflection', b, h, d, kd: cs.kd, Asp, dp, span, after, cantilever: /^cantilever/.test(input.loadCase), chips: [S`b × h = ${v(b, L)} × ${u(h, L)}`, S`L = ${u(span, L)}`] };
  return done();
}
