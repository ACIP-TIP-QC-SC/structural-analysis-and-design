// Two-way slabs by the direct design method: thickness, strip moments and punching shear. Pure calculation.
// Units: m for spans and panel sizes, mm for thickness, depth and columns, kPa, kN, kN·m, MPa.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings, roundUp, roundDown } from './common.js';
import { requiredSteelRect } from './beam-flexure.calc.js';
import { twoWayVc } from '../found/common.js';

const L = 'length_mm', LM = 'length_m', A = 'area', ST = 'stress', F = 'force', M = 'moment', PR = 'pressure';

const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
// Linear interpolation in a table of [x, y] rows, clamped to the ends.
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(x, xs[i - 1], xs[i], ys[i - 1], ys[i]);
  return ys[ys.length - 1];
}

// Minimum thickness without interior beams, interpolated on fy.
export function slabThicknessNoBeams(ln, fy, drop, ed) {
  const T = ed.concrete.twoWaySlab, rows = T.divisors, key = drop ? 'drop' : 'noDrop', fys = rows.map((r) => r.fy);
  const div = {};
  ['extNoEdge', 'extEdge', 'interior'].forEach((k) => { div[k] = interp(fys, rows.map((r) => r[key][k]), fy); });
  const min = drop ? T.hMin.drop : T.hMin.noDrop, h = {};
  Object.keys(div).forEach((k) => { h[k] = Math.max(ln / div[k], min); });
  return { div, h, min, raw: { extNoEdge: ln / div.extNoEdge, extEdge: ln / div.extEdge, interior: ln / div.interior } };
}

// Column strip share of a moment (fractions of the panel moment).
export function columnStripShare(kind, r, af, bt, ed) {
  const T = ed.concrete.twoWaySlab, xs = T.ratios, a = Math.min(Math.max(af, 0), 1);
  const pick = (tab) => lerp(a, 0, 1, interp(xs, tab.a0, r), interp(xs, tab.a1, r));
  if (kind === 'extNeg') {
    const at0 = interp(xs, T.shares.extNegBt0, r), atMax = pick(T.shares.extNeg);
    return lerp(Math.min(Math.max(bt, 0), T.betaTMax), 0, T.betaTMax, at0, atMax);
  }
  return pick(kind === 'pos' ? T.shares.pos : T.shares.intNeg);
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, mode = input.mode || 'thickness', vals = {}, out = blank(), rec = recorder();
  const env = { ed, vals, out, rec,
    stop: (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) }),
    done: () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; } };
  if (mode === 'moments') return moments(input, env);
  if (mode === 'punching') return punching(input, env);
  return thickness(input, env);
}

