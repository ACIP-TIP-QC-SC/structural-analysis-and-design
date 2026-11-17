// Pile capacity by static formulas ("Theory"): point resistance, skin resistance and pile groups. Pure calculation.
// Units: m, kN, kPa, kN/m³, degrees.
import { S, v, u, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';

const LM = 'length_m', PR = 'pressure', F = 'force', UW = 'unitweight', DEG = 'angle_deg', AM = 'area_m2';
const rad = (x) => x * Math.PI / 180;
function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const a = table[i - 1], b = table[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return table[table.length - 1][1];
}
export const nqStar = (phi, ed) => interp(ed.theory.pile.NqStar, phi);
export const alphaOf = (ratio, ed) => interp(ed.theory.pile.alpha, ratio);

// Soil profile: layers from the ground surface down, water table depth (m) or null.
export function profile(layers, wt, gw) {
  const tops = []; let z = 0;
  layers.forEach((l) => { tops.push(z); z += l.t; });
  const at = (zz) => { for (let i = layers.length - 1; i >= 0; i--) if (zz >= tops[i] - 1e-12) return i; return 0; };
  const sigma = (zz) => {
    let s = 0;
    for (let i = 0; i < layers.length && tops[i] < zz; i++) {
      const z1 = tops[i], z2 = Math.min(tops[i] + layers[i].t, zz), g = layers[i].gamma;
      if (wt == null || z2 <= wt) s += g * (z2 - z1);
      else if (z1 >= wt) s += (g - gw) * (z2 - z1);
      else s += g * (wt - z1) + (g - gw) * (z2 - wt);
    }
    return s;
  };
  return { tops, bottom: z, at, sigma };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, T = ed.theory.pile, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  out.notes.push(ed.found.pile.note);
  const FS = input.FS > 0 ? input.FS : 3;

  if (input.mode === 'group') {
    if (!positive(input, ['n1', 'n2', 'sp', 'D', 'Qu'])) return stop('Give the pile layout, the pile size and the single-pile capacity.');
    const n1 = Math.round(input.n1), n2 = Math.round(input.n2), { sp, D, Qu } = input, n = n1 * n2, sum = n * Qu;
    const theta = Math.atan(D / sp) * 180 / Math.PI, eta = 1 - ((n1 - 1) * n2 + (n2 - 1) * n1) / (T.groupDiv * n1 * n2) * theta;
    rec.add('Group efficiency (Converse-Labarre)', S`η = 1 − [((n1 − 1) n2 + (n2 − 1) n1) / (${T.groupDiv} n1 n2)] θ,  θ = arctan(D / d) in degrees`, S`θ = arctan(${v(D, LM)} / ${v(sp, LM)}) = ${u(theta, DEG)}`, S`η = ${eta}`, 'theory.plain');
    let Qg;
    if (input.soil === 'clay') {
      if (!positive(input, ['cu', 'L'])) return stop('Give cu and the pile length for the block capacity.');
      const Lg = (n1 - 1) * sp + D, Bg = (n2 - 1) * sp + D, Nc = input.Nc > 0 ? input.Nc : T.blockNc;
      const block = Lg * Bg * input.cu * Nc + 2 * (Lg + Bg) * input.cu * input.L;
      Qg = Math.min(sum, block);
      rec.add('Group in clay', S`lesser of ΣQu and the block capacity Lg Bg cu Nc* + 2 (Lg + Bg) cu L;  Lg = (n1 − 1) d + D,  Bg = (n2 − 1) d + D`, S`Lg = ${u(Lg, LM)}, Bg = ${u(Bg, LM)};  block = ${u(block, F)};  ΣQu = ${u(sum, F)}`, S`Qg = ${u(Qg, F)}`, 'pile.group');
      Object.assign(vals, { Lg, Bg, block });
    } else {
      const use = sp <= T.sandSpacing * D + 1e-9;
      Qg = use ? eta * sum : sum;
      rec.add('Group in sand', S`η ΣQu when d ≤ ${T.sandSpacing} D, otherwise ΣQu`, S`d = ${u(sp, LM)}, ${T.sandSpacing} D = ${u(T.sandSpacing * D, LM)};  ΣQu = ${u(sum, F)}`, S`Qg = ${u(Qg, F)}`, 'pile.group');
    }
    const Qa = Qg / FS;
    rec.add('Allowable group load', S`Qg,all = Qg / FS`, S`${v(Qg, F)} / ${FS}`, S`Qg,all = ${u(Qa, F)}`, 'pile.allowable');
    Object.assign(vals, { theta, eta, sumQu: sum, Qg, Qall: Qa });
    if (input.Q > 0) out.checks.push(check('Group capacity', ['Q', input.Q, F], ['Qg,all', Qa, F], input.Q / Qa, 'pile.group'));
    out.results = [res('θ', theta, DEG), res('η', eta), res('ΣQu', sum, F), res('Qg', Qg, F), res('Qg,all', Qa, F)];
    out.diagram = { kind: 'group', n1, n2, sp, D, chips: [[n1 + ' × ' + n2 + ' piles'], S`d = ${u(sp, LM)}`] };
    return done();
  }

  if (!positive(input, ['D', 'L'])) return stop('Give the pile size and length.');
  const { D, L } = input, round = input.shape !== 'square', Ap = round ? Math.PI * D * D / 4 : D * D, p = round ? Math.PI * D : 4 * D;
  const layers = (input.layers || []).filter((l) => l && l.t > 0);
  if (!layers.length) return stop('Add the soil layers.');
  if (layers.some((l) => !(l.gamma > 0) || !(l.phi > 0 || l.cu > 0))) return stop('Every layer needs a unit weight and either φ\' (sand) or cu (clay).');
  const wt = input.wt != null && input.wt >= 0 ? input.wt : null, gw = ed.theory.gammaW;
  const pr = profile(layers, wt, gw);
  if (pr.bottom < L - 1e-9) return stop('The soil layers must reach the pile tip.');
  rec.add('Pile section', round ? S`Ap = π D² / 4;  p = π D` : S`Ap = D²;  p = 4 D`, S`D = ${u(D, LM)}`, S`Ap = ${u(Ap, AM)},  p = ${u(p, LM)}`, 'basic.geometry');
  // Point resistance from the layer at the tip.
  const tip = layers[pr.at(L - 1e-9)], sTip = pr.sigma(L);
  let Qp;
  if (tip.cu > 0 && !(tip.phi > 0)) {
    Qp = T.clayNc * tip.cu * Ap;
    rec.add('Point resistance in clay', S`Qp = ${T.clayNc} cu Ap`, S`Qp = ${T.clayNc} · ${v(tip.cu, PR)} · ${v(Ap, AM)}`, S`Qp = ${u(Qp, F)}`, 'theory.plain');
  } else {
    const nq = nqStar(tip.phi, ed), q1 = sTip * nq, ql = T.limitK * T.pa * nq * Math.tan(rad(tip.phi));
    Qp = Ap * Math.min(q1, ql);
    rec.add('Point resistance in sand (Meyerhof)', S`Qp = Ap q' Nq* ≤ Ap · ${T.limitK} pa Nq* tan φ',  pa = ${u(T.pa, PR)}`, S`φ' = ${u(tip.phi, DEG)} → Nq* = ${nq};  q' = ${u(sTip, PR)};  q' Nq* = ${u(q1, PR)};  limit = ${u(ql, PR)}`,
      S`Qp = ${u(Qp, F)}`, 'theory.plain', q1 > ql ? 'The limiting point resistance governs.' : '');
    Object.assign(vals, { NqStar: nq, qNq: q1, ql });
  }
  Object.assign(vals, { Ap, p, Qp });
  if (input.mode === 'point') {
    out.results = [res('Ap', Ap, AM), res('Qp', Qp, F), res('Qp / FS', Qp / FS, F)];
    out.diagram = { kind: 'pile', D, L, layers, wt, chips: [S`D = ${u(D, LM)}, L = ${u(L, LM)}`] };
    return done();
  }
  // Skin resistance
  const Lc = T.critDepth * D, K = input.K, dl = input.delta;
  const sand = layers.some((l) => l.phi > 0 && !(l.cu > 0));
  if (sand && !(K > 0 && dl > 0)) return stop('Give K and δ\' for the sand layers.');
  const brk = new Set([0, L]); pr.tops.forEach((t) => { if (t < L) brk.add(t); }); if (Lc < L) brk.add(Lc); if (wt != null && wt < L) brk.add(wt);
  const zs = [...brk].sort((a, b) => a - b), fAt = (z, i) => {
    const l = layers[i];
    if (l.cu > 0 && !(l.phi > 0)) return alphaOf(l.cu / T.pa, ed) * l.cu;
    return K * pr.sigma(Math.min(z, Lc)) * Math.tan(rad(dl));
  };
  let Qs = 0; const fd = [];
  for (let j = 1; j < zs.length; j++) {
    const z1 = zs[j - 1], z2 = zs[j], i = pr.at((z1 + z2) / 2), f1 = fAt(z1, i), f2 = fAt(z2, i);
    Qs += p * (f1 + f2) / 2 * (z2 - z1); fd.push([z1, f1], [z2, f2]);
  }
  const clayL = layers.find((l) => l.cu > 0 && !(l.phi > 0));
  rec.add('Unit skin friction', sand ? S`sand: f = K σ'o tan δ', σ'o constant below L' = ${T.critDepth} D;  clay: f = α cu, α from cu / pa` : S`clay (α method): f = α cu, α from cu / pa`,
    sand ? S`L' = ${u(Lc, LM)};  K = ${K}, δ' = ${u(dl, DEG)};  f at L' = ${u(K * pr.sigma(Math.min(Lc, L)) * Math.tan(rad(dl)), PR)}` : S`cu / pa = ${clayL.cu / T.pa} → α = ${alphaOf(clayL.cu / T.pa, ed)}`, null, 'theory.plain', sand ? T.Kguide : '');
  rec.add('Skin resistance', S`Qs = Σ p ΔL f`, S`p = ${u(p, LM)}, L = ${u(L, LM)}`, S`Qs = ${u(Qs, F)}`, 'theory.plain');
  const Qu = Qp + Qs, Qa = Qu / FS;
  rec.add('Ultimate and allowable capacity', S`Qu = Qp + Qs;  Qall = Qu / FS`, S`Qu = ${v(Qp, F)} + ${v(Qs, F)}`, S`Qu = ${u(Qu, F)},  Qall = ${u(Qa, F)}  (FS = ${FS})`, 'pile.allowable');
  Object.assign(vals, { Lcrit: Lc, fMax: sand ? K * pr.sigma(Math.min(Lc, L)) * Math.tan(rad(dl)) : null, Qs, Qu, Qall: Qa });
  if (input.Q > 0) out.checks.push(check('Pile capacity', ['Q', input.Q, F], ['Qall', Qa, F], input.Q / Qa, 'pile.allowable'));
  out.results = [res('Qp', Qp, F), res('Qs', Qs, F), res('Qu', Qu, F), res('Qall', Qa, F)];
  out.diagram = { kind: 'pile', D, L, layers, wt, f: fd, chips: [S`D = ${u(D, LM)}, L = ${u(L, LM)}`, S`FS = ${FS}`] };
  return done();
}
