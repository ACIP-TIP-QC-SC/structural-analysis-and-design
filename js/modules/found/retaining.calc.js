// Cantilever retaining walls: stability under service loads, and strength design of the stem, heel and toe.
// Pure calculation. Units: m and kN per metre of wall, kPa, kN/m³, degrees; mm and MPa for the concrete design.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { materialWarnings } from '../rc/common.js';
import { requiredSteelRect } from '../rc/beam-flexure.calc.js';
import { oneWayShearVc } from '../rc/shear-torsion.calc.js';
import { ldHook } from '../rc/devLength.js';

const LM = 'length_m', L = 'length_mm', PR = 'pressure', LL = 'lineload', MPM = 'moment_per_m', APM = 'area_per_m', UW = 'unitweight', DEG = 'angle_deg', ST = 'stress';
const rad = (x) => x * Math.PI / 180;

// Earth pressure coefficients ("Theory").
export function rankineKa(phi, beta) {
  const cb = Math.cos(rad(beta)), cp = Math.cos(rad(phi)), r = Math.sqrt(Math.max(cb * cb - cp * cp, 0));
  return cb * (cb - r) / (cb + r);
}
export function coulombKa(phi, delta, beta) {
  const p = rad(phi), d = rad(delta), b = rad(beta);
  const root = Math.sqrt(Math.max(Math.sin(p + d) * Math.sin(p - b), 0) / (Math.cos(d) * Math.cos(b)));
  return Math.cos(p) * Math.cos(p) / (Math.cos(d) * Math.pow(1 + root, 2));
}
export const rankineKp = (phi) => Math.pow(Math.tan(rad(45 + phi / 2)), 2);

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, K = ed.found.retaining, C = ed.concrete, gc = input.gammaC > 0 ? input.gammaC : ed.found.defaults.gammaC;
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  if (!positive(input, ['hs', 'tTop', 'tBot', 'hb', 'heel', 'gamma', 'phi']) || !(input.toe >= 0)) return stop('Every wall dimension, the unit weight and φ\' need positive numbers (the toe may be 0).');
  const { hs, hb, toe, heel, gamma, phi } = input, tTop = input.tTop / 1000, tBot = input.tBot / 1000, beta = input.beta > 0 ? input.beta : 0, q = input.q > 0 ? input.q : 0;
  if (tTop > tBot) return stop('The stem must not be thicker at the top than at the bottom.');
  if (beta >= phi) return stop("The backfill slope β must be less than φ'.");
  const H = hs + hb, B = toe + tBot + heel, Hp = H + heel * Math.tan(rad(beta));
  out.diagram = { hs, hb, toe, tTop, tBot, heel, beta, H, B, q };
  // 1. coefficients
  const KaR = rankineKa(phi, beta), Kp = rankineKp(phi);
  const delta = input.delta > 0 ? input.delta : 0, KaC = coulombKa(phi, delta, beta);
  const coul = input.method === 'coulomb', Ka = coul ? KaC : KaR, inc = coul ? delta : beta;
  rec.add('Earth pressure coefficients', coul ? S`Coulomb, vertical back with wall friction δ: Ka = cos²φ' / [cos δ (1 + √(sin(φ' + δ) sin(φ' − β) / (cos δ cos β)))²]` : S`Rankine: Ka = cos β (cos β − √(cos²β − cos²φ')) / (cos β + √(cos²β − cos²φ'));  β = 0 gives tan²(45° − φ'/2)`,
    S`φ' = ${u(phi, DEG)}, β = ${u(beta, DEG)}${coul ? S`, δ = ${u(delta, DEG)}` : ''};  Rankine Ka = ${KaR}${delta > 0 ? S`, Coulomb Ka = ${KaC}` : ''}`, S`Ka = ${Ka};  Kp = tan²(45° + φ'/2) = ${Kp}`, 'theory.soil');
  Object.assign(vals, { KaRankine: KaR, KaCoulomb: KaC, Kp, Ka });
  // 2. active force
  const Pa = 0.5 * gamma * Hp * Hp * Ka, ci = Math.cos(rad(inc)), sinI = Math.sin(rad(inc)), Pah = Pa * ci, Pav = Pa * sinI, Pq = q * Ka * Hp, Pqh = Pq * ci, Pqv = Pq * sinI;
  rec.add('Active thrust', S`H' = H + heel tan β;  Pa = ½ γ H'² Ka at H'/3, inclined at ${coul ? 'δ' : 'β'};  surcharge q Ka H' at H'/2`, S`H' = ${u(Hp, LM)};  Pa = ½ · ${v(gamma, UW)} · ${v(Hp, LM)}² · ${Ka}`,
    S`Pa = ${u(Pa, LL)} (horizontal ${u(Pah, LL)}, vertical ${u(Pav, LL)})${q > 0 ? S`;  surcharge ${u(Pq, LL)}` : ''}`, 'theory.soil');
  const Mo = Pah * Hp / 3 + Pqh * Hp / 2, Hsum = Pah + Pqh;
  // 3. weights and lever arms about the toe
  const W = [];
  const push = (name, w, x) => W.push({ name, w, x });
  push('stem, rectangle', tTop * hs * gc, toe + tBot - tTop / 2);
  if (tBot > tTop) push('stem, triangle', (tBot - tTop) * hs / 2 * gc, toe + 2 * (tBot - tTop) / 3);
  push('base', B * hb * gc, B / 2);
  push('soil over the heel', heel * hs * gamma, toe + tBot + heel / 2);
  if (beta > 0) push('soil wedge over the heel', heel * heel * Math.tan(rad(beta)) / 2 * gamma, toe + tBot + 2 * heel / 3);
  if (q > 0) push('surcharge over the heel', q * heel, toe + tBot + heel / 2);
  if (Pav + Pqv > 0) push('vertical component of the thrust', Pav + Pqv, B);
  const V = W.reduce((t, x) => t + x.w, 0), Mr = W.reduce((t, x) => t + x.w * x.x, 0);
  rec.add('Weights and resisting moments about the toe', S`ΣV = Σ W;  ΣMr = Σ W x`, W.map((x, i) => S`${i ? ';  ' : ''}${x.name} ${v(x.w, LL)} at ${v(x.x, LM)}`).flat(), S`ΣV = ${u(V, LL)},  ΣMr = ${u(Mr, MPM)}`, 'basic.statics', 'Soil over the toe is ignored.');
  rec.add('Overturning moment', S`ΣMo = Pa,h H'/3${q > 0 ? ' + surcharge H\'/2' : ''}`, null, S`ΣMo = ${u(Mo, MPM)}`, 'basic.statics');
  const FSo = Mr / Mo;
  rec.add('Overturning', S`FS = ΣMr / ΣMo ≥ ${K.FSoverturning}`, S`FS = ${v(Mr, MPM)} / ${v(Mo, MPM)}`, S`FS = ${FSo}`, 'rw.stability');
  const mu = input.mu > 0 ? input.mu : 0, ca = input.adhesion > 0 ? input.adhesion : 0, Pp = input.Dp > 0 ? 0.5 * gamma * input.Dp * input.Dp * Kp : 0;
  const FSs = (mu * V + ca * B + Pp) / Hsum;
  rec.add('Sliding', S`FS = (μ ΣV + adhesion · B + passive) / ΣH ≥ ${K.FSsliding}`, S`FS = (${mu} · ${v(V, LL)} + ${v(ca, PR)} · ${v(B, LM)} + ${v(Pp, LL)}) / ${v(Hsum, LL)}`, S`FS = ${FSs}`, 'rw.stability', Pp > 0 ? 'Passive resistance ½ γ D² Kp is included.' : '');
  out.notes.push(K.frictionNote);
  const xbar = (Mr - Mo) / V, e = B / 2 - xbar, kern = B / 6;
  let qmax, qmin;
  if (xbar <= 0) return stop('The resultant falls outside the base: the wall overturns.');
  if (e <= kern) { qmax = V / B * (1 + 6 * e / B); qmin = V / B * (1 - 6 * e / B); }
  else { qmax = 2 * V / (3 * xbar); qmin = 0; out.warnings.push('The resultant is outside the middle third: part of the base is not in contact with the soil.'); }
  rec.add('Base pressure', S`x̄ = (ΣMr − ΣMo) / ΣV;  e = B/2 − x̄;  e ≤ B/6: q = ΣV / B (1 ± 6e / B);  otherwise qmax = 2 ΣV / (3 x̄)`, S`x̄ = ${u(xbar, LM)};  e = ${u(e, LM)} (B/6 = ${u(kern, LM)})`, S`qmax = ${u(qmax, PR)},  qmin = ${u(qmin, PR)}`, 'basic.statics');
  Object.assign(vals, { H, B, Hp, Pa, Mo, V, Mr, FSot: FSo, FSsl: FSs, xbar, e, kern, qmax, qmin });
  Object.assign(out.diagram, { qmax, qmin, Pa, xbar });
  out.diagram.chips = [S`H = ${u(H, LM)}, B = ${u(B, LM)}`, S`Ka = ${Ka}`];

  if (input.mode !== 'design') {
    out.checks.push(check('Overturning', ['FS required', K.FSoverturning, 'ratio'], ['FS', FSo, 'ratio'], K.FSoverturning / FSo, 'rw.stability'));
    out.checks.push(check('Sliding', ['FS required', K.FSsliding, 'ratio'], ['FS', FSs, 'ratio'], K.FSsliding / FSs, 'rw.stability'));
    if (input.qa > 0) out.checks.push(check('Bearing', ['qmax', qmax, PR], ['qa', input.qa, PR], qmax / input.qa, 'found.baseArea'));
    out.checks.push(check('Resultant within the middle third', ['e', Math.max(e, 0), LM], ['B/6', kern, LM], Math.max(e, 0) / kern, 'basic.statics'));
    out.results = [res('Ka', Ka), res('FS overturning', FSo), res('FS sliding', FSs), res('e', e, LM), res('qmax', qmax, PR), res('qmin', qmin, PR)];
    return done();
  }

  // ---------------------------------------------------------------- stem and base, factored, per metre
  if (!positive(input, ['fc', 'fy', 'dStem', 'dbBase', 'dbStem'])) return stop('Give the strengths, the stem effective depth and the bar sizes.');
  const { fc, fy, dStem } = input;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  const phiV = C.phi.shear, ratio = C.AsMinSlabRatio(fy);
  const steel = (Mu, d) => { if (!(Mu > 0)) return 0; const r = requiredSteelRect({ b: 1000, d, fc, fy, Mu: Mu * 1e6 }, ed); return r.ok ? r.As : NaN; };
  const ch = Math.cos(rad(inc));
  const Mu = K.earth * ch * (Ka * gamma * Math.pow(hs, 3) / 6 + Ka * q * hs * hs / 2), Vu = K.earth * ch * (Ka * gamma * hs * hs / 2 + Ka * q * hs);
  const AsStem = steel(Mu, dStem), AsMinStem = ratio * 1000 * input.tBot, pVcStem = phiV * oneWayShearVc(1000, dStem, fc, 1, ed) / 1e3;
  if (!isFinite(AsStem)) return stop('The stem is too thin for the moment. Increase its thickness.');
  rec.add('Stem at its base', S`Mu = ${K.earth} [Ka γ hs³ / 6 + Ka q hs² / 2];  Vu = ${K.earth} [Ka γ hs² / 2 + Ka q hs]  (horizontal component)`, S`hs = ${u(hs, LM)}`, S`Mu = ${u(Mu, MPM)},  Vu = ${u(Vu, LL)}`, 'loads.strength');
  rec.add('Stem steel', S`As from the rectangular flexure function, b = 1000 mm;  minimum ${ratio} b h`, S`d = ${u(dStem, L)};  h = ${u(input.tBot, L)}`, S`As = ${u(AsStem, APM)};  As,min = ${u(AsMinStem, APM)}`, 'slab.minSteel');
  rec.add('Stem shear', S`φVc = ${phiV} · ${C.shear.vc} √f'c · 1000 · d`, S`φVc = ${phiV} · ${C.shear.vc} · √(${si(fc, ST)}) · 1000 · ${si(dStem, L)}`, S`φVc = ${u(pVcStem, LL)};  Vu / φVc = ${dc(Vu / pVcStem)}`, 'shear.Vc');
  // heel: downward loads, upward pressure ignored
  const dBase = input.hb * 1000 - C.cover.ground - input.dbBase / 2;
  const wSoil = gamma * hs, wConc = gc * hb, wHeel = K.dead * (wSoil + wConc) + K.surcharge * q;
  let MuHeel = wHeel * heel * heel / 2;
  if (beta > 0) MuHeel += K.dead * gamma * heel * heel * Math.tan(rad(beta)) / 2 * (heel / 3);
  const AsHeel = steel(MuHeel, dBase);
  rec.add('Heel (top steel)', S`w = ${K.dead} (soil + concrete) + ${K.surcharge} surcharge, upward pressure ignored;  Mu at the back face of the stem`, S`w = ${u(wHeel, LL)} over ${u(heel, LM)};  d = ${u(dBase, L)}`, S`Mu = ${u(MuHeel, MPM)};  As = ${u(AsHeel, APM)}`, 'found.momentSection', K.heelNote);
  // toe: upward factored pressure from the service diagram, minus the toe slab
  const qAt = (x) => (e <= kern ? qmax + (qmin - qmax) * x / B : Math.max(qmax * (1 - x / (3 * xbar)), 0));
  let up = 0, mUp = 0; const n = 60;
  for (let i = 0; i < n; i++) { const x = toe * (i + 0.5) / n, f = K.earth * qAt(x) * toe / n; up += f; mUp += f * (toe - x); }
  const MuToe = Math.max(mUp - K.toeDead * wConc * toe * toe / 2, 0), xs = Math.max(toe - dBase / 1000, 0);
  let VuToe = 0; for (let i = 0; i < n; i++) { const x = xs * (i + 0.5) / n; VuToe += K.earth * qAt(x) * xs / n; } VuToe = Math.max(VuToe - K.toeDead * wConc * xs, 0);
  const AsToe = steel(MuToe, dBase), pVcBase = phiV * oneWayShearVc(1000, dBase, fc, 1, ed) / 1e3;
  rec.add('Toe (bottom steel)', S`upward ${K.earth} × service pressure, minus ${K.toeDead} × toe slab weight;  Mu at the front face of the stem;  shear at d from the face`, S`Mu = ${u(MuToe, MPM)};  Vu = ${u(VuToe, LL)};  φVc = ${u(pVcBase, LL)}`, S`As = ${u(AsToe, APM)}`, 'found.momentSection');
  if (!isFinite(AsHeel) || !isFinite(AsToe)) return stop('The base is too thin for the moments. Increase its thickness.');
  const AsMinBase = ratio * 1000 * input.hb * 1000;
  const hk = ldHook({ db: input.dbStem, fy, fc, lambda: 1 }, ed), availHook = input.hb * 1000 - C.cover.ground;
  rec.add('Anchorage of the stem bars in the base', S`hooked bars: ℓdh against base thickness − cover`, S`ℓdh = ${u(hk.ldh, L)};  available = ${u(availHook, L)}`, [hk.ldh <= availHook ? 'The hooked stem bars develop within the base.' : 'Not enough depth: thicken the base or use smaller stem bars.'], 'dev.hook');
  if (input.AsProv > 0) out.checks.push(check('Stem flexure', ['As required', Math.max(AsStem, AsMinStem), APM], ['As provided', input.AsProv, APM], Math.max(AsStem, AsMinStem) / input.AsProv, 'slab.minSteel'));
  else out.notes.push('Enter the stem steel provided to check it against the required area.');
  out.checks.push(check('Stem shear', ['Vu', Vu, LL], ['φVc', pVcStem, LL], Vu / pVcStem, 'shear.Vc'));
  out.checks.push(check('Toe shear', ['Vu', VuToe, LL], ['φVc', pVcBase, LL], VuToe / pVcBase, 'found.shearSection'));
  out.checks.push(check('Stem bar anchorage', ['ℓdh', hk.ldh, L], ['available', availHook, L], hk.ldh / availHook, 'dev.hook'));
  Object.assign(vals, { MuStem: Mu, VuStem: Vu, AsStem, AsMinStem, MuHeel, AsHeel, MuToe, VuToe, AsToe, AsMinBase, ldh: hk.ldh });
  out.results = [res('Stem Mu', Mu, MPM), res('Stem As', Math.max(AsStem, AsMinStem), APM), res('Heel As (top)', Math.max(AsHeel, AsMinBase), APM), res('Toe As (bottom)', Math.max(AsToe, AsMinBase), APM)];
  return done();
}
