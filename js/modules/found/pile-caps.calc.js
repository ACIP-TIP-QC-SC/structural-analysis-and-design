// Pile caps: reactions of a rigid cap on a rectangular pile pattern, shear and flexure. Pure calculation.
// Units: m for the pile pattern and cap plan; mm for h, d, column, pile size and bars; kN, kN·m, MPa.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings } from '../rc/common.js';
import { requiredSteelRect } from '../rc/beam-flexure.calc.js';
import { oneWayShearVc } from '../rc/shear-torsion.calc.js';
import { twoWayVc } from './common.js';
import { ldSimplified, ldHook } from '../rc/devLength.js';

const LM = 'length_m', L = 'length_mm', F = 'force', M = 'moment', A = 'area', ST = 'stress';
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Pile coordinates (m) from the cap centre.
export function pilePattern(n1, n2, sx, sy) {
  const pts = [];
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) pts.push({ x: (i - (n1 - 1) / 2) * sx, y: (j - (n2 - 1) / 2) * sy });
  return pts;
}
// Reactions R = P/n ± My x / Σx² ± Mx y / Σy².
export function pileReactions(pts, P, Mx, My) {
  const n = pts.length, sx2 = pts.reduce((t, p) => t + p.x * p.x, 0), sy2 = pts.reduce((t, p) => t + p.y * p.y, 0);
  return { sx2, sy2, R: pts.map((p) => P / n + (sx2 > 0 ? My * p.x / sx2 : 0) + (sy2 > 0 ? Mx * p.y / sy2 : 0)) };
}
// Fraction of a pile reaction counted as shear on a section, from the distance of the pile centre outside the section (m).
export const shearFraction = (outside, dp) => clamp01((outside + dp / 2) / dp);

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, K = ed.found.pileCap, mode = input.mode || 'reactions', vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  if (!positive(input, ['n1', 'n2', 'dp', 'B', 'Lc', 'c1', 'c2', 'Pu']) || (input.n1 > 1 && !(input.sx > 0)) || (input.n2 > 1 && !(input.sy > 0))) return stop('Give the pile pattern, pile size, cap plan, column and the factored load.');
  const n1 = Math.round(input.n1), n2 = Math.round(input.n2), pts = pilePattern(n1, n2, input.sx || 0, input.sy || 0), dp = input.dp / 1000, round = input.pileShape !== 'square';
  const { B, Lc } = input;
  if (pts.some((p) => Math.abs(p.x) + dp / 2 > B / 2 + 1e-9 || Math.abs(p.y) + dp / 2 > Lc / 2 + 1e-9)) return stop('Every pile must lie within the cap.');
  out.diagram = { pts, B, Lc, dp, c1: input.c1, c2: input.c2, chips: [[n1 + ' × ' + n2 + ' piles'], S`cap ${v(B, LM)} × ${u(Lc, LM)}`] };
  // Reactions
  const fac = pileReactions(pts, input.Pu, input.Mux || 0, input.Muy || 0), Ru = fac.R;
  rec.add('Factored pile reactions', S`Ri = Pu / n ± My xi / Σx² ± Mx yi / Σy²`, S`n = ${pts.length};  Σx² = ${v(fac.sx2, 'area_m2')}, Σy² = ${v(fac.sy2, 'area_m2')}`, S`Ri from ${u(Math.min(...Ru), F)} to ${u(Math.max(...Ru), F)}`, 'pc.reactions', 'Pile reactions may be taken as concentrated at the pile centres.');
  if (Math.min(...Ru) < 0) return stop('A pile is in tension under the factored loads. Change the pile layout or the cap.');
  Object.assign(vals, { Rhi: Math.max(...Ru), Rlo: Math.min(...Ru) });
  out.diagram.R = Ru;
  if (mode === 'reactions') {
    if (input.P > 0) {
      const sv = pileReactions(pts, input.P, input.Mx || 0, input.My || 0).R, smax = Math.max(...sv);
      rec.add('Service pile reactions', S`same formula with service loads`, null, S`Ri from ${u(Math.min(...sv), F)} to ${u(smax, F)}`, 'pc.number', 'The number of piles is set from unfactored loads.');
      if (Math.min(...sv) < 0) return stop('A pile is in tension under the service loads.');
      if (input.Qa > 0) out.checks.push(check('Pile load (service)', ['R max', smax, F], ['Qall', input.Qa, F], smax / input.Qa, 'pc.number'));
      Object.assign(vals, { Rservice: smax });
    } else out.notes.push('Enter the service load to check the piles against their allowable load.');
    out.results = [res('Factored R max', vals.Rhi, F), res('Factored R min', vals.Rlo, F)];
    if (vals.Rservice) out.results.push(res('Service R max', vals.Rservice, F));
    out.diagram.tables = [{ title: 'Factored pile reactions', head: ['Pile', 'x', 'y', 'Ru'], rows: pts.map((p, i) => ({ cells: ['Pile ' + (i + 1), u(p.x, LM), u(p.y, LM), u(Ru[i], F)] })) }];
    return done();
  }
  if (!positive(input, ['h', 'd', 'fc', 'fy', 'lambda'])) return stop('Give the cap thickness, effective depth and strengths.');
  const { h, d, fc, fy, lambda } = input, dm = d / 1000, c1 = input.c1 / 1000, c2 = input.c2 / 1000;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  if (d >= h) return stop('The effective depth must be less than the cap thickness.');
  out.checks.push(check('Effective depth', ['minimum', K.dMin, L], ['d', d, L], K.dMin / d, 'pc.dMin'));

  if (mode === 'shear') {
    const phi = C.phi.shear;
    // One-way shear, both directions and both sides.
    const cand = [];
    [['x', c1, Lc], ['y', c2, B]].forEach(([ax, c, width]) => [1, -1].forEach((sg) => {
      const sec = c / 2 + dm;
      let Vu = 0, fr = 0;
      pts.forEach((p, i) => { const t = (ax === 'x' ? p.x : p.y) * sg; if (t > 0) { const f = shearFraction(t - sec, dp); Vu += f * Ru[i]; fr = Math.max(fr, f); } });
      cand.push({ ax, sec, Vu, fr, width });
    }));
    const one = cand.reduce((m, c) => (c.Vu > m.Vu ? c : m), cand[0]), pVc1 = phi * oneWayShearVc(one.width * 1000, d, fc, lambda, ed) / 1e3;
    rec.add('One-way shear at d from the column face', S`share of a pile reaction counted: all when its centre is dpile/2 or more outside the section, none when dpile/2 or more inside, linear between`,
      S`section at ${u(one.sec, LM)} from the centre (${one.ax} direction);  fraction of the nearest piles = ${one.fr}`, S`Vu = ${u(one.Vu, F)};  φVc = ${phi} · ${C.shear.vc} λ √f'c · ${si(one.width * 1000, L)} · ${si(d, L)} = ${u(pVc1, F)}`, 'pc.shear');
    out.checks.push(check('One-way shear', ['Vu', one.Vu, F], ['φVc', pVc1, F], one.Vu / pVc1, 'found.shearSection'));
    // Two-way shear around the column.
    const b1 = c1 + dm, b2 = c2 + dm;
    let Vu2 = 0, fr2 = 0, dist2 = 0;
    pts.forEach((p, i) => { const o = Math.max(Math.abs(p.x) - b1 / 2, Math.abs(p.y) - b2 / 2), f = shearFraction(o, dp); Vu2 += f * Ru[i]; if (f > fr2) { fr2 = f; dist2 = o; } });
    const bo = 2 * (b1 + b2) * 1000, beta = Math.max(c1, c2) / Math.min(c1, c2), tw = twoWayVc(fc, beta, C.twoWay.alpha.interior, d, bo, lambda, ed), pVc2 = phi * tw.vc * bo * d / 1e3;
    rec.add('Two-way shear around the column', S`critical section at d/2;  outside distance of a pile = larger of |x| − b1/2 and |y| − b2/2`, S`b1 = ${u(b1, LM)}, b2 = ${u(b2, LM)};  outside distance ${u(dist2, LM)} → fraction ${fr2};  bo = ${u(bo, L)}`,
      S`Vu = ${u(Vu2, F)};  vc = ${u(tw.vc, ST)};  φVc = ${u(pVc2, F)}`, 'found.twoWayVc');
    out.checks.push(check('Two-way shear at the column', ['Vu', Vu2, F], ['φVc', pVc2, F], Vu2 / pVc2, 'found.twoWayVc'));
    // Punching around the most heavily loaded pile.
    const iMax = Ru.indexOf(Math.max(...Ru)), pb = round ? Math.PI * (input.dp + d) : 4 * (input.dp + d), twp = twoWayVc(fc, 1, C.twoWay.alpha.interior, d, pb, lambda, ed), pVcP = phi * twp.vc * pb * d / 1e3;
    const pm = pts[iMax], edge = Math.min(B / 2 - Math.abs(pm.x), Lc / 2 - Math.abs(pm.y)), rad = (dp + dm) / 2;
    rec.add('Two-way shear around the most heavily loaded pile', round ? S`bo = π (dpile + d), full perimeter` : S`bo = 4 (dpile + d), full perimeter`, S`bo = ${u(pb, L)};  vc = ${u(twp.vc, ST)}`, S`φVc = ${u(pVcP, F)} against Ru = ${u(Ru[iMax], F)}`, 'found.twoWaySection',
      rad > edge ? 'The perimeter extends beyond the cap edge (see the warning).' : '');
    if (rad > edge) out.warnings.push(K.edgeWarning);
    out.checks.push(check('Two-way shear at the pile', ['Ru', Ru[iMax], F], ['φVc', pVcP, F], Ru[iMax] / pVcP, 'found.twoWayVc'));
    Object.assign(vals, { oneFrac: one.fr, Vu1: one.Vu, phiVc1: pVc1, twoFrac: fr2, twoDist: dist2, Vu2, bo, phiVc2: pVc2, pileBo: pb, phiVcPile: pVcP, edgeWarning: rad > edge });
    out.results = [res('Vu one-way', one.Vu, F), res('φVc one-way', pVc1, F), res('Vu two-way', Vu2, F), res('φVc two-way', pVc2, F), res('φVc at the pile', pVcP, F)];
    Object.assign(out.diagram, { d: dm, oneSec: one.sec, b1, b2 });
    return done();
  }

  // Flexure at the column faces, both directions; the larger moment per direction governs.
  const flex = (ax, c, width) => {
    let best = null;
    [1, -1].forEach((sg) => {
      let Mu = 0;
      pts.forEach((p, i) => { const t = (ax === 'x' ? p.x : p.y) * sg - c / 2; if (t > 0) Mu += Ru[i] * t; });
      if (!best || Mu > best.Mu) best = { Mu, sg };
    });
    const r = best.Mu > 0 ? requiredSteelRect({ b: width * 1000, d, fc, fy, Mu: best.Mu * 1e6 }, ed) : { ok: true, As: 0 };
    return { Mu: best.Mu, As: r.ok ? r.As : NaN, AsMin: C.AsMinSlabRatio(fy) * width * 1000 * h };
  };
  const fx = flex('x', c1, Lc), fy2 = flex('y', c2, B);
  if (!isFinite(fx.As) || !isFinite(fy2.As)) return stop('The cap is too thin for the moments. Increase d.');
  rec.add('Moment at the column face, bars along x', S`Mu = Σ Ri × (distance from the pile centre to the face), piles beyond the face`, S`face at ${u(c1 / 2, LM)} from the centre`, S`Mu = ${u(fx.Mu, M)};  As = ${u(fx.As, A)};  As,min = ${u(fx.AsMin, A)}`, 'found.momentSection');
  rec.add('Moment at the column face, bars along y', S`same, in the other direction`, S`face at ${u(c2 / 2, LM)} from the centre`, S`Mu = ${u(fy2.Mu, M)};  As = ${u(fy2.As, A)};  As,min = ${u(fy2.AsMin, A)}`, 'found.momentSection');
  const db = input.db, avail = (B / 2 - c1 / 2) * 1000 - C.cover.ground, ld = Math.max(ldSimplified({ db, fy, fc, lambda, favourable: true }, ed).ld, C.dev.ldMin);
  const hook = ldHook({ db, fy, fc, lambda }, ed).ldh, needHook = ld > avail;
  rec.add('Development of the bottom bars', S`straight length from the column face to the cap edge less cover;  ℓd by the simplified method (favourable case)`, S`available = ${u(avail, L)};  ℓd = ${u(ld, L)}`,
    needHook ? S`not enough for a straight bar: use standard hooks, ℓdh = ${u(hook, L)}` : S`straight bars develop`, needHook ? 'dev.hook' : 'dev.tension.simple');
  out.checks.push(check('Bar development', ['required', needHook ? hook : ld, L], ['available', avail, L], (needHook ? hook : ld) / avail, needHook ? 'dev.hook' : 'dev.tension.simple'));
  const nx = Math.max(2, Math.ceil(Math.max(fx.As, fx.AsMin) / barArea(1, db) - 1e-9)), ny = Math.max(2, Math.ceil(Math.max(fy2.As, fy2.AsMin) / barArea(1, db) - 1e-9));
  Object.assign(vals, { Mu: fx.Mu, As: fx.As, AsMin: fx.AsMin, MuY: fy2.Mu, AsY: fy2.As, ld, ldh: hook, avail, nBarsX: nx, nBarsY: ny });
  out.results = [res('Mu, bars along x', fx.Mu, M), res('As along x', Math.max(fx.As, fx.AsMin), A), res('Bars along x', nx + ' - ' + db + ' mm', 'text'), res('Mu, bars along y', fy2.Mu, M), res('Bars along y', ny + ' - ' + db + ' mm', 'text')];
  return done();
}
