// Wall footing, per metre of wall. Pure calculation.
// Units: kN/m, kPa, m for B and Df; mm for h, d, wall thickness and bars; MPa.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings, roundUp, roundDown } from '../rc/common.js';
import { oneWayShearVc } from '../rc/shear-torsion.calc.js';
import { netAllowable, footingSteel } from './common.js';
import { factoredGravity } from './isolated.calc.js';

const LM = 'length_m', L = 'length_mm', PR = 'pressure', LL = 'lineload', MPM = 'moment_per_m', APM = 'area_per_m', ST = 'stress';
const STRIP = 1000;

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, FD = ed.found, phiV = C.phi.shear, cover = C.cover.ground, G = ed.loads.gravity;
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  if (!positive(input, ['t', 'qa', 'fc', 'fy', 'h', 'db', 'dbl']) || !(input.wD >= 0) || !(input.wL >= 0) || !(input.wD + input.wL > 0)) return stop('The loads, wall thickness, soil pressure, strengths and thickness need positive numbers.');
  if (!input.qaNet && (!positive(input, ['gammaC', 'gammaS']) || !(input.Df > 0))) return stop('Give the depth of the footing base and the unit weights of concrete and soil.');
  if (!input.qaNet && input.Df * 1000 < input.h) return stop('The depth of the base Df cannot be less than the footing thickness h.');
  const { wD, wL, t, fc, fy, h, db, dbl } = input, masonry = input.wallType === 'masonry', w = wD + wL;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  out.diagram = { t, h, masonry, chips: [S`${masonry ? 'masonry' : 'concrete'} wall, t = ${u(t, L)}`, S`h = ${u(h, L)}, ${db} mm bars`] };
  const na = netAllowable(input), qe = na.qe;
  if (input.qaNet) rec.add('Net allowable soil pressure', S`qe = qa (given as net)`, null, S`qe = ${u(qe, PR)}`, 'found.baseArea');
  else rec.add('Net allowable soil pressure', S`qe = qa − γc · h − γs (Df − h)`, S`qe = ${v(input.qa, PR)} − ${v(input.gammaC, 'unitweight')} · ${v(h / 1000, LM)} − ${v(input.gammaS, 'unitweight')} (${v(input.Df, LM)} − ${v(h / 1000, LM)})`, S`qe = ${u(qe, PR)}`, 'found.baseArea');
  vals.qe = qe;
  if (!(qe > 0)) return stop('The weight of the footing and soil uses up the whole allowable pressure. Check qa, Df and h.');
  const Bc = w / qe, B = roundUp(Bc, FD.roundUp);
  rec.add('Footing width', S`B = (wD + wL) / qe, rounded up to ${u(FD.roundUp, LM)}`, S`B = (${v(wD, LL)} + ${v(wL, LL)}) / ${v(qe, PR)} = ${u(Bc, LM)}`, S`Use B = ${u(B, LM)}`, 'found.baseArea');
  if (B * 1000 <= t) return stop('The footing must be wider than the wall.');
  const fg = factoredGravity(wD, wL, ed), wu = fg.value, qu = wu / B;
  rec.add('Factored load and pressure', S`wu = greater of ${G.D1} wD and ${G.D} wD + ${G.L} wL;  qu = wu / B`, S`wu = greater of ${v(fg.a, LL)} and ${v(fg.b, LL)} = ${u(wu, LL)}`, S`qu = ${v(wu, LL)} / ${v(B, LM)} = ${u(qu, PR)}`, 'loads.strength');
  const d = h - cover - db / 2;
  rec.add('Effective depth', S`d = h − ${u(cover, L)} cover − db / 2  (one layer of main bars)`, S`d = ${v(h, L)} − ${v(cover, L)} − ${v(db, L)} / 2`, S`d = ${u(d, L)}  (minimum ${u(C.footing.dMin, L)})`, 'found.minEffDepth');
  Object.assign(vals, { Bcalc: Bc, B, wu, qu, d });
  Object.assign(out.diagram, { B, d });
  if (d < C.footing.dMin) return stop('The effective depth is below the ' + C.footing.dMin + ' mm minimum for footings. Increase the thickness h.');
  const proj = (B - t / 1000) / 2, armV = Math.max(proj - d / 1000, 0), Vu = qu * armV, pVc = phiV * oneWayShearVc(STRIP, d, fc, 1, ed) / 1e3;
  rec.add('One-way shear at d from the wall face', S`Vu = qu ((B − t) / 2 − d);  φVc = ${phiV} · ${C.shear.vc} √f'c · 1000 · d`, S`Vu = ${v(qu, PR)} · ${v(armV, LM)};  φVc = ${phiV} · ${C.shear.vc} · √(${si(fc, ST)}) · 1000 · ${si(d, L)}`, S`Vu = ${u(Vu, LL)},  φVc = ${u(pVc, LL)},  D/C = ${dc(Vu / pVc)}`, 'found.shearSection');
  const arm = proj + (masonry ? t / 4000 : 0), Mu = qu * arm * arm / 2;
  rec.add('Moment at the critical section', masonry ? S`cantilever = (B − t) / 2 + t / 4;  Mu = qu · cantilever² / 2` : S`cantilever = (B − t) / 2;  Mu = qu · cantilever² / 2`, S`cantilever = ${u(arm, LM)};  Mu = ${v(qu, PR)} · ${v(arm, LM)}² / 2`, S`Mu = ${u(Mu, MPM)}`, 'found.momentSection',
    masonry ? 'Masonry wall: the critical section is halfway between the middle and the edge of the wall.' : 'Concrete wall: the critical section is at the face of the wall.');
  const fs = footingSteel(Mu, STRIP, d, h, fc, fy, ed);
  if (!fs.ok) return stop('The footing is too thin for the bending moment. Increase the thickness h.');
  const Ab = barArea(1, db), SP = C.slabSpacing.main, sMax = Math.min(SP.timesH * h, SP.max), sCalc = STRIP * Ab / fs.AsUse, sPrac = roundDown(Math.min(sCalc, sMax), C.shear.practical);
  if (sPrac < C.shear.practical) return stop('The main bars would be closer than ' + C.shear.practical + ' mm. Use a larger bar or a thicker footing.');
  rec.add('Main (transverse) steel', S`Rn = Mu / (${fs.phi} · 1000 · d²);  As = ρ · 1000 · d;  As,min = ${fs.ratio} · 1000 · h;  s = 1000 · Ab / As`, S`Rn = ${u(fs.Rn, ST)};  ρ = ${fs.rho};  As = ${u(fs.As, APM)};  As,min = ${u(fs.AsMin, APM)}`,
    S`As to use = ${u(fs.AsUse, APM)}:  ${db} mm bars at ${u(sCalc, L)}, use ${u(sPrac, L)} (maximum ${u(sMax, L)})`, 'slab.minSteel');
  const AsLong = fs.ratio * B * 1000 * h, nLong = Math.max(2, Math.ceil(AsLong / barArea(1, dbl) - 1e-9));
  rec.add('Longitudinal shrinkage and temperature steel', S`As = ${fs.ratio} · B · h  (total over the footing width)`, S`As = ${fs.ratio} · ${v(B * 1000, L)} · ${v(h, L)}`, S`As = ${u(AsLong, 'area')}:  ${nLong} - ${dbl} mm bars`, 'slab.tempSteel');
  const qs = w / B, AsProv = STRIP * Ab / sPrac;
  Object.assign(vals, { Vu, phiVc: pVc, dcShear: Vu / pVc, Mu, Rn: fs.Rn, AsReq: fs.As, AsMin: fs.AsMin, AsUse: fs.AsUse, sCalc, sPractical: sPrac, AsLong, nLong });
  out.checks.push(check('Soil pressure', ['service pressure', qs, PR], ['qe', qe, PR], qs / qe, 'found.baseArea'));
  out.checks.push(check('One-way shear', ['Vu', Vu, LL], ['φVc', pVc, LL], Vu / pVc, 'found.shearSection'));
  out.checks.push(check('Flexure', ['As required', fs.AsUse, APM], ['As provided', AsProv, APM], fs.AsUse / AsProv, 'found.momentSection'));
  out.results = [res('B', B, LM), res('qu', qu, PR), res('d', d, L), res('Mu', Mu, MPM), res('As', fs.AsUse, APM), res('Main bars: ' + db + ' mm at', sPrac, L), res('Longitudinal bars', nLong + ' - ' + dbl + ' mm', 'text')];
  Object.assign(out.diagram, { s: sPrac, nLong, qu });
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}
