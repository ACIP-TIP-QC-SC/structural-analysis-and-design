// RC beam shear (design and analyze) and torsion of solid rectangular sections. Pure calculation.
// Units in and out: mm, mm², MPa, kN, kN·m.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings, roundDown } from './common.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force', APM = 'area_per_mm';

// sqrt(f'c) with its upper limit in shear (clause key shear.sqrtFcCap).
export const sqrtFc = (fc, ed) => Math.min(Math.sqrt(fc), ed.concrete.shear.sqrtFcMax);
// One-way shear strength of concrete, N.
export function oneWayShearVc(bw, d, fc, lambda, ed) { return ed.concrete.shear.vc * lambda * sqrtFc(fc, ed) * bw * d; }
// Largest Vs the section may carry, N.
export function shearVsMax(bw, d, fc, ed) { return ed.concrete.shear.vsMax * sqrtFc(fc, ed) * bw * d; }
// Maximum stirrup spacing for a given Vs (N) (clause key shear.maxSpacing).
export function maxStirrupSpacing(Vs, bw, d, fc, ed) {
  const H = ed.concrete.shear, limit = H.spacingBreak * sqrtFc(fc, ed) * bw * d, row = Vs <= limit ? H.sLow : H.sHigh;
  return { limit, high: Vs > limit, row, s: Math.min(d / row.dDiv, row.max) };
}
// Minimum (Av/s), mm²/mm (clause key shear.AvMin).
export function minAvOverS(bw, fc, fyt, ed) { const H = ed.concrete.shear; return Math.max(H.avMinA * sqrtFc(fc, ed) * bw / fyt, H.avMinB * bw / fyt); }

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const out = (input.mode === 'torsion' ? torsion : shear)(input, ctx.edition);
  if (out.result.ok) out.result.verdict = verdictOf(out.result.checks);
  return out;
}
const stop = (msg, vals, diagram) => ({ vals: Object.assign(vals || {}, { error: msg }), result: fail([msg], diagram || {}) });