function thickness(input, env) {
  const { ed, vals, out, rec } = env, T = ed.concrete.twoWaySlab, B = T.beams;
  if (!positive(input, ['ln', 'fy'])) return env.stop('Give fy and the clear span ℓn.');
  const { ln, fy } = input;
  let hmin, label;
  const noBeams = () => {
    const t = slabThicknessNoBeams(ln, fy, !!input.drop, ed);
    rec.add('Minimum thickness without interior beams', S`h = ℓn / divisor, from the table for fy = ${u(fy, ST)} (linear interpolation on fy);  not less than ${u(t.min, L)}`,
      S`exterior, no edge beam: ${v(ln, L)} / ${t.div.extNoEdge} = ${u(t.raw.extNoEdge, L)};  exterior with edge beam: ${v(ln, L)} / ${t.div.extEdge} = ${u(t.raw.extEdge, L)};  interior: ${v(ln, L)} / ${t.div.interior} = ${u(t.raw.interior, L)}`,
      S`h,min = ${u(t.h[input.panel], L)} (${input.panel === 'interior' ? 'interior panel' : input.panel === 'extEdge' ? 'exterior panel with an edge beam' : 'exterior panel without an edge beam'})`, 'tw.thickness',
      'An edge beam counts only if its αf ≥ ' + T.edgeBeamAlpha + '. ' + (input.drop ? 'With drop panels.' : 'Without drop panels.'));
    Object.assign(vals, { extNoEdge: t.h.extNoEdge, extEdge: t.h.extEdge, interior: t.h.interior });
    if (fy < T.divisors[0].fy || fy > T.divisors[T.divisors.length - 1].fy) out.warnings.push('fy is outside the table range; the end row of the table is used.');
    return t.h[input.panel];
  };
  if (input.system === 'beams') {
    if (!positive(input, ['beta']) || !(input.afm >= 0)) return env.stop('Give αfm and β for slabs with beams on all sides.');
    const { afm, beta } = input, fyTerm = B.a + fy / B.fyDiv;
    if (afm <= B.lowAlpha) { hmin = noBeams(); label = 'αfm ≤ ' + B.lowAlpha + ': the table for slabs without interior beams applies'; }
    else if (afm <= B.highAlpha) {
      const raw = ln * fyTerm / (B.base + B.k1 * beta * (afm - B.lowAlpha)); hmin = Math.max(raw, B.minMid);
      rec.add('Minimum thickness with beams on all sides', S`${B.lowAlpha} < αfm ≤ ${B.highAlpha}: h = ℓn (${B.a} + fy / ${B.fyDiv}) / (${B.base} + ${B.k1} β (αfm − ${B.lowAlpha})), not less than ${u(B.minMid, L)}`,
        S`h = ${v(ln, L)} (${B.a} + ${si(fy, ST)} / ${B.fyDiv}) / (${B.base} + ${B.k1} · ${beta} (${afm} − ${B.lowAlpha})) = ${u(raw, L)}`, S`h,min = ${u(hmin, L)}`, 'tw.beams');
    } else {
      const raw = ln * fyTerm / (B.base + B.k2 * beta); hmin = Math.max(raw, B.minHigh);
      rec.add('Minimum thickness with beams on all sides', S`αfm > ${B.highAlpha}: h = ℓn (${B.a} + fy / ${B.fyDiv}) / (${B.base} + ${B.k2} β), not less than ${u(B.minHigh, L)}`,
        S`h = ${v(ln, L)} (${B.a} + ${si(fy, ST)} / ${B.fyDiv}) / (${B.base} + ${B.k2} · ${beta}) = ${u(raw, L)}`, S`h,min = ${u(hmin, L)}`, 'tw.beams');
    }
    if (label) out.notes.push(label + '.');
  } else hmin = noBeams();
  const use = roundUp(hmin, T.roundTo);
  rec.add('Thickness to use', S`h,min rounded up to ${u(T.roundTo, L)}`, null, S`h = ${u(use, L)}`, 'tw.thicknessMin');
  vals.hmin = hmin; vals.hUse = use;
  if (input.h > 0) out.checks.push(check('Thickness', ['h,min', hmin, L], ['h', input.h, L], hmin / input.h, 'tw.thickness'));
  else out.notes.push('Enter a thickness to check it against the minimum.');
  out.results = [res('h,min', hmin, L), res('h to use', use, L)];
  if (vals.interior != null) out.results.push(res('Exterior, no edge beam', vals.extNoEdge, L), res('Exterior, with edge beam', vals.extEdge, L), res('Interior', vals.interior, L));
  out.diagram = { kind: 'thickness', ln, h: input.h > 0 ? input.h : use, chips: [S`ℓn = ${u(ln, L)}`, S`fy = ${u(fy, ST)}`] };
  return env.done();
}

