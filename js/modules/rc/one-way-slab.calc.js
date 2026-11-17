// One-way slab: design of a one metre strip. Pure calculation.
// Units: mm, MPa, kN·m per m, kN per m, kPa; As in mm² per m.
import { S, v, u, si, dc, Nmm, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, rhoFromRn, materialWarnings, roundDown } from './common.js';
import { flexuralStrengthRect } from './beam-flexure.calc.js';
import { oneWayShearVc } from './shear-torsion.calc.js';

const L = 'length_mm', ST = 'stress', APM = 'area_per_m', MPM = 'moment_per_m', LL = 'lineload';
const STRIP = 1000;   // design strip width, mm (a unit of measure, not a code value)

// Minimum thickness of a one-way slab or beam from the span (mm). member: 'slab' | 'beam'.
export function minimumDepth(span, support, fy, member, ed) {
  const M = ed.concrete.minDepth, divisor = M[member][support], factor = M.factor(fy);
  return { divisor, factor, h: span / divisor * factor };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, phiF = C.designAssume.phi, G = ed.loads.gravity;
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg, dia) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], dia || {}) });
  if (!positive(input, ['span', 'h', 'fc', 'fy', 'dbm', 'dbt'])) return stop('Every dimension and strength needs a positive number.');
  const { span, support, h, fc, fy, dbm, dbt } = input;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  let d;
  if (input.dFrom === 'typed') { d = input.d; if (!(d > 0)) return stop('Effective depth d needs a positive number.'); }
  else {
    if (!(input.cover > 0)) return stop('Clear cover needs a positive number.');
    d = h - input.cover - dbm / 2;
    rec.add('Effective depth', S`d = h − cover − db / 2`, S`d = ${v(h, L)} − ${v(input.cover, L)} − ${v(dbm, L)} / 2`, S`d = ${u(d, L)}`, 'found.cover');
  }
  if (!(d > 0) || d >= h) return stop('Effective depth d must be positive and less than the slab thickness h.');
  const dia = { h, d, dbm, dbt, chips: [S`h = ${u(h, L)}, d = ${u(d, L)}`, S`${dbm} mm main bars, ${dbt} mm temperature bars`] };
  out.diagram = dia;

  let Mu = input.Mu;
  if (input.muFrom === 'loads') {
    if (!(input.wD >= 0) || !(input.wL >= 0) || !(input.wD + input.wL > 0)) return stop('Give the dead and live loads on the slab.');
    const wu = G.D * input.wD + G.L * input.wL, Lm = span / 1000;
    Mu = wu * Lm * Lm / 8;
    rec.add('Factored load and moment, simple span', S`wu = ${G.D} wD + ${G.L} wL;  Mu = wu · ℓ² / 8 (per metre of width)`, S`wu = ${G.D} · ${v(input.wD, 'pressure')} + ${G.L} · ${v(input.wL, 'pressure')} = ${u(wu, 'pressure')};  Mu = ${v(wu, 'pressure')} · ${v(Lm, 'length_m')}² / 8`, S`Mu = ${u(Mu, MPM)}`, 'loads.strength', 'This helper is for a simply supported span. For continuous spans, type Mu from your analysis.');
    vals.wu = wu;
  }
  if (!(Mu > 0)) return stop('Factored moment Mu needs a positive number.');
  vals.Mu = Mu; vals.d = d;

  const md = minimumDepth(span, support, fy, 'slab', ed);
  rec.add('Minimum thickness', S`h,min = ℓ / ${md.divisor}${md.factor === 1 ? '' : S` × (${C.minDepth.fyA} + fy / ${C.minDepth.fyB})`}`, S`h,min = ${v(span, L)} / ${md.divisor}${md.factor === 1 ? '' : S` × ${md.factor}`}`, S`h,min = ${u(md.h, L)}`, 'slab.minThickness',
    'For normal-weight concrete. A thinner slab is allowed if deflections are calculated.');
  const Rn = Mu * 1e6 / (phiF * STRIP * d * d), rho = rhoFromRn(Rn, fc, fy, C.sb);
  Object.assign(vals, { hmin: md.h, Rn, rho });
  if (!isFinite(rho)) return stop('The slab is too thin for this moment. Increase the thickness.', dia);
  const AsReq = rho * STRIP * d, ratio = C.AsMinSlabRatio(fy), AsMin = ratio * STRIP * h, AsUse = Math.max(AsReq, AsMin);
  rec.add('Required steel', S`Rn = Mu / (${phiF} · 1000 · d²);  ρ = (${C.sb} f'c / fy) [1 − √(1 − 2 Rn / (${C.sb} f'c))];  As = ρ · 1000 · d`,
    { SI: S`Rn = (${v(Mu, MPM)} × 10⁶) / (${phiF} · 1000 · ${v(d, L)}²) = ${u(Rn, ST)};  ρ = ${rho}`, US: S`Rn = ${u(Rn, ST)};  ρ = ${rho}` }, S`As = ${u(AsReq, APM)}`, 'flexure.stressBlock', 'φ = ' + phiF + ' is assumed and confirmed below.');
  rec.add('Minimum steel', S`As,min = ${ratio} · 1000 · h`, S`As,min = ${ratio} · 1000 · ${v(h, L)}`, S`As,min = ${u(AsMin, APM)};  As to use = ${u(AsUse, APM)}`, 'slab.minSteel',
    fy < C.asMinSlab.fyBreak ? 'Ratio ' + C.asMinSlab.below + ' for fy below ' + C.asMinSlab.fyBreak + ' MPa.' : 'Ratio is the greater of ' + C.asMinSlab.at + ' × ' + C.asMinSlab.fyBreak + ' / fy and ' + C.asMinSlab.floor + '.');
  const Ab = barArea(1, dbm), sCalc = STRIP * Ab / AsUse, SP = C.slabSpacing, sMaxMain = Math.min(SP.main.timesH * h, SP.main.max);
  const sUse = Math.min(sCalc, sMaxMain), sPrac = roundDown(sUse, C.shear.practical);
  Object.assign(vals, { AsReq, AsMin, AsUse, sCalc, sMaxMain, sPractical: sPrac });
  if (sPrac < C.shear.practical) return stop('The main bars would be closer than ' + C.shear.practical + ' mm. Use a larger bar or a thicker slab.', dia);
  rec.add('Main bar spacing', S`s = 1000 · Ab / As;  s ≤ lesser of ${SP.main.timesH} h and ${u(SP.main.max, L)}`, S`s = 1000 · ${v(Ab, 'area')} / ${v(AsUse, APM)} = ${u(sCalc, L)};  s,max = ${u(sMaxMain, L)}`, S`Use ${dbm} mm bars at ${u(sPrac, L)}`, 'slab.maxSpacing', 'Rounded down to a ' + C.shear.practical + ' mm multiple.');
  const AsProv = STRIP * Ab / sPrac, s = flexuralStrengthRect({ b: STRIP, d, As: AsProv, fc, fy }, ed), pMn = s.phi * s.Mn / 1e6;
  rec.add('Strength with the bars provided', S`As = 1000 · Ab / s;  a = As · fy / (${C.sb} · f'c · 1000);  εt = ${C.ecu} (d − c) / c;  φMn = φ · As · fs · (d − a / 2)`,
    S`As = ${u(AsProv, APM)}, a = ${u(s.a, L)}, c = ${u(s.c, L)}, εt = ${s.et}, φ = ${s.phi}`, S`φMn = ${u(pMn, MPM)};  Mu / φMn = ${dc(Mu / pMn)}`, 'slab.strain',
    s.et >= C.etTension ? 'εt is above the tension-controlled limit, so φ is as assumed.' : 'εt is below the tension-controlled limit, so φ is reduced.');
  const AsT = ratio * STRIP * h, AbT = barArea(1, dbt), sT = STRIP * AbT / AsT, sMaxT = Math.min(SP.temp.timesH * h, SP.temp.max), sTPrac = roundDown(Math.min(sT, sMaxT), C.shear.practical);
  rec.add('Shrinkage and temperature steel', S`As,t = ${ratio} · 1000 · h;  s = 1000 · Ab / As,t;  s ≤ lesser of ${SP.temp.timesH} h and ${u(SP.temp.max, L)}`, S`As,t = ${u(AsT, APM)};  s = 1000 · ${v(AbT, 'area')} / ${v(AsT, APM)} = ${u(sT, L)};  s,max = ${u(sMaxT, L)}`, S`Use ${dbt} mm bars at ${u(sTPrac, L)}`, 'slab.tempSteel', 'Placed at right angles to the main bars (spacing limit: ' + ed.clauses['slab.tempSpacing'].nscp + ').');
  Object.assign(vals, { AsProv, a: s.a, c: s.c, et: s.et, phi: s.phi, phiMn: pMn, AsTemp: AsT, sTemp: sT, sMaxTemp: sMaxT, sTempPractical: sTPrac, Ctotal: s.C / 1e3, Ttotal: s.T / 1e3 });
  out.checks.push(check('Thickness', ['h,min', md.h, L], ['h', h, L], md.h / h, 'slab.minThickness'));
  out.checks.push(check('Flexural strength', ['Mu', Mu, MPM], ['φMn', pMn, MPM], Mu / pMn, 'slab.strength'));
  out.checks.push(check('Ductility, εt ≥ ' + C.etMinSlab, ['limit', C.etMinSlab, 'strain'], ['εt', s.et, 'strain'], C.etMinSlab / s.et, 'slab.strain'));
  const pVc = C.phi.shear * oneWayShearVc(STRIP, d, fc, 1, ed) / 1e3;
  vals.phiVc = pVc;
  rec.add('Shear strength of the strip', S`φVc = ${C.phi.shear} · ${C.shear.vc} · √f'c · 1000 · d`, S`φVc = ${C.phi.shear} · ${C.shear.vc} · √(${si(fc, ST)}) · 1000 · ${si(d, L)}`, S`φVc = ${u(pVc, LL)}`, 'shear.Vc', input.Vu > 0 ? '' : 'No Vu was given, so shear is not checked.');
  if (input.Vu > 0) out.checks.push(check('Shear', ['Vu', input.Vu, LL], ['φVc', pVc, LL], input.Vu / pVc, 'shear.Vc'));
  out.results = [res('h,min', md.h, L), res('As required', AsReq, APM), res('As,min', AsMin, APM), res('Main bars: ' + dbm + ' mm at', sPrac, L), res('Temperature bars: ' + dbt + ' mm at', sTPrac, L), res('φMn', pMn, MPM), res('φVc', pVc, LL)];
  Object.assign(dia, { s: sPrac, sT: sTPrac });
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}
