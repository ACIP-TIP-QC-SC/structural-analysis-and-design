// Welded connections: fillet welds, groove welds and eccentrically loaded weld groups. Pure calculation.
// Units: mm, MPa, kN; strengths per unit length in N/mm; weld group stresses in kN/mm.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { available } from './common.js';
import { weldGroup, weldShape } from './groupElastic.js';

const L = 'length_mm', ST = 'stress', F = 'force', NPM = 'n_per_mm', KPM = 'force_per_mm';

// Nominal strength of a fillet weld per mm of length, N/mm.
export function filletRn(w, FEXX, ed) { const W = ed.steel.weld; return W.k * FEXX * W.throat * w; }
export function minFilletSize(t, ed) { return ed.steel.weld.minSize.find((r) => t <= r.t).w; }
export function maxFilletSize(t, ed) { const M = ed.steel.weld.maxSize; return t < M.tLimit ? t : t - M.less; }
// Effective length of an end-loaded weld.
export function longWeldLength(Lw, w, ed) {
  const K = ed.steel.weld.longWeld, r = Lw / w;
  if (r <= K.start) return { L: Lw, beta: 1 };
  if (r > K.cap) return { L: K.use * w, beta: K.use * w / Lw };
  const beta = Math.min(K.a - K.b * r, 1);
  return { L: beta * Lw, beta };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, W = ed.steel.weld, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD', asd = method === 'ASD';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const FEXX = input.FEXX, cap = asd ? 'Rn/Ω' : 'φRn', dem = asd ? 'Pa' : 'Pu', fac = (pair) => (asd ? S`/ Ω = / ${pair.omega}` : S`× φ = × ${pair.phi}`);
  if (!(FEXX > 0)) return stop('Choose the electrode strength FEXX.');

  if (input.mode === 'eccentric') {
    let segs;
    if (input.layout === 'free') segs = (input.segments || []).map((g) => ({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 }));
    else { if (!positive(input, ['a', 'b'])) return stop('Give the weld lengths of the shape.'); segs = weldShape(input.layout, input.a, input.b); }
    if (!segs.length || !(input.P > 0)) return stop('Give the weld segments and the load.');
    const ang = (input.angle || 0) * Math.PI / 180, Px = input.P * Math.sin(ang), Py = -input.P * Math.cos(ang);
    const g = weldGroup(segs, { Px, Py, ex: input.ex || 0, ey: input.ey || 0 });
    if (!(g.L > 0) || !(g.Ip > 0)) return stop('The weld segments need a length.');
    rec.add('Weld group as lines of unit throat', S`L = Σ ℓ;  centroid;  Ix, Iy including each segment about its own axis;  Ip = Ix + Iy`, S`L = ${u(g.L, L)};  centroid at (${v(g.cx, L)}, ${v(g.cy, L)})`,
      S`Ix = ${u(g.Ix, 'modulus3')},  Iy = ${u(g.Iy, 'modulus3')},  Ip = ${u(g.Ip, 'modulus3')}`, 'theory.plain');
    const c = g.crit;
    rec.add('Stress at the critical point', S`direct = P / L;  fx = M y / Ip;  fy = M x / Ip;  fr = vector sum`, S`M = ${u(Math.abs(g.M) / 1e3, 'moment')};  point (${v(c.rx, L)}, ${v(c.ry, L)}) from the centroid: direct ${u(Math.hypot(g.dx, g.dy), KPM)}, fx = ${u(Math.abs(c.tx), KPM)}, fy = ${u(Math.abs(c.ty), KPM)}`,
      S`fr = ${u(c.fr, KPM)}`, 'theory.plain', 'Evaluated at every segment end; the largest governs.');
    const per = W.k * FEXX * W.throat, wReq = asd ? c.fr * 1e3 * W.fillet.omega / per : c.fr * 1e3 / (W.fillet.phi * per);
    rec.add('Required fillet size', asd ? S`w = fr Ω / (${W.k} FEXX · ${W.throat})` : S`w = fr / (φ · ${W.k} FEXX · ${W.throat})`, asd ? S`w = ${v(c.fr * 1e3, NPM)} · ${W.fillet.omega} / (${W.k} · ${v(FEXX, ST)} · ${W.throat})` : S`w = ${v(c.fr * 1e3, NPM)} / (${W.fillet.phi} · ${W.k} · ${v(FEXX, ST)} · ${W.throat})`,
      S`w required = ${u(wReq, L)}`, 'weld.strength');
    Object.assign(vals, { L: g.L, xbar: g.cx - Math.min(...segs.map((s) => Math.min(s.x1, s.x2))), Ix: g.Ix, Iy: g.Iy, Ip: g.Ip, direct: Math.hypot(g.dx, g.dy), fx: Math.abs(c.tx), fy: Math.abs(c.ty), fr: c.fr, wReq });
    if (input.w > 0) out.checks.push(check('Weld size', ['required', wReq, L], ['provided', input.w, L], wReq / input.w, 'weld.strength'));
    out.results = [res('L', g.L, L), res('Ip', g.Ip, 'modulus3'), res('fr', c.fr, KPM), res('w required', wReq, L)];
    out.diagram = { kind: 'group', segs, pts: g.points, crit: c, cx: g.cx, cy: g.cy, load: { ex: input.ex || 0, ey: input.ey || 0 }, chips: [S`L = ${u(g.L, L)}`, S`P = ${u(input.P, F)}`] };
    return done();
  }

  if (input.mode === 'groove') {
    if (!positive(input, ['t', 'Lw', 'Fy', 'Fu']) || !(input.P >= 0)) return stop('Give the thickness, length, base metal strengths and the load.');
    const shear = input.loading === 'shear', A = input.t * input.Lw;
    if (input.groove === 'cjp') {
      const pair = shear ? W.cjp.shear : W.cjp.tension, Rn = pair.k * input.Fy * A / 1e3, Ra = available(Rn, pair, method);
      rec.add('Complete joint penetration groove weld', shear ? S`strength of the base metal in shear: Rn = ${pair.k} Fy A` : S`strength of the base metal normal to the weld: Rn = Fy A`, S`A = t · ℓ = ${v(input.t, L)} · ${v(input.Lw, L)} = ${u(A, 'area')}`,
        S`Rn = ${u(Rn, F)};  ${cap} = ${u(Ra, F)}  (${asd ? 'Ω = ' + pair.omega : 'φ = ' + pair.phi})`, 'weld.groove', 'Matching filler metal is required.');
      out.checks.push(check('Groove weld (base metal)', [dem, input.P, F], [cap, Ra, F], input.P / Ra, 'weld.groove'));
      Object.assign(vals, { A, Rn, avail: Ra });
      out.results = [res('A', A, 'area'), res('Rn', Rn, F), res(cap, Ra, F)];
    } else {
      if (!(input.E > 0)) return stop('Give the effective throat E of the partial joint penetration weld.');
      const pair = shear ? W.pjp.shear : W.pjp.tension, Rw = pair.k * FEXX * input.E * input.Lw / 1e3, Rw_a = available(Rw, pair, method);
      rec.add('Partial joint penetration groove weld', S`Rn = ${pair.k} FEXX E ℓ`, S`Rn = ${pair.k} · ${v(FEXX, ST)} · ${v(input.E, L)} · ${v(input.Lw, L)}`, S`Rn = ${u(Rw, F)};  ${cap} = ${u(Rw_a, F)}  (${asd ? 'Ω = ' + pair.omega : 'φ = ' + pair.phi})`, 'weld.groove');
      let Rb, bpair;
      if (shear) {
        const r = W.baseRupture, y = W.baseYield, rr = available(r.k * input.Fu * A / 1e3, r, method), yy = available(y.k * input.Fy * A / 1e3, y, method);
        Rb = Math.min(rr, yy); bpair = 'shear';
        rec.add('Base metal in shear', S`rupture ${W.baseRupture.k} Fu A;  yielding ${W.baseYield.k} Fy A`, S`A = ${u(A, 'area')}`, S`${cap} = lesser of ${u(rr, F)} and ${u(yy, F)} = ${u(Rb, F)}`, 'weld.base');
      } else {
        const pt = W.cjp.tension; Rb = available(input.Fy * A / 1e3, pt, method); bpair = 'tension';
        rec.add('Base metal in tension', S`Rn = Fy A`, S`A = ${u(A, 'area')}`, S`${cap} = ${u(Rb, F)}`, 'weld.groove');
      }
      out.checks.push(check('Groove weld', [dem, input.P, F], [cap, Rw_a, F], input.P / Rw_a, 'weld.groove'));
      out.checks.push(check('Base metal', [dem, input.P, F], [cap, Rb, F], input.P / Rb, bpair === 'shear' ? 'weld.base' : 'weld.groove'));
      Object.assign(vals, { Rw, weldAvail: Rw_a, baseAvail: Rb });
      out.results = [res('Weld ' + cap, Rw_a, F), res('Base metal ' + cap, Rb, F)];
    }
    out.diagram = { kind: 'groove', t: input.t, groove: input.groove, chips: [[input.groove === 'cjp' ? 'complete penetration' : 'partial penetration'], [shear ? 'shear' : 'tension or compression']] };
    return done();
  }

  // Fillet welds
  if (!positive(input, ['w', 't', 'Fy', 'Fu']) || !(input.nLong >= 0) || !(input.Llong >= 0) || !(input.Ltrans >= 0)) return stop('Give the weld size, lengths, base metal and the load.');
  const { w, t } = input, nL = Math.round(input.nLong), Ll = nL > 0 ? input.Llong : 0, Lt = input.Ltrans > 0 ? input.Ltrans : 0;
  if (nL * Ll + Lt <= 0) return stop('Give at least one weld length.');
  const rn = filletRn(w, FEXX, ed), lw = longWeldLength(Ll, w, ed);
  rec.add('Weld strength per unit length', S`effective throat = ${W.throat} w;  rn = ${W.k} FEXX · ${W.throat} w`, S`rn = ${W.k} · ${v(FEXX, ST)} · ${W.throat} · ${v(w, L)}`, S`rn = ${u(rn, NPM)};  ${asd ? S`rn / ${W.fillet.omega} = ${u(rn / W.fillet.omega, NPM)}` : S`${W.fillet.phi} rn = ${u(W.fillet.phi * rn, NPM)}`}`, 'weld.strength');
  if (lw.beta < 1) rec.add('Long end-loaded welds', S`ℓ / w > ${W.longWeld.start}: β = ${W.longWeld.a} − ${W.longWeld.b} (ℓ / w) ≤ 1.0;  ℓ / w > ${W.longWeld.cap}: use ${W.longWeld.use} w`, S`ℓ / w = ${Ll / w}`, S`effective length = ${u(lw.L, L)}`, 'weld.long');
  const Rwl = rn * nL * lw.L / 1e3, Rwt = rn * Lt / 1e3;
  let Rn, how;
  if (input.angle > 0 && Lt === 0) {
    const k = 1 + W.angle.k * Math.pow(Math.sin(input.angle * Math.PI / 180), W.angle.p);
    Rn = Rwl * k; how = 'angle';
    rec.add('Directional strength increase', S`Rn = rn ℓ (1.0 + ${W.angle.k} sin^${W.angle.p} θ)`, S`θ = ${u(input.angle, 'angle_deg')};  factor ${k}`, S`Rn = ${u(Rn, F)}`, 'weld.angle');
  } else {
    const a = Rwl + Rwt, b = W.group.a * Rwl + W.group.b * Rwt; Rn = Math.max(a, b); how = 'group';
    rec.add('Weld group strength', S`Rwl = rn Σ ℓ (longitudinal);  Rwt = rn Σ ℓ (transverse);  Rn = greater of Rwl + Rwt and ${W.group.a} Rwl + ${W.group.b} Rwt`,
      S`Rwl = ${v(rn, NPM)} · ${nL} · ${v(lw.L, L)} = ${u(Rwl, F)};  Rwt = ${v(rn, NPM)} · ${v(Lt, L)} = ${u(Rwt, F)};  (a) ${u(a, F)},  (b) ${u(b, F)}`, S`Rn = ${u(Rn, F)}`, 'weld.group');
    Object.assign(vals, { Rwl, Rwt, Ra_: a, Rb_: b });
  }
  const Ra = available(Rn, W.fillet, method);
  rec.add('Available weld strength', asd ? S`Rn / ${W.fillet.omega}` : S`${W.fillet.phi} Rn`, null, S`${cap} = ${u(Ra, F)}`, 'weld.strength');
  const br = W.baseRupture, by = W.baseYield, rRup = br.k * input.Fu * t, rYld = by.k * input.Fy * t;
  const aRup = available(rRup, br, method), aYld = available(rYld, by, method), aWeld = available(rn, W.fillet, method);
  const totalLen = nL * lw.L + Lt, aBase = Math.min(aRup, aYld) * totalLen / 1e3;
  rec.add('Base metal at the weld, per unit length', S`shear rupture ${br.k} Fu t (${asd ? 'Ω ' + br.omega : 'φ ' + br.phi});  shear yielding ${by.k} Fy t (${asd ? 'Ω ' + by.omega : 'φ ' + by.phi})`,
    S`rupture ${u(rRup, NPM)} → ${u(aRup, NPM)};  yielding ${u(rYld, NPM)} → ${u(aYld, NPM)};  weld ${u(aWeld, NPM)}`, [aWeld <= Math.min(aRup, aYld) ? 'The weld governs per unit length.' : 'The base metal governs per unit length.'], 'weld.base');
  const wMin = minFilletSize(t, ed), wMax = maxFilletSize(t, ed), lMin = W.minLength * w;
  rec.add('Size and length limits', S`minimum size from the thinner part;  maximum along an edge: t if t < ${u(W.maxSize.tLimit, L)}, else t − ${u(W.maxSize.less, L)};  minimum length ${W.minLength} w`,
    S`t = ${u(t, L)}`, S`w,min = ${u(wMin, L)},  w,max = ${u(wMax, L)},  ℓ,min = ${u(lMin, L)}`, 'weld.limits');
  const P = input.P > 0 ? input.P : 0;
  if (P > 0) {
    out.checks.push(check('Weld strength', [dem, P, F], [cap, Ra, F], P / Ra, 'weld.strength'));
    out.checks.push(check('Base metal', [dem, P, F], [cap, aBase, F], P / aBase, 'weld.base'));
  }
  out.checks.push(check('Minimum weld size', ['w,min', wMin, L], ['w', w, L], wMin / w, 'weld.minSize'));
  out.checks.push(check('Maximum weld size', ['w', w, L], ['w,max', wMax, L], w / wMax, 'weld.limits'));
  if (nL > 0 || Lt > 0) out.checks.push(check('Minimum weld length', ['4w', lMin, L], ['shortest weld', Math.min(...[Ll, Lt].filter((x) => x > 0)), L], lMin / Math.min(...[Ll, Lt].filter((x) => x > 0)), 'weld.limits'));
  if (P > 0 && how === 'group') {
    const wNeed = w * P / Ra, lNeed = nL > 0 && Lt === 0 ? P / (available(rn, W.fillet, method) * nL / 1e3) : null;
    rec.add('Design aids', S`size needed for these lengths: w × load / available;${lNeed != null ? ' length of each longitudinal weld for this size: load / (n × available per mm)' : ''}`, null,
      lNeed != null ? S`w needed = ${u(wNeed, L)};  ℓ needed = ${u(lNeed, L)} each` : S`w needed = ${u(wNeed, L)}`, 'basic.design');
    vals.wNeed = wNeed; if (lNeed != null) vals.lNeed = lNeed;
  }
  Object.assign(vals, { rn, Rn, LRFD: W.fillet.phi * Rn, ASD: Rn / W.fillet.omega, avail: Ra, baseRupture: rRup, baseYield: rYld, baseRuptureAvail: aRup, baseYieldAvail: aYld, weldAvailPerMm: aWeld, wMin, wMax, minLength: lMin });
  out.results = [res('rn', rn, NPM), res('Rn', Rn, F), res(cap, Ra, F), res('w,min', wMin, L), res('w,max', wMax, L)];
  if (vals.wNeed) out.results.push(res('w needed', vals.wNeed, L));
  out.diagram = { kind: 'fillet', nL, Ll, Lt, w, chips: [S`${w} mm fillet, ${(W.electrodes.find((x) => x.value === FEXX) || { label: 'FEXX ' + FEXX + ' MPa' }).label}`, S`t = ${u(t, L)}`] };
  return done();
}