function moments(input, env) {
  const { ed, vals, out, rec } = env, C = ed.concrete, T = C.twoWaySlab, G = ed.loads.gravity;
  if (!positive(input, ['l1', 'l2', 'c1', 'c2', 'h', 'd', 'fc', 'fy', 'db']) || !(input.wD > 0) || !(input.wL >= 0)) return env.stop('Every span, size, strength and load needs a positive number.');
  const { l1, l2, c1, h, d, fc, fy, db } = input;
  if (d >= h) return env.stop('Effective depth d must be less than the slab thickness h.');
  out.warnings.push(...materialWarnings(fc, fy, ed));
  let wD = input.wD;
  if (input.addSelf) {
    const self = C.defaults.gammaC * h / 1000;
    rec.add('Slab self-weight', S`w = γc · h`, S`w = ${v(C.defaults.gammaC, 'unitweight')} · ${v(h / 1000, LM)}`, S`w = ${u(self, PR)};  wD = ${u(wD + self, PR)}`, 'basic.statics');
    wD += self;
  }
  // Limitations of the method (warnings, not errors).
  const lim = [];
  if (!input.threeSpans) lim.push('the method needs at least ' + T.minSpans + ' continuous spans in each direction');
  if (Math.max(l1, l2) / Math.min(l1, l2) > T.ratioMax) lim.push('the longer to shorter panel span ratio is above ' + T.ratioMax);
  if (!input.spansSimilar) lim.push('successive spans must not differ by more than one third of the longer span');
  if (input.wL > T.liveToDead * input.wD) lim.push('the unfactored live load is more than ' + T.liveToDead + ' times the dead load');
  rec.add('Limitations of the direct design method', S`gravity loads only, uniformly distributed;  ${T.minSpans} or more continuous spans;  panel ratio ≤ ${T.ratioMax};  successive spans within 1/3;  L ≤ ${T.liveToDead} D`,
    S`panel ratio = ${Math.max(l1, l2) / Math.min(l1, l2)};  L / D = ${input.wL / input.wD}`, [lim.length ? 'Not met: ' + lim.join('; ') + '.' : 'All limitations are met.'], 'tw.limits');
  lim.forEach((x) => out.warnings.push('Direct design method: ' + x + '.'));
  const qu = G.D * wD + G.L * input.wL;
  rec.add('Factored load', S`qu = ${G.D} wD + ${G.L} wL`, S`qu = ${G.D} · ${v(wD, PR)} + ${G.L} · ${v(input.wL, PR)}`, S`qu = ${u(qu, PR)}`, 'loads.strength');
  const lnRaw = l1 - c1 / 1000, ln = Math.max(lnRaw, T.lnMinRatio * l1);
  rec.add('Clear span', S`ℓn = ℓ1 − c1 ≥ ${T.lnMinRatio} ℓ1`, S`ℓn = ${v(l1, LM)} − ${v(c1 / 1000, LM)} = ${u(lnRaw, LM)}`, S`ℓn = ${u(ln, LM)}`, 'tw.ln');
  const Mo = qu * l2 * ln * ln / 8;
  rec.add('Total static moment', S`Mo = qu ℓ2 ℓn² / 8`, S`Mo = ${v(qu, PR)} · ${v(l2, LM)} · ${v(ln, LM)}² / 8`, S`Mo = ${u(Mo, M)}`, 'tw.Mo');
  Object.assign(vals, { qu, ln, Mo });
  // Longitudinal distribution
  let parts;
  if (input.span === 'interior') {
    parts = [{ key: 'neg', label: 'Negative (each support)', k: T.interior.neg, kind: 'intNeg' }, { key: 'pos', label: 'Positive (midspan)', k: T.interior.pos, kind: 'pos' }];
    rec.add('Longitudinal distribution, interior span', S`negative = ${T.interior.neg} Mo;  positive = ${T.interior.pos} Mo`, S`${T.interior.neg} · ${v(Mo, M)};  ${T.interior.pos} · ${v(Mo, M)}`, S`negative = ${u(T.interior.neg * Mo, M)},  positive = ${u(T.interior.pos * Mo, M)}`, 'tw.interior');
  } else {
    const row = T.endSpan.find((r) => r.value === input.edge) || T.endSpan[2];
    parts = [{ key: 'extNeg', label: 'Exterior negative', k: row.extNeg, kind: 'extNeg' }, { key: 'pos', label: 'Positive', k: row.pos, kind: 'pos' }, { key: 'intNeg', label: 'Interior negative', k: row.intNeg, kind: 'intNeg' }];
    rec.add('Longitudinal distribution, end span', S`${row.label}: exterior negative ${row.extNeg} Mo, positive ${row.pos} Mo, interior negative ${row.intNeg} Mo`, S`Mo = ${u(Mo, M)}`,
      S`${u(row.extNeg * Mo, M)},  ${u(row.pos * Mo, M)},  ${u(row.intNeg * Mo, M)}`, 'tw.end');
  }
  const cs = 2 * T.csWidth * Math.min(l1, l2), ms = l2 - cs, ratio = l2 / l1, af = (input.af1 > 0 ? input.af1 : 0) * ratio, bt = input.bt > 0 ? input.bt : 0;
  rec.add('Strip widths', S`column strip = 2 × ${T.csWidth} × min(ℓ1, ℓ2);  middle strip = ℓ2 − column strip`, S`column strip = 2 × ${T.csWidth} × ${v(Math.min(l1, l2), LM)}`, S`column strip = ${u(cs, LM)},  middle strip = ${u(ms, LM)}`, 'tw.csWidth');
  const beamFrac = T.beamShare * Math.min(af, 1);
  const SP = T.sMax, sMax = Math.min(SP.timesH * h, SP.max), ratioMin = C.AsMinSlabRatio(fy), Ab = barArea(1, db);
  const rows = [], M_ = {}, CS = {}, MS = {}, BM = {};
  const strip = (name, width, Mu, key) => {
    const b = width * 1000, AsMin = ratioMin * b * h;
    if (!(Mu > 0)) { rows.push({ cells: [name, key, u(0, M), u(0, A), u(AsMin, A), '–'] }); return { As: 0, AsMin }; }
    const r = requiredSteelRect({ b, d, fc, fy, Mu: Mu * 1e6 }, ed);
    if (!r.ok) return null;
    const use = Math.max(r.As, AsMin), s = roundDown(Math.min(b * Ab / use, sMax), C.shear.practical);
    rows.push({ cells: [name, key, u(Mu, M), u(r.As, A), u(AsMin, A), S`${db} mm at ${u(s, L)}`] });
    return { As: r.As, AsMin, s };
  };
  const steel = {};
  for (const p of parts) {
    const Mt = p.k * Mo, share = columnStripShare(p.kind, ratio, af, bt, ed), Mcs = share * Mt, Mbeam = beamFrac * Mcs, McsSlab = Mcs - Mbeam, Mms = Mt - Mcs;
    rec.add('Column strip share, ' + p.label.toLowerCase(), p.kind === 'extNeg' ? S`share from the table, interpolated on ℓ2/ℓ1, αf1 ℓ2/ℓ1 and βt` : S`share from the table, interpolated on ℓ2/ℓ1 and αf1 ℓ2/ℓ1`,
      S`ℓ2/ℓ1 = ${ratio}, αf1 ℓ2/ℓ1 = ${af}${p.kind === 'extNeg' ? S`, βt = ${bt}` : ''};  share = ${share}`,
      S`column strip = ${u(Mcs, M)}${Mbeam > 0 ? S` (beam ${u(Mbeam, M)}, slab ${u(McsSlab, M)})` : ''};  middle strip = ${u(Mms, M)}`,
      p.kind === 'pos' ? 'tw.csPos' : p.kind === 'extNeg' ? 'tw.csExtNeg' : 'tw.csIntNeg');
    M_[p.key] = Mt; CS[p.key] = Mcs; MS[p.key] = Mms; BM[p.key] = Mbeam;
    const a = strip(p.label, cs, McsSlab, 'column strip'), b = strip(p.label, ms, Mms, 'middle strip');
    if (!a || !b) return env.stop('The slab is too thin for the strip moments. Increase h or d.');
    steel[p.key] = { cs: a, ms: b };
    if (Mbeam > 0) rows.push({ cells: [p.label, 'beam', u(Mbeam, M), '–', '–', 'design as a beam'] });
  }
  if (beamFrac > 0) rec.add('Share carried by the beam', S`${T.beamShare * 100}% of the column strip moment at αf1 ℓ2/ℓ1 ≥ 1, reducing linearly to 0`, S`αf1 ℓ2/ℓ1 = ${af}`, S`beam share = ${beamFrac}`, 'tw.beam');
  const first = parts.find((p) => p.kind === 'intNeg');
  const ex = steel[first.key].cs;
  rec.add('Column strip steel, ' + first.label.toLowerCase(), S`As from the rectangular flexure function with b = column strip width;  As,min = ${ratioMin} b h;  s ≤ lesser of ${SP.timesH} h and ${u(SP.max, L)}`,
    S`Mu = ${u(CS[first.key] - BM[first.key], M)}, b = ${u(cs * 1000, L)}, d = ${u(d, L)}`, S`As = ${u(ex.As, A)};  As,min = ${u(ex.AsMin, A)};  s,max = ${u(sMax, L)}`, 'tw.minSteel', 'The middle strip takes the rest of the moment (' + ed.clauses['tw.ms'].nscp + '). Every strip is listed in the table below.');
  Object.assign(vals, { M: M_, cs: CS, ms: MS, beam: BM, csWidth: cs, msWidth: ms, csIntNegAs: ex.As, AsMin: ex.AsMin, sMax, limitsMet: !lim.length });
  out.results = [res('qu', qu, PR), res('ℓn', ln, LM), res('Mo', Mo, M), res('Column strip width', cs, LM)].concat(parts.map((p) => res('Column strip, ' + p.label.toLowerCase(), CS[p.key], M)));
  out.diagram = { kind: 'moments', l1, l2, cs, parts: parts.map((p) => ({ label: p.label, cs: CS[p.key], ms: MS[p.key] })), span: input.span,
    chips: [S`ℓ1 × ℓ2 = ${v(l1, LM)} × ${u(l2, LM)}`, S`qu = ${u(qu, PR)}`, S`Mo = ${u(Mo, M)}`],
    tables: [{ title: 'Strip moments and steel', head: ['Location', 'Strip', 'Mu', 'As required', 'As minimum', 'Suggested bars'], rows, note: 'Bar spacing is rounded down to a ' + C.shear.practical + ' mm multiple and limited to the maximum spacing of ' + ed.clauses['tw.maxSpacing'].nscp + ' (see the solution).' }] };
  out.notes.push('Strip moments are not checked against a capacity here; the steel listed provides the strength. Use Beam flexure for any beam share.');
  return env.done();
}