function shear(input, ed) {
  const C = ed.concrete, H = C.shear, phi = C.phi.shear, analyze = input.task === 'analyze';
  const need = ['bw', 'd', 'fc', 'fyt', 'lambda', 'dbs', 'legs'].concat(analyze ? ['s'] : ['Vu']);
  if (!positive(input, need) || !(input.Vu >= 0)) return stop('Every dimension, strength and load needs a positive number.');
  const { bw, d, fc, fyt, lambda, dbs, legs, Vu } = input;
  const out = blank(), rec = recorder(), vals = {};
  out.warnings.push(...materialWarnings(fc, fyt, ed, 'fyt'));
  const rt = sqrtFc(fc, ed), Vc = oneWayShearVc(bw, d, fc, lambda, ed) / 1e3, pVc = phi * Vc, half = H.minAbove * pVc;
  const Av = barArea(legs, dbs), VsMax = shearVsMax(bw, d, fc, ed) / 1e3, avMin = minAvOverS(bw, fc, fyt, ed), sAvMin = Av / avMin;
  const dia = { kind: 'shear', bw, d, dbs, legs, chips: [S`bw × d = ${v(bw, L)} × ${u(d, L)}`, S`${legs}-leg ${dbs} mm stirrups`] };
  out.diagram = dia;
  if (Math.sqrt(fc) > H.sqrtFcMax) out.notes.push('√f\'c is limited to ' + H.sqrtFcMax + ' MPa in shear (' + ed.clauses['shear.sqrtFcCap'].nscp + ').');
  rec.add('Shear strength of concrete', S`Vc = ${H.vc} · λ · √f'c · bw · d`, S`Vc = ${H.vc} · ${lambda} · √(${si(fc, ST)}) · (${si(bw, L)})(${si(d, L)})`, S`Vc = ${u(Vc, F)}`, 'shear.Vc');
  rec.add('Design strength of concrete', S`φVc = ${phi} · Vc;  ${H.minAbove} φVc`, S`φVc = ${phi} · ${v(Vc, F)}`, S`φVc = ${u(pVc, F)},  ${H.minAbove} φVc = ${u(half, F)}`, 'shear.phi');
  Object.assign(vals, { Vc, phiVc: pVc, halfPhiVc: half, Av, VsMax, sAvMin });

  if (analyze) {
    const s = input.s, Vs = Av * fyt * d / s / 1e3, Vn = Vc + Vs, pVn = phi * Vn, ms = maxStirrupSpacing(Vs * 1e3, bw, d, fc, ed);
    rec.add('Stirrup area', S`Av = legs · π · db² / 4`, S`Av = ${legs} · π · (${v(dbs, L)})² / 4`, S`Av = ${u(Av, A)}`, 'basic.barArea');
    rec.add('Shear strength of stirrups', S`Vs = Av · fyt · d / s`, S`Vs = (${v(Av, A)})(${v(fyt, ST)})(${v(d, L)}) / ${v(s, L)}`, S`Vs = ${u(Vs, F)}`, 'shear.Vs');
    rec.add('Design shear strength', S`φVn = φ (Vc + Vs)`, S`φVn = ${phi} (${v(Vc, F)} + ${v(Vs, F)})`, S`φVn = ${u(pVn, F)}`, 'shear.Vn');
    rec.add('Section limit', S`Vs ≤ ${H.vsMax} · √f'c · bw · d`, S`${H.vsMax} · √(${si(fc, ST)}) · (${si(bw, L)})(${si(d, L)}) = ${u(VsMax, F)}`, S`Vs / limit = ${dc(Vs / VsMax)}`, 'shear.sectionLimit');
    rec.add('Maximum stirrup spacing', S`Vs ${ms.high ? '>' : '≤'} ${H.spacingBreak} √f'c bw d = ${u(ms.limit / 1e3, F)}: s ≤ lesser of d / ${ms.row.dDiv} and ${u(ms.row.max, L)}`, S`s,max = lesser of ${v(d / ms.row.dDiv, L)} and ${v(ms.row.max, L)}`, S`s,max = ${u(ms.s, L)}`, 'shear.maxSpacing');
    rec.add('Spacing from minimum stirrup area', S`s ≤ Av · fyt / max(${H.avMinA} √f'c bw, ${H.avMinB} bw)`, S`s ≤ ${v(Av, A)} / ${v(avMin, APM)}`, S`s ≤ ${u(sAvMin, L)}`, 'shear.AvMin');
    if (Vu > 0) out.checks.push(check('Shear strength', ['Vu', Vu, F], ['φVn', pVn, F], Vu / pVn, 'shear.Vn'));
    out.checks.push(check('Section limit', ['Vs', Vs, F], ['Vs,max', VsMax, F], Vs / VsMax, 'shear.sectionLimit'));
    out.checks.push(check('Stirrup spacing', ['s', s, L], ['s,max', ms.s, L], s / ms.s, 'shear.maxSpacing'));
    out.checks.push(check('Minimum stirrup area', ['s', s, L], ['s for Av,min', sAvMin, L], s / sAvMin, 'shear.AvMin'));
    Object.assign(vals, { Vs, Vn, phiVn: pVn, sMax: ms.s });
    out.results = [res('Vc', Vc, F), res('Vs', Vs, F), res('φVn', pVn, F), res('Av', Av, A), res('s,max', ms.s, L)];
    Object.assign(dia, { s, Vu });
    out.steps = rec.steps;
    return { vals, result: out };
  }

  // Design
  const cls = Vu <= half ? 'none' : Vu <= pVc ? 'minimum' : 'designed';
  const clsText = { none: 'Vu ≤ ' + H.minAbove + ' φVc: no stirrups are required.', minimum: H.minAbove + ' φVc < Vu ≤ φVc: minimum stirrups are required.', designed: 'Vu > φVc: stirrups are designed for the excess shear.' }[cls];
  rec.add('Stirrup requirement', S`Compare Vu with ${H.minAbove} φVc and φVc`, S`Vu = ${u(Vu, F)}, ${H.minAbove} φVc = ${u(half, F)}, φVc = ${u(pVc, F)}`, [clsText], 'shear.minRequired');
  const VsReq = Math.max(Vu / phi - Vc, 0);
  rec.add('Required stirrup strength', S`Vs = Vu / φ − Vc ≥ 0;  Vs ≤ ${H.vsMax} · √f'c · bw · d`, S`Vs = ${v(Vu, F)} / ${phi} − ${v(Vc, F)};  limit = ${u(VsMax, F)}`, S`Vs required = ${u(VsReq, F)}`, 'shear.sectionLimit');
  Object.assign(vals, { stirrups: cls, VsReq });
  if (VsReq > VsMax) return stop('Section too small for shear; enlarge the section.', vals, dia);
  const sStrength = VsReq > 0 ? Av * fyt * d / (VsReq * 1e3) : Infinity;
  const ms = maxStirrupSpacing(VsReq * 1e3, bw, d, fc, ed);
  rec.add('Spacing from strength', S`Av = legs · π · db² / 4;  s = Av · fyt · d / Vs`, S`Av = ${u(Av, A)};  s = (${v(Av, A)})(${v(fyt, ST)})(${v(d, L)}) / (${v(VsReq, F)} × 10³)`,
    VsReq > 0 ? S`s = ${u(sStrength, L)}` : ['Not governed by strength (Vs required = 0).'], 'shear.Vs');
  rec.add('Maximum stirrup spacing', S`Vs ${ms.high ? '>' : '≤'} ${H.spacingBreak} √f'c bw d = ${u(ms.limit / 1e3, F)}: s ≤ lesser of d / ${ms.row.dDiv} and ${u(ms.row.max, L)}`, S`s,max = lesser of ${v(d / ms.row.dDiv, L)} and ${v(ms.row.max, L)}`, S`s,max = ${u(ms.s, L)}`, 'shear.maxSpacing');
  rec.add('Spacing from minimum stirrup area', S`s ≤ Av · fyt / max(${H.avMinA} √f'c bw, ${H.avMinB} bw)`, S`s ≤ ${v(Av, A)} / ${v(avMin, APM)}`, S`s ≤ ${u(sAvMin, L)}`, 'shear.AvMin');
  const sUse = Math.min(sStrength, ms.s, sAvMin), sPrac = roundDown(sUse, H.practical);
  Object.assign(vals, { sStrength, sMax: ms.s, sUse, sPractical: sPrac, vsBreak: ms.limit / 1e3 });
  if (sPrac < H.practical) return stop('The required stirrup spacing is below ' + H.practical + ' mm. Use a larger stirrup bar, more legs or a larger section.', vals, dia);
  rec.add('Spacing to use', S`s = least of the three spacings, rounded down to a ${u(H.practical, L)} multiple`, S`s = least of ${VsReq > 0 ? v(sStrength, L) : 'no limit'}, ${v(ms.s, L)}, ${v(sAvMin, L)} = ${u(sUse, L)}`, S`Use ${legs}-leg ${dbs} mm stirrups at ${u(sPrac, L)}`, 'shear.maxSpacing',
    cls === 'none' ? 'Stirrups are not required by the code here; this spacing is the minimum arrangement if they are provided.' : '');
  const Vs = Av * fyt * d / sPrac / 1e3, pVn = phi * (Vc + Vs);
  rec.add('Design strength at the chosen spacing', S`φVn = φ (Vc + Av · fyt · d / s)`, S`φVn = ${phi} (${v(Vc, F)} + ${v(Vs, F)})`, S`φVn = ${u(pVn, F)};  Vu / φVn = ${dc(Vu / pVn)}`, 'shear.Vn', 'Vu is taken at the critical section, d from the face of the support (' + ed.clauses['shear.criticalSection'].nscp + ').');
  out.checks.push(check('Section limit', ['Vs required', VsReq, F], ['Vs,max', VsMax, F], VsReq / VsMax, 'shear.sectionLimit'));
  out.checks.push(check('Shear strength', ['Vu', Vu, F], ['φVn', pVn, F], Vu / pVn, 'shear.Vn'));
  Object.assign(vals, { Vs, phiVn: pVn });
  out.results = [res('Vc', Vc, F), res('φVc', pVc, F), res('Vs required', VsReq, F), res('s required', sUse, L), res('s to use', sPrac, L), res('φVn', pVn, F)];
  Object.assign(dia, { s: sPrac, Vu, none: cls === 'none' });
  out.steps = rec.steps;
  return { vals, result: out };
}

