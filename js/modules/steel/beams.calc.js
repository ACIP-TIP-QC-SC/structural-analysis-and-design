// Steel beams: flexure with lateral-torsional buckling, shear and deflection. Pure calculation.
// Units: mm, mm³, mm⁴, MPa, kN, kN·m, kN/m.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { gradeOf, available } from './common.js';

const L = 'length_mm', ST = 'stress', F = 'force', M = 'moment', Z = 'modulus3';
export const WEB_OUT = 'Sections with noncompact or slender webs are outside this calculator.';

// Lateral-torsional buckling modification factor (clause key steel.flex.Cb).
export function cbFactor(Mmax, MA, MB, MC, ed) {
  const c = ed.steel.flexure.cb, a = Math.abs;
  return Math.min(c.num * a(Mmax) / (c.max * a(Mmax) + c.a * a(MA) + c.b * a(MB) + c.c * a(MC)) * c.Rm, c.cap);
}
// Local buckling class in flexure.
export function flexureLocal(p, ed) {
  const r = Math.sqrt(ed.steel.E / p.Fy), Lc = ed.steel.local;
  const lpf = Lc.flexFlange.lp * r, lrf = Lc.flexFlange.lr * r, lpw = Lc.flexWeb.lp * r, lrw = Lc.flexWeb.lr * r;
  return { lpf, lrf, lpw, lrw, flange: p.bf2tf <= lpf ? 'compact' : p.bf2tf <= lrf ? 'noncompact' : 'slender', web: p.htw <= lpw ? 'compact' : p.htw <= lrw ? 'noncompact' : 'slender' };
}
// Limiting unbraced lengths Lp and Lr (c = 1 for doubly symmetric I-shapes).
export function ltbLengths(p, ed) {
  const X = ed.steel.flexure, E = ed.steel.E, jc = p.J / (p.Sx * p.ho), r7 = X.residual * p.Fy;
  return { Lp: X.lp * p.ry * Math.sqrt(E / p.Fy), Lr: X.lr * p.rts * (E / r7) * Math.sqrt(jc) * Math.sqrt(1 + Math.sqrt(1 + X.lrK * Math.pow(r7 / (E * jc), 2))) };
}
// Nominal flexural strength of a doubly symmetric I-shape about its major axis, N·mm.
// p: { Zx, Sx, ry, J, rts, ho, bf2tf, htw, Fy, Lb, Cb }.
export function flexuralStrengthI(p, ed) {
  const X = ed.steel.flexure, E = ed.steel.E, loc = flexureLocal(p, ed), Mp = p.Fy * p.Zx, Mr = X.residual * p.Fy * p.Sx, { Lp, Lr } = ltbLengths(p, ed);
  let zone, MnLtb, Fcr = null;
  if (p.Lb <= Lp) { zone = 'yielding'; MnLtb = Mp; }
  else if (p.Lb <= Lr) { zone = 'inelastic'; MnLtb = Math.min(p.Cb * (Mp - (Mp - Mr) * (p.Lb - Lp) / (Lr - Lp)), Mp); }
  else {
    zone = 'elastic';
    const sl = p.Lb / p.rts;
    Fcr = p.Cb * Math.PI * Math.PI * E / (sl * sl) * Math.sqrt(1 + X.fcrK * (p.J / (p.Sx * p.ho)) * sl * sl);
    MnLtb = Math.min(Fcr * p.Sx, Mp);
  }
  const MnFlb = loc.flange === 'noncompact' ? Mp - (Mp - Mr) * (p.bf2tf - loc.lpf) / (loc.lrf - loc.lpf) : null;
  return { loc, Mp, Mr, Lp, Lr, zone, Fcr, MnLtb, MnFlb, Mn: MnFlb == null ? MnLtb : Math.min(MnLtb, MnFlb) };
}
// Minor axis flexure (clause key steel.flex.minor), N·mm.
export function flexuralStrengthMinor(p, ed) { return Math.min(p.Fy * p.Zy, ed.steel.flexure.minorCap * p.Fy * p.Sy); }
// Shear strength of the web, N. Returns the phi and omega pair that applies.
export function shearStrengthI(p, ed) {
  const H = ed.steel.shear, E = ed.steel.E, Aw = p.dsec * p.tw, lim = H.rolled.limit * Math.sqrt(E / p.Fy);
  if (p.htw <= lim) return { Aw, rolled: true, lim, Cv: H.rolled.Cv, pair: H.rolled, Vn: H.k * p.Fy * Aw * H.rolled.Cv };
  const a = H.c1 * Math.sqrt(H.kv * E / p.Fy), b = H.c2 * Math.sqrt(H.kv * E / p.Fy);
  const Cv = p.htw <= a ? 1.0 : p.htw <= b ? a / p.htw : H.c3 * E * H.kv / (p.htw * p.htw * p.Fy);
  return { Aw, rolled: false, lim, a, b, Cv, pair: H.other, Vn: H.k * p.Fy * Aw * Cv };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, SE = ed.steel, X = SE.flexure, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD', asd = method === 'ASD';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const sec = { dsec: input.dsec, bf: input.bf, tf: input.tf, tw: input.tw };

  if (input.mode === 'deflection') {
    if (!positive(input, ['span', 'Ix', 'limitRatio']) || !(input.load > 0)) return stop('The span, the load, Ix and the limit ratio need positive numbers.');
    const T = ed.theory.deflection[input.defCase] || ed.theory.deflection.simpleUniform, E = SE.E, Ls = input.span;
    const delta = T.point ? T.k * input.load * 1e3 * Math.pow(Ls, 3) / (E * input.Ix) : T.k * input.load * Math.pow(Ls, 4) / (E * input.Ix);
    const limit = Ls / input.limitRatio;
    rec.add('Deflection', ['Δ = ' + T.label], T.point ? S`P = ${u(input.load, F)}, L = ${u(Ls, L)}, E = ${u(E, ST)}, I = ${u(input.Ix, 'inertia')}` : S`w = ${u(input.load, 'lineload')}, L = ${u(Ls, L)}, E = ${u(E, ST)}, I = ${u(input.Ix, 'inertia')}`, S`Δ = ${u(delta, L)}`, 'theory.mechanics');
    rec.add('Deflection limit', S`Δ,limit = L / ${input.limitRatio}`, S`${v(Ls, L)} / ${input.limitRatio}`, S`Δ,limit = ${u(limit, L)};  Δ / Δ,limit = ${dc(delta / limit)}`, 'steel.deflection');
    out.notes.push(SE.deflection.note);
    out.checks.push(check('Deflection', ['Δ', delta, L], ['L/' + input.limitRatio, limit, L], delta / limit, 'steel.deflection'));
    out.results = [res('Δ', delta, L), res('Limit', limit, L), res('L / Δ', Ls / delta)];
    Object.assign(vals, { delta, limit });
    out.diagram = { kind: 'deflection', cantilever: /^cantilever/.test(input.defCase), point: T.point, delta, span: Ls, chips: [S`L = ${u(Ls, L)}`, S`Ix = ${u(input.Ix, 'inertia')}`] };
    return done();
  }

  const { Fy, label } = gradeOf(input, ed);
  if (!(Fy > 0)) return stop('Fy needs a positive number.');

  if (input.mode === 'shear') {
    if (!positive(input, ['dsec', 'tw', 'htw']) || !(input.V >= 0)) return stop('d, tw, h/tw and the shear need positive numbers.');
    if (input.htw >= SE.shear.htwMax) return stop('h/tw must be below ' + SE.shear.htwMax + ' for an unstiffened web.');
    const s = shearStrengthI({ dsec: input.dsec, tw: input.tw, htw: input.htw, Fy }, ed), Vn = s.Vn / 1e3, Va = available(Vn, s.pair, method);
    out.diagram = Object.assign({ kind: 'shear', chips: [[label + ': '].concat(S`Fy = ${u(Fy, ST)}`), S`d = ${u(input.dsec, L)}, tw = ${u(input.tw, L)}`] }, sec);
    rec.add('Web area', S`Aw = d · tw`, S`Aw = ${v(input.dsec, L)} · ${v(input.tw, L)}`, S`Aw = ${u(s.Aw, 'area')}`, 'steel.shear');
    rec.add('Web shear coefficient', S`h / tw against ${SE.shear.rolled.limit} √(E / Fy)`, S`${input.htw} against ${s.lim}`, S`Cv = ${s.Cv}`, 'steel.shear',
      s.rolled ? 'Rolled I-shape web within the limit: Cv = 1.0 with φ = ' + SE.shear.rolled.phi + ' (Ω = ' + SE.shear.rolled.omega + ').' : 'Web beyond the rolled I-shape limit: kv = ' + SE.shear.kv + ' and Cv from ' + ed.clauses['steel.shearCv'].nscp + ', with φ = ' + SE.shear.other.phi + ' (Ω = ' + SE.shear.other.omega + ').');
    rec.add('Shear strength', S`Vn = ${SE.shear.k} · Fy · Aw · Cv`, S`Vn = ${SE.shear.k} · ${v(Fy, ST)} · ${v(s.Aw, 'area')} · ${s.Cv}`, asd ? S`Vn = ${u(Vn, F)};  Vn / Ω = ${v(Vn, F)} / ${s.pair.omega} = ${u(Va, F)}` : S`Vn = ${u(Vn, F)};  φVn = ${s.pair.phi} · ${v(Vn, F)} = ${u(Va, F)}`, 'steel.shear');
    out.checks.push(check('Shear strength', [asd ? 'Va' : 'Vu', input.V, F], [asd ? 'Vn/Ω' : 'φVn', Va, F], input.V / Va, 'steel.shear'));
    out.results = [res('Aw', s.Aw, 'area'), res('Cv', s.Cv), res('Vn', Vn, F), res('Available strength', Va, F)];
    Object.assign(vals, { Aw: s.Aw, shearLimit: s.lim, Cv: s.Cv, Vn, LRFD: s.pair.phi * Vn, ASD: Vn / s.pair.omega, avail: Va });
    return done();
  }

  // Flexure
  const minor = input.axis === 'minor';
  const need = minor ? ['Zy', 'Sy', 'bf2tf', 'htw'] : ['Zx', 'Sx', 'ry', 'J', 'rts', 'ho', 'bf2tf', 'htw', 'Lb'];
  if (!positive(input, need) || !(input.Mreq >= 0)) return stop('Every section property, length and moment needs a positive number.');
  out.diagram = Object.assign({ kind: 'flexure', chips: [[label + ': '].concat(S`Fy = ${u(Fy, ST)}`)] }, sec);
  const loc = flexureLocal({ Fy, bf2tf: input.bf2tf, htw: input.htw }, ed);
  Object.assign(vals, { flangeLp: loc.lpf, flangeLr: loc.lrf, webLp: loc.lpw, flange: loc.flange, web: loc.web });
  rec.add('Local buckling class', S`flange: λp = ${SE.local.flexFlange.lp} √(E / Fy), λr = ${SE.local.flexFlange.lr} √(E / Fy);  web: λp = ${SE.local.flexWeb.lp} √(E / Fy), λr = ${SE.local.flexWeb.lr} √(E / Fy)`,
    S`flange: ${input.bf2tf} against ${loc.lpf} and ${loc.lrf};  web: ${input.htw} against ${loc.lpw} and ${loc.lrw}`, ['Flange is ' + loc.flange + ', web is ' + loc.web + '.'], 'steel.local');
  if (loc.web !== 'compact') return stop(WEB_OUT);
  if (loc.flange === 'slender') return stop('Sections with slender flanges are outside this calculator.');
  const cap = asd ? 'Mn/Ω' : 'φMn', dem = asd ? 'Ma' : 'Mu';
  const fin = (MnNmm) => {
    const Mn = MnNmm / 1e6, Ma = available(Mn, X, method);
    rec.add('Available flexural strength', asd ? S`Mn / Ω` : S`φMn`, asd ? S`${v(Mn, M)} / ${X.omega}` : S`${X.phi} · ${v(Mn, M)}`, S`${cap} = ${u(Ma, M)}`, minor ? 'steel.flex.minor' : 'steel.flex.yield');
    Object.assign(vals, { Mn, LRFD: X.phi * Mn, ASD: Mn / X.omega, avail: Ma });
    out.checks.push(check('Flexural strength', [dem, input.Mreq, M], [cap, Ma, M], input.Mreq / Ma, minor ? 'steel.flex.minor' : 'steel.flex.ltb'));
    return Ma;
  };
  if (minor) {
    if (loc.flange !== 'compact') return stop('Minor axis bending of sections with noncompact flanges is outside this calculator.');
    const Mn = flexuralStrengthMinor({ Fy, Zy: input.Zy, Sy: input.Sy }, ed);
    rec.add('Minor axis strength', S`Mn = Fy · Zy ≤ ${X.minorCap} · Fy · Sy`, S`Mn = lesser of ${v(Fy, ST)} · ${v(input.Zy, Z)} and ${X.minorCap} · ${v(Fy, ST)} · ${v(input.Sy, Z)}`, S`Mn = ${u(Mn / 1e6, M)}`, 'steel.flex.minor', 'Lateral-torsional buckling does not apply to bending about the minor axis.');
    const Ma = fin(Mn);
    out.results = [res('Mn', Mn / 1e6, M), res('Available strength', Ma, M)];
    out.diagram.minor = true;
    return done();
  }
  let Cb = input.Cb;
  if (input.cbFrom === 'moments') {
    if (!positive(input, ['Mmax']) || !(input.MA >= 0 || input.MA < 0)) return stop('Give the moments Mmax, MA, MB and MC for Cb.');
    Cb = cbFactor(input.Mmax, input.MA, input.MB, input.MC, ed);
    rec.add('Lateral-torsional buckling modification factor', S`Cb = ${X.cb.num} Mmax / (${X.cb.max} Mmax + ${X.cb.a} MA + ${X.cb.b} MB + ${X.cb.c} MC) · Rm ≤ ${X.cb.cap}`,
      S`Cb = ${X.cb.num} · ${v(Math.abs(input.Mmax), M)} / (${X.cb.max} · ${v(Math.abs(input.Mmax), M)} + ${X.cb.a} · ${v(Math.abs(input.MA), M)} + ${X.cb.b} · ${v(Math.abs(input.MB), M)} + ${X.cb.c} · ${v(Math.abs(input.MC), M)}) · ${X.cb.Rm}`, S`Cb = ${Cb}`, 'steel.flex.Cb', 'Absolute values of the moments at the quarter, centre and three-quarter points of the unbraced segment.');
  }
  if (!(Cb > 0)) return stop('Cb needs a positive number.');
  const p = { Zx: input.Zx, Sx: input.Sx, ry: input.ry, J: input.J, rts: input.rts, ho: input.ho, bf2tf: input.bf2tf, htw: input.htw, Fy, Lb: input.Lb, Cb };
  const s = flexuralStrengthI(p, ed), E = SE.E;
  rec.add('Plastic moment', S`Mp = Fy · Zx`, S`Mp = ${v(Fy, ST)} · ${v(input.Zx, Z)}`, S`Mp = ${u(s.Mp / 1e6, M)}`, 'steel.flex.yield');
  rec.add('Limiting unbraced lengths', S`Lp = ${X.lp} ry √(E / Fy);  Lr = ${X.lr} rts (E / (${X.residual} Fy)) √(J c / (Sx ho)) √(1 + √(1 + ${X.lrK} (${X.residual} Fy Sx ho / (E J c))²))`,
    S`ry = ${u(input.ry, L)}, rts = ${u(input.rts, L)}, J = ${u(input.J, 'inertia')}, Sx = ${u(input.Sx, Z)}, ho = ${u(input.ho, L)}, c = 1`, S`Lp = ${u(s.Lp, L)},  Lr = ${u(s.Lr, L)}`, 'steel.flex.ltb');
  if (s.zone === 'yielding') rec.add('Lateral-torsional buckling', S`Lb ≤ Lp: Mn = Mp`, S`Lb = ${u(input.Lb, L)} ≤ Lp = ${u(s.Lp, L)}`, S`Mn = ${u(s.MnLtb / 1e6, M)}`, 'steel.flex.yield', 'Yielding governs; lateral-torsional buckling does not apply.');
  else if (s.zone === 'inelastic') rec.add('Lateral-torsional buckling', S`Lp < Lb ≤ Lr: Mn = Cb [Mp − (Mp − ${X.residual} Fy Sx)(Lb − Lp) / (Lr − Lp)] ≤ Mp`,
    S`Mn = ${Cb} [${v(s.Mp / 1e6, M)} − (${v(s.Mp / 1e6, M)} − ${v(s.Mr / 1e6, M)})(${v(input.Lb, L)} − ${v(s.Lp, L)}) / (${v(s.Lr, L)} − ${v(s.Lp, L)})]`, S`Mn = ${u(s.MnLtb / 1e6, M)}`, 'steel.flex.ltb', 'Inelastic lateral-torsional buckling.' + (s.MnLtb >= s.Mp ? ' Limited by Mp.' : ''));
  else rec.add('Lateral-torsional buckling', S`Lb > Lr: Mn = Fcr Sx ≤ Mp;  Fcr = (Cb π² E / (Lb / rts)²) √(1 + ${X.fcrK} (J c / (Sx ho)) (Lb / rts)²)`,
    S`Lb / rts = ${input.Lb / input.rts};  Fcr = ${u(s.Fcr, ST)}`, S`Mn = ${v(s.Fcr, ST)} · ${v(input.Sx, Z)} = ${u(s.MnLtb / 1e6, M)}`, 'steel.flex.ltb', 'Elastic lateral-torsional buckling.' + (s.MnLtb >= s.Mp ? ' Limited by Mp.' : ''));
  if (s.MnFlb != null) rec.add('Flange local buckling', S`Mn = Mp − (Mp − ${X.residual} Fy Sx)(λ − λpf) / (λrf − λpf)`, S`Mn = ${v(s.Mp / 1e6, M)} − (${v(s.Mp / 1e6, M)} − ${v(s.Mr / 1e6, M)})(${input.bf2tf} − ${loc.lpf}) / (${loc.lrf} − ${loc.lpf})`, S`Mn = ${u(s.MnFlb / 1e6, M)};  governing Mn = ${u(s.Mn / 1e6, M)}`, 'steel.flex.flb', 'Noncompact flange: the lower of lateral-torsional buckling and flange local buckling governs.');
  const Ma = fin(s.Mn);
  Object.assign(vals, { Mp: s.Mp / 1e6, Lp: s.Lp, Lr: s.Lr, zone: s.zone, Cb, MnLtb: s.MnLtb / 1e6 });
  out.results = [res('Mp', s.Mp / 1e6, M), res('Lp', s.Lp, L), res('Lr', s.Lr, L), res('Cb', Cb), res('Mn', s.Mn / 1e6, M), res('Available strength', Ma, M)];
  // Curve of available moment against unbraced length, for the chart.
  const top = Math.max(1.6 * s.Lr, 1.25 * input.Lb), curve = [];
  for (let i = 0; i <= 60; i++) { const Lb = top * i / 60; curve.push([Lb, available(flexuralStrengthI(Object.assign({}, p, { Lb }), ed).Mn / 1e6, X, method)]); }
  Object.assign(out.diagram, { curve, Lp: s.Lp, Lr: s.Lr, Lb: input.Lb, avail: Ma, Mreq: input.Mreq });
  out.diagram.chips.push(S`Lb = ${u(input.Lb, L)}, Cb = ${Cb}`);
  return done();
}