function punching(input, env) {
  const { ed, vals, out, rec } = env, C = ed.concrete, phi = C.phi.shear;
  if (!positive(input, ['c1', 'c2', 'd', 'fc', 'lambda'])) return env.stop('The column size, d and the strengths need positive numbers.');
  const { c1, c2, d, fc, lambda } = input, loc = input.location || 'interior';
  let b1, b2, bo;
  if (loc === 'edge') { b1 = c1 + d / 2; b2 = c2 + d; bo = 2 * b1 + b2; }
  else if (loc === 'corner') { b1 = c1 + d / 2; b2 = c2 + d / 2; bo = b1 + b2; }
  else { b1 = c1 + d; b2 = c2 + d; bo = 2 * (b1 + b2); }
  rec.add('Critical section at d/2 from the column faces', loc === 'interior' ? S`b1 = c1 + d;  b2 = c2 + d;  bo = 2 (b1 + b2)` : loc === 'edge' ? S`b1 = c1 + d/2;  b2 = c2 + d;  bo = 2 b1 + b2 (free edge parallel to c2)` : S`b1 = c1 + d/2;  b2 = c2 + d/2;  bo = b1 + b2`,
    S`b1 = ${u(b1, L)},  b2 = ${u(b2, L)}`, S`bo = ${u(bo, L)}`, 'found.twoWaySection');
  let Vu = input.Vu;
  if (input.vuFrom === 'panel') {
    if (!positive(input, ['qu', 'l1', 'l2'])) return env.stop('Give qu and the panel spans for the shear helper.');
    Vu = input.qu * (input.l1 * input.l2 - b1 * b2 / 1e6);
    rec.add('Shear from the panel load', S`Vu = qu (ℓ1 ℓ2 − b1 b2)`, S`Vu = ${v(input.qu, PR)} (${v(input.l1, LM)} · ${v(input.l2, LM)} − ${v(b1 / 1000, LM)} · ${v(b2 / 1000, LM)})`, S`Vu = ${u(Vu, F)}`, 'basic.statics');
  }
  if (!(Vu > 0)) return env.stop('Give the factored shear Vu.');
  const beta = Math.max(c1, c2) / Math.min(c1, c2), alpha = C.twoWay.alpha[loc], tw = twoWayVc(fc, beta, alpha, d, bo, lambda, ed), pvc = phi * tw.vc;
  rec.add('Two-way shear strength', S`vc = least of ${C.twoWay.a} λ √f'c, ${C.twoWay.b} (1 + 2/β) λ √f'c, ${C.twoWay.c} (2 + αs d / bo) λ √f'c;  φ = ${phi}`,
    S`β = ${beta}, αs = ${alpha};  ${si(tw.a, ST)}, ${si(tw.b, ST)}, ${si(tw.c, ST)}`, S`vc = ${u(tw.vc, ST)},  φvc = ${u(pvc, ST)}`, 'found.twoWayVc');
  const vu = Vu * 1e3 / (bo * d);
  rec.add('Shear stress from direct shear', S`vu = Vu / (bo d)`, S`vu = ${v(Vu, F)} × 10³ / (${v(bo, L)} · ${v(d, L)})`, S`vu = ${u(vu, ST)};  vu / φvc = ${dc(vu / pvc)}`, 'found.twoWaySection');
  Object.assign(vals, { b1, b2, bo, Vu, beta, vc: tw.vc, phiVc: pvc, vu, dc: vu / pvc });
  let vmax = vu;
  if (input.Msc > 0) {
    if (loc !== 'interior') out.warnings.push('The unbalanced moment is handled for interior columns only; it is ignored for this column.');
    else {
      const gf = 1 / (1 + ed.concrete.punching.gammaF * Math.sqrt(b1 / b2)), gv = 1 - gf;
      const Jc = d * Math.pow(b1, 3) / 6 + b1 * Math.pow(d, 3) / 6 + d * b2 * b1 * b1 / 2;
      vmax = vu + gv * input.Msc * 1e6 * (b1 / 2) / Jc;
      rec.add('Fraction of the unbalanced moment', S`γf = 1 / (1 + (2/3) √(b1 / b2));  γv = 1 − γf`, S`γf = 1 / (1 + (2/3) √(${v(b1, L)} / ${v(b2, L)}))`, S`γf = ${gf},  γv = ${gv}`, 'tw.gammaF');
      rec.add('Polar property of the critical section', S`Jc = d b1³ / 6 + b1 d³ / 6 + d b2 b1² / 2`, S`b1 = ${u(b1, L)}, b2 = ${u(b2, L)}, d = ${u(d, L)}`, S`Jc = ${u(Jc, 'inertia')}`, 'tw.gammaV');
      rec.add('Maximum shear stress', S`vu,max = Vu / (bo d) + γv Msc (b1 / 2) / Jc`, S`vu,max = ${v(vu, ST)} + ${gv} · ${v(input.Msc, M)} × 10⁶ · ${v(b1 / 2, L)} / ${v(Jc, 'inertia')}`, S`vu,max = ${u(vmax, ST)};  D/C = ${dc(vmax / pvc)}`, 'tw.vuMax');
      Object.assign(vals, { gammaF: gf, gammaV: gv, Jc, vuMax: vmax, dcM: vmax / pvc });
    }
  }
  out.checks.push(check('Punching shear', [vmax > vu ? 'vu,max' : 'vu', vmax, ST], ['φvc', pvc, ST], vmax / pvc, 'found.twoWayVc'));
  out.results = [res('bo', bo, L), res('Vu', Vu, F), res('vc', tw.vc, ST), res('φvc', pvc, ST), res('vu', vu, ST)];
  if (vals.vuMax) out.results.push(res('vu,max', vals.vuMax, ST));
  out.diagram = { kind: 'punching', c1, c2, d, b1, b2, loc, chips: [S`column ${v(c1, L)} × ${u(c2, L)}`, [loc + ' column'], S`d = ${u(d, L)}`] };
  return env.done();
}