function torsion(input, ed) {
  const C = ed.concrete, H = C.shear, T = C.torsion, phi = C.phi.torsion;
  if (!positive(input, ['b', 'h', 'd', 'cover', 'fc', 'fy', 'fyt', 'lambda', 'dbs', 'Tu']) || !(input.Vu >= 0)) return stop('Every dimension, strength and load needs a positive number.');
  const { b, h, d, cover, fc, fy, fyt, lambda, dbs, Tu, Vu } = input;
  if (d >= h) return stop('Effective depth d must be less than the total depth h.');
  if (2 * cover >= Math.min(b, h)) return stop('The cover to the stirrup centerline is too large for this section.');
  const out = blank(), rec = recorder(), vals = {};
  out.warnings.push(...materialWarnings(fc, fy, ed));
  const rt = sqrtFc(fc, ed), Acp = b * h, pcp = 2 * (b + h);
  const Tth = T.th * lambda * rt * Acp * Acp / pcp / 1e6, pTth = phi * Tth, Tcr = T.cr * lambda * rt * Acp * Acp / pcp / 1e6, pTcr = phi * Tcr;
  const x1 = b - 2 * cover, y1 = h - 2 * cover, Aoh = x1 * y1, ph = 2 * (x1 + y1), Ao = T.AoFactor * Aoh;
  const dia = { kind: 'torsion', b, h, d, cover, x1, y1, dbs, chips: [S`b × h = ${v(b, L)} × ${u(h, L)}`, S`${dbs} mm closed stirrups`] };
  out.diagram = dia;
  rec.add('Section properties', S`Acp = b · h;  pcp = 2 (b + h)`, S`Acp = ${v(b, L)} · ${v(h, L)};  pcp = 2 (${v(b, L)} + ${v(h, L)})`, S`Acp = ${u(Acp, A)},  pcp = ${u(pcp, L)}`, 'basic.geometry');
  rec.add('Threshold torsion', S`φTth = φ · ${T.th} · λ · √f'c · Acp² / pcp`, S`φTth = ${phi} · ${T.th} · ${lambda} · √(${si(fc, ST)}) · (${si(Acp, A)})² / ${si(pcp, L)}`, S`φTth = ${u(pTth, 'moment')}`, 'torsion.threshold');
  Object.assign(vals, { Acp, pcp, phiTth: pTth, phiTcr: pTcr, Aoh, ph, Ao });
  if (Tu < pTth) {
    rec.add('Torsion may be neglected', S`Tu < φTth`, S`Tu = ${u(Tu, 'moment')} < φTth = ${u(pTth, 'moment')}`, ['Torsion may be neglected. Design the stirrups for shear only.'], 'torsion.neglect');
    out.checks.push(check('Torsion threshold', ['Tu', Tu, 'moment'], ['φTth', pTth, 'moment'], Tu / pTth, 'torsion.neglect', { note: 'below the threshold, torsion may be neglected' }));
    out.notes.push('Torsion is below the threshold and may be neglected (' + ed.clauses['torsion.neglect'].nscp + '). Use the Beam shear mode for the stirrups.');
    out.results = [res('φTth', pTth, 'moment'), res('Tu', Tu, 'moment')];
    vals.neglect = true;
    out.steps = rec.steps;
    return { vals, result: out };
  }
  vals.neglect = false;
  rec.add('Torsion must be considered', S`Tu ≥ φTth`, S`Tu = ${u(Tu, 'moment')} ≥ φTth = ${u(pTth, 'moment')}`, ['Torsion reinforcement is required.'], 'torsion.neglect');
  let TuD = Tu;
  const compat = input.torsionType === 'compatibility';
  rec.add('Cracking torsion', S`φTcr = φ · ${T.cr} · λ · √f'c · Acp² / pcp`, S`φTcr = ${phi} · ${T.cr} · ${lambda} · √(${si(fc, ST)}) · (${si(Acp, A)})² / ${si(pcp, L)}`, S`φTcr = ${u(pTcr, 'moment')}`, 'torsion.cracking',
    compat ? (Tu > pTcr ? 'Compatibility torsion: Tu is reduced to φTcr, and the adjoining members must be designed for the redistributed moments.' : 'Compatibility torsion: Tu is already below φTcr, so it is not reduced.') : 'Equilibrium torsion: Tu may not be reduced.');
  if (compat && Tu > pTcr) TuD = pTcr;
  vals.TuDesign = TuD;
  rec.add('Stirrup centerline dimensions', S`x1 = b − 2 · cover;  y1 = h − 2 · cover;  Aoh = x1 · y1;  ph = 2 (x1 + y1);  Ao = ${T.AoFactor} Aoh`, S`x1 = ${u(x1, L)}, y1 = ${u(y1, L)}`, S`Aoh = ${u(Aoh, A)},  ph = ${u(ph, L)},  Ao = ${u(Ao, A)}`, 'torsion.Tn');
  const Vc = oneWayShearVc(b, d, fc, lambda, ed) / 1e3;
  const lhs = Math.sqrt(Math.pow(Vu * 1e3 / (b * d), 2) + Math.pow(TuD * 1e6 * ph / (T.limitDen * Aoh * Aoh), 2));
  const rhs = phi * (Vc * 1e3 / (b * d) + H.vsMax * rt);
  rec.add('Section limit', S`√[(Vu / (bw d))² + (Tu ph / (${T.limitDen} Aoh²))²] ≤ φ (Vc / (bw d) + ${H.vsMax} √f'c)`,
    S`√[(${si(Vu * 1e3 / (b * d), ST)})² + (${si(TuD * 1e6 * ph / (T.limitDen * Aoh * Aoh), ST)})²] against ${phi} (${si(Vc * 1e3 / (b * d), ST)} + ${H.vsMax} √(${si(fc, ST)}))`,
    S`${u(lhs, ST)} ${lhs <= rhs ? '≤' : '>'} ${u(rhs, ST)}`, 'torsion.sectionLimit');
  const cot = 1 / Math.tan(T.thetaDeg * Math.PI / 180);
  const AtS = TuD * 1e6 / (phi * 2 * Ao * fyt * cot);
  rec.add('Torsion stirrups, one leg', S`At / s = Tu / (φ · 2 · Ao · fyt · cot θ),  θ = ${T.thetaDeg}°`, S`At / s = (${v(TuD, 'moment')} × 10⁶) / (${phi} · 2 · ${si(Ao, A)} · ${si(fyt, ST)})`, S`At / s = ${u(AtS, APM)}`, 'torsion.Tn');
  const AvS = Math.max((Vu / phi - Vc) * 1e3 / (fyt * d), 0);
  rec.add('Shear stirrups, all legs', S`Av / s = (Vu / φ − Vc) / (fyt · d) ≥ 0`, S`Vc = ${u(Vc, F)};  Av / s = (${v(Vu, F)} / ${phi} − ${v(Vc, F)}) × 10³ / (${si(fyt, ST)} · ${si(d, L)})`, S`Av / s = ${u(AvS, APM)}`, 'shear.Vs');
  const total = AvS + 2 * AtS, minT = minAvOverS(b, fc, fyt, ed), use = Math.max(total, minT);
  rec.add('Combined transverse steel', S`(Av + 2At) / s ≥ greater of ${H.avMinA} √f'c bw / fyt and ${H.avMinB} bw / fyt`, S`(Av + 2At) / s = ${v(AvS, APM)} + 2 · ${v(AtS, APM)} = ${u(total, APM)};  minimum = ${u(minT, APM)}`, S`(Av + 2At) / s = ${u(use, APM)}`, 'torsion.minTransverse');
  // Shear spacing limits (Table 409.7.6.2.2) also apply where stirrups are needed for shear (Vu > 0.5 φVc).
  const shearNeeded = Vu > H.minAbove * phi * Vc, msV = maxStirrupSpacing(AvS * fyt * d, b, d, fc, ed);
  const Ab = barArea(1, dbs), sReq = 2 * Ab / use, sMaxT = Math.min(ph / T.sMaxDiv, T.sMax), sMax = shearNeeded ? Math.min(sMaxT, msV.s) : sMaxT, sUse = Math.min(sReq, sMax), sPrac = roundDown(sUse, H.practical);
  rec.add('Stirrup spacing', S`s = 2 Ab / [(Av + 2At) / s] for a two-leg closed stirrup;  s,max = lesser of ph / ${T.sMaxDiv} and ${u(T.sMax, L)}${shearNeeded ? S`, and d / ${msV.row.dDiv} ≤ ${u(msV.row.max, L)} for shear` : ''}`, S`s = 2 · ${v(Ab, A)} / ${v(use, APM)} = ${u(sReq, L)};  s,max = ${u(sMax, L)}`, S`Use ${dbs} mm closed stirrups at ${u(sPrac, L)}`, 'torsion.maxSpacing',
    shearNeeded ? 'Vu > ' + H.minAbove + ' φVc, so the shear spacing limit of ' + ed.clauses['shear.maxSpacing'].nscp + ' also applies.' : '');
  const Al = AtS * ph * fyt / fy, base = T.alMin * rt * Acp / fy, AlMinA = base - AtS * ph * fyt / fy, AlMinB = base - (T.alMinB * b / fyt) * ph * fyt / fy, AlMin = Math.min(AlMinA, AlMinB);
  rec.add('Longitudinal torsion steel', S`Aℓ = (At / s) · ph · fyt / fy`, S`Aℓ = ${v(AtS, APM)} · ${v(ph, L)} · ${v(fyt, ST)} / ${v(fy, ST)}`, S`Aℓ = ${u(Al, A)}`, 'torsion.Tn');
  rec.add('Minimum longitudinal torsion steel', S`Aℓ,min = lesser of ${T.alMin} √f'c Acp / fy − (At / s) ph fyt / fy and ${T.alMin} √f'c Acp / fy − (${T.alMinB} bw / fyt) ph fyt / fy`, S`Aℓ,min = lesser of ${v(AlMinA, A)} and ${v(AlMinB, A)}`, S`Aℓ,min = ${u(AlMin, A)};  provide Aℓ = ${u(Math.max(Al, AlMin), A)}`, 'torsion.minLongitudinal', 'Distribute the longitudinal bars around the perimeter of the closed stirrups, in addition to the flexural steel.');
  Object.assign(vals, { sectLhs: lhs, sectRhs: rhs, AtS, AvS, total, minTotal: minT, sReq, sMax, sPractical: sPrac, Al, AlMin });
  if (sPrac < H.practical) return stop('The required stirrup spacing is below ' + H.practical + ' mm. Use a larger stirrup bar or a larger section.', vals, dia);
  out.checks.push(check('Section limit', ['combined stress', lhs, ST], ['limit', rhs, ST], lhs / rhs, 'torsion.sectionLimit'));
  out.checks.push(check('Stirrup spacing', ['s used', sPrac, L], ['s allowed', sUse, L], sPrac / sUse, 'torsion.maxSpacing', { note: 'required ' + (sReq <= sMax ? 'strength spacing governs' : 'maximum spacing governs') }));
  out.results = [res('φTth', pTth, 'moment'), res('At/s', AtS, APM), res('(Av + 2At)/s', use, APM), res('s to use', sPrac, L), res('Aℓ', Math.max(Al, AlMin), A)];
  dia.s = sPrac;
  out.steps = rec.steps;
  return { vals, result: out };
}
