// Ordinary cast-in-place structural walls: in-plane shear, axial load and flexure, minimum steel. Pure calculation.
// Units: mm, mm², MPa, kN, kN·m; the simplified axial strength is per strip of the given length.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings, roundDown } from './common.js';
import { oneWayShearVc, sqrtFc } from './shear-torsion.calc.js';
import { namedPoints, interactionCurve, capacityAtEccentricity, axialCapacity } from './rcSection.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force', M = 'moment';

export function wallMinRatios(db, fy, ed) {
  const T = ed.concrete.wall.minSteel;
  return db <= T.smallMax && fy >= T.fyMin ? T.small : T.other;
}
export function wallSpacingLimit(h, lw, shearSteel, ed) {
  const W = ed.concrete.wall.spacing;
  return Math.min(W.timesH * h, W.max, shearSteel ? lw / W.lwDiv : Infinity);
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, W = C.wall, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  out.notes.push(W.scopeNote);
  const mode = input.mode || 'shear';

  if (mode === 'axial' && input.method !== 'interaction') {
    const K = W.simplified;
    if (!positive(input, ['h', 'strip', 'lc', 'k', 'fc'])) return stop('Give the thickness, strip length, ℓc, k and f\'c.');
    const { h, strip, lc, k, fc } = input, Ag = h * strip;
    const r = k * lc / (K.div * h), Pn = K.k * fc * Ag * (1 - r * r) / 1e3, pPn = K.phi * Pn;
    if (!(1 - r * r > 0)) return stop('The wall is too slender for the simplified method.');
    rec.add('Simplified axial strength', S`Pn = ${K.k} f'c Ag [1 − (k ℓc / (${K.div} h))²];  φ = ${K.phi}`, S`Pn = ${K.k} · ${v(fc, ST)} · ${v(Ag, A)} [1 − (${k} · ${v(lc, L)} / (${K.div} · ${v(h, L)}))²]`,
      S`Pn = ${u(Pn, F)};  φPn = ${u(pPn, F)}  (per ${u(strip, L)} of wall)`, 'sw.simplified', 'k from ' + ed.clauses['sw.k'].nscp + '. The factored resultant must lie within the middle third of the thickness.');
    const lu = input.lu > 0 ? Math.min(input.lu, lc) : lc, hMin = Math.max(W.hMin.min, lu / W.hMin.div);
    rec.add('Minimum thickness of a bearing wall', S`h ≥ greater of ${u(W.hMin.min, L)} and 1/${W.hMin.div} of the lesser of the unsupported length and height`, S`lesser = ${u(lu, L)}`, S`h,min = ${u(hMin, L)}`, 'sw.hMin');
    Object.assign(vals, { Pn, phiPn: pPn, hMin });
    if (input.e > h / K.eDiv) return stop('The eccentricity is more than h/6, so the simplified method does not apply. Use the interaction method.');
    if (input.Pu > 0) out.checks.push(check('Axial strength', ['Pu', input.Pu, F], ['φPn', pPn, F], input.Pu / pPn, 'sw.phi'));
    out.checks.push(check('Minimum thickness', ['h,min', hMin, L], ['h', h, L], hMin / h, 'sw.hMin'));
    out.results = [res('Pn', Pn, F), res('φPn', pPn, F), res('h,min', hMin, L)];
    out.diagram = { kind: 'strip', h, lc, chips: [S`h = ${u(h, L)}`, S`ℓc = ${u(lc, L)}, k = ${k}`] };
    return done();
  }

  if (!positive(input, ['h', 'lw', 'fc', 'fy'])) return stop('Give the wall thickness, length and strengths.');
  const { h, lw, fc, fy } = input, curt = input.curtains > 0 ? Math.round(input.curtains) : 1;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  if (h > W.twoCurtains && curt < 2) out.warnings.push('Walls thicker than ' + W.twoCurtains + ' mm need two curtains of reinforcement (' + ed.clauses['sw.curtains'].nscp + ').');

  if (mode === 'axial') {
    if (!positive(input, ['dbV', 'sV', 'cover'])) return stop('Give the vertical bar size, spacing and cover.');
    const Ab = barArea(1, input.dbV) * curt, first = input.cover + input.dbV / 2, layers = [];
    for (let x = first; x <= lw - first + 1e-6; x += input.sV) layers.push({ d: x, As: Ab });
    if (layers.length < 2) return stop('The spacing is too large for this wall length.');
    const sec = { b: h, h: lw, fc, fy, layers, spiral: false };
    const np = namedPoints(sec, ed), cv = interactionCurve(sec, ed), ax = axialCapacity(sec, ed);
    rec.add('Vertical bars as layers', S`layers at spacing s along the length, each with ${curt} bar${curt > 1 ? 's' : ''} (one per curtain)`, S`${layers.length} layers of ${u(Ab, A)}`, S`Ast = ${u(layers.length * Ab, A)}`, 'basic.section');
    rec.add('In-plane interaction diagram', S`the column engine with b = h (thickness) and depth = ℓw`, S`φPn,max = ${u(ax.phiPnMax / 1e3, F)};  balanced φMn = ${u(np.balanced.phiMn / 1e6, M)};  pure bending φMn = ${u(np.pureBending.phiMn / 1e6, M)}`, null, 'col.strain');
    vals.phiPnMax = ax.phiPnMax / 1e3; vals.phiMnPB = np.pureBending.phiMn / 1e6;
    let dem = null;
    if (input.Pu > 0 && input.Mu >= 0) {
      const e = input.Mu * 1e3 / input.Pu, cap = e > 1e-6 ? capacityAtEccentricity(sec, e, ed) : { phiPn: ax.phiPnMax, phiMn: 0, c: Infinity };
      rec.add('Capacity at the demand eccentricity', S`e = Mu / Pu;  φPn(e) ≤ φPn,max`, S`e = ${u(e, L)}`, S`φPn = ${u(cap.phiPn / 1e3, F)};  D/C = ${dc(input.Pu * 1e3 / cap.phiPn)}`, 'col.strain');
      out.checks.push(check('Combined axial and in-plane bending', ['Pu', input.Pu, F], ['φPn(e)', cap.phiPn / 1e3, F], input.Pu * 1e3 / cap.phiPn, 'col.strain'));
      vals.phiPnE = cap.phiPn / 1e3; dem = { P: input.Pu, M: input.Mu };
    }
    out.results = [res('φPn,max', ax.phiPnMax / 1e3, F), res('Pure bending φMn', np.pureBending.phiMn / 1e6, M), res('Layers', layers.length, 'count')];
    out.diagram = { kind: 'interaction', curve: { nominal: cv.nominal.map((p) => [p[0] / 1e6, p[1] / 1e3]), design: cv.design.map((p) => [p[0] / 1e6, p[1] / 1e3]) }, demand: dem, chips: [S`h × ℓw = ${v(h, L)} × ${u(lw, L)}`] };
    return done();
  }

  if (!positive(input, ['dbH'])) return stop('Give the horizontal bar size.');
  const dbV = input.dbV > 0 ? input.dbV : input.dbH;
  if (mode === 'minimum') {
    const rH = wallMinRatios(input.dbH, fy, ed), rV = wallMinRatios(dbV, fy, ed), sLim = wallSpacingLimit(h, lw, false, ed);
    const sT = curt * barArea(1, input.dbH) / (rH.rhoT * h), sL = curt * barArea(1, dbV) / (rV.rhoL * h);
    rec.add('Minimum reinforcement ratios', S`deformed bars ${u(W.minSteel.smallMax, L)} and smaller with fy ≥ ${u(W.minSteel.fyMin, ST)}: ρℓ = ${W.minSteel.small.rhoL}, ρt = ${W.minSteel.small.rhoT};  otherwise ρℓ = ${W.minSteel.other.rhoL}, ρt = ${W.minSteel.other.rhoT}`,
      S`horizontal ${input.dbH} mm, vertical ${dbV} mm`, S`ρt = ${rH.rhoT},  ρℓ = ${rV.rhoL}`, 'sw.minSteel');
    rec.add('Bar spacing', S`s = curtains × Ab / (ρ h);  s ≤ lesser of ${W.spacing.timesH} h and ${u(W.spacing.max, L)}`, S`horizontal: ${u(sT, L)};  vertical: ${u(sL, L)};  limit ${u(sLim, L)}`,
      S`horizontal ${input.dbH} mm at ${u(roundDown(Math.min(sT, sLim), C.shear.practical), L)};  vertical ${dbV} mm at ${u(roundDown(Math.min(sL, sLim), C.shear.practical), L)}`, 'sw.spacingT');
    Object.assign(vals, { rhoT: rH.rhoT, rhoL: rV.rhoL, sT, sL, sLim });
    out.results = [res('ρt', rH.rhoT), res('ρℓ', rV.rhoL), res('Horizontal spacing', Math.min(sT, sLim), L), res('Vertical spacing', Math.min(sL, sLim), L)];
    out.diagram = { kind: 'elev', lw, hw: input.hw, sT: Math.min(sT, sLim), sL: Math.min(sL, sLim), chips: [S`h = ${u(h, L)}`, [curt + ' curtain' + (curt > 1 ? 's' : '')]] };
    return done();
  }

  // In-plane shear
  if (!positive(input, ['hw', 'lambda']) || !(input.Vu > 0)) return stop('Give the wall height, λ and the factored shear.');
  const phi = C.phi.shear, d = W.dFactor * lw, Vu = input.Vu;
  const Vc = oneWayShearVc(h, d, fc, input.lambda, ed) / 1e3, pVc = phi * Vc, VnMax = W.vnMax * sqrtFc(fc, ed) * h * d / 1e3;
  rec.add('Effective depth', S`d = ${W.dFactor} ℓw`, S`d = ${W.dFactor} · ${v(lw, L)}`, S`d = ${u(d, L)}`, 'sw.d');
  rec.add('Shear strength of concrete', S`Vc = ${C.shear.vc} λ √f'c h d  (wall in axial compression);  φ = ${phi}`, S`Vc = ${C.shear.vc} · ${input.lambda} · √(${si(fc, ST)}) · ${si(h, L)} · ${si(d, L)}`, S`Vc = ${u(Vc, F)},  φVc = ${u(pVc, F)}`, 'sw.Vc', 'The axial load is used only for this note: Vc is for walls in axial compression.');
  rec.add('Upper limit on Vn', S`Vn ≤ ${W.vnMax} √f'c h d`, S`${W.vnMax} · √(${si(fc, ST)}) · ${si(h, L)} · ${si(d, L)}`, S`Vn,max = ${u(VnMax, F)};  Vu / φ = ${u(Vu / phi, F)}`, 'sw.vnMax');
  Object.assign(vals, { d, Vc, phiVc: pVc, VnMax });
  if (Vu / phi > VnMax) return stop('Wall section too small for shear.');
  const Av = curt * barArea(1, input.dbH);
  if (Vu <= C.shear.minAbove * pVc) {
    out.notes.push('Vu ≤ 0.5 φVc: the minimum reinforcement of ' + ed.clauses['sw.minSteel'].nscp + ' applies. Use the Minimum steel mode.');
    out.checks.push(check('Section limit', ['Vu/φ', Vu / phi, F], ['Vn,max', VnMax, F], Vu / phi / VnMax, 'sw.vnMax'));
    out.results = [res('d', d, L), res('φVc', pVc, F), res('Vn,max', VnMax, F)];
    out.diagram = { kind: 'elev', lw, hw: input.hw, chips: [S`h = ${u(h, L)}`] };
    return done();
  }
  const VsReq = Math.max(Vu / phi - Vc, 0), sStr = VsReq > 0 ? Av * fy * d / (VsReq * 1e3) : Infinity, sRho = Av / (W.rhoT * h), sLim = wallSpacingLimit(h, lw, true, ed);
  rec.add('Required shear reinforcement', S`Vs = Vu / φ − Vc;  Av = horizontal bars in all curtains at one level;  s = Av fy d / Vs`, S`Vs = ${u(VsReq, F)};  Av = ${u(Av, A)}`, VsReq > 0 ? S`s = ${u(sStr, L)}` : ['Vu ≤ φVc: no shear reinforcement needed for strength.'], 'sw.Vs');
  rec.add('Minimum horizontal ratio', S`ρt ≥ ${W.rhoT}:  s ≤ Av / (${W.rhoT} h)`, S`s ≤ ${v(Av, A)} / (${W.rhoT} · ${v(h, L)})`, S`s = ${u(sRho, L)}`, 'sw.rho');
  rec.add('Spacing limit', S`lesser of ${W.spacing.timesH} h, ${u(W.spacing.max, L)} and ℓw / ${W.spacing.lwDiv} (as printed in NSCP 2015 for both bar directions)`, S`${u(W.spacing.timesH * h, L)}, ${u(W.spacing.max, L)}, ${u(lw / W.spacing.lwDiv, L)}`, S`s,max = ${u(sLim, L)}`, 'sw.spacingT');
  const sUse = Math.min(sStr, sRho, sLim), sPrac = input.s > 0 ? input.s : roundDown(sUse, C.shear.practical);
  const rhoT = Av / (h * sPrac), rhoL = Math.max(W.rhoLBase, W.rhoLBase + W.rhoLk * (W.hwRatio - input.hw / lw) * (rhoT - W.rhoT)), Vs = Av * fy * d / sPrac / 1e3, pVn = phi * (Vc + Vs);
  rec.add('Spacing used and the resulting ratios', S`s used = ${input.s > 0 ? 'typed' : 'least of the three, rounded down'};  ρt = Av / (h s);  ρℓ = ${W.rhoLBase} + ${W.rhoLk} (${W.hwRatio} − hw / ℓw)(ρt − ${W.rhoT}) ≥ ${W.rhoLBase}`,
    S`s = ${u(sPrac, L)};  ρt = ${rhoT}`, S`ρℓ,min = ${rhoL};  φVn = ${phi} (${v(Vc, F)} + ${v(Vs, F)}) = ${u(pVn, F)}`, 'sw.rho', 'ρℓ need not exceed the ρt required for strength.');
  out.checks.push(check('Section limit', ['Vu/φ', Vu / phi, F], ['Vn,max', VnMax, F], Vu / phi / VnMax, 'sw.vnMax'));
  out.checks.push(check('Shear strength', ['Vu', Vu, F], ['φVn', pVn, F], Vu / pVn, 'sw.Vs'));
  if (input.s > 0) out.checks.push(check('Horizontal bar spacing', ['s', input.s, L], ['allowed', sUse, L], input.s / sUse, 'sw.spacingT'));
  Object.assign(vals, { VsReq, Av, sStrength: sStr, sRho, sMax: sLim, sUse, sPractical: sPrac, rhoTAt: rhoT, rhoLMin: rhoL, phiVn: pVn });
  out.results = [res('φVc', pVc, F), res('Vs required', VsReq, F), res('s to use', sPrac, L), res('ρt', rhoT), res('ρℓ,min', rhoL), res('φVn', pVn, F)];
  out.diagram = { kind: 'elev', lw, hw: input.hw, sT: sPrac, chips: [S`h × ℓw = ${v(h, L)} × ${u(lw, L)}`, [curt + ' curtain' + (curt > 1 ? 's' : '')]] };
  return done();
}
