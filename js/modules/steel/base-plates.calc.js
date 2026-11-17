// Column base plates under axial load: bearing on concrete, plate thickness, anchor rods. Pure calculation.
// Units: mm, mm², MPa, kN.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { available } from './common.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force';

// Nominal bearing strength, N. A2 is the largest area of the support similar to and concentric with the plate.
export function bearingPp(p, ed) {
  const K = ed.steel.basePlate.bearing, A1 = p.B * p.N;
  const scale = Math.max(Math.min(p.Bs / p.B, p.Ns / p.N), 1), A2 = A1 * scale * scale, full = scale <= 1 + 1e-9;
  const Pp = full ? K.k * p.fc * A1 : Math.min(K.k * p.fc * A1 * Math.sqrt(A2 / A1), K.cap * p.fc * A1);
  return { A1, A2, full, Pp, root: Math.sqrt(A2 / A1) };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, BP = ed.steel.basePlate, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD', asd = method === 'ASD';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const cap = asd ? 'Rn/Ω' : 'φRn', dem = asd ? 'Pa' : 'Pu';
  out.notes.push(BP.scopeNote);

  if (input.mode === 'anchors') {
    const K = BP.anchor;
    if (!positive(input, ['rod', 'Fu', 'nRods'])) return stop('Give the rod size, Fu and the number of rods.');
    const Ab = Math.PI * input.rod * input.rod / 4, Fnt = K.nt * input.Fu, Fnv = (input.threads === 'X' ? K.nvX : K.nvN) * input.Fu;
    const Rt = Fnt * Ab / 1e3, Rv = Fnv * Ab / 1e3, aT = available(Rt, K, method), aV = available(Rv, K, method);
    rec.add('Rod area and nominal stresses', S`Ab = π d² / 4 (unthreaded);  Fnt = ${K.nt} Fu;  Fnv = ${input.threads === 'X' ? K.nvX : K.nvN} Fu (threads ${input.threads === 'X' ? 'excluded from' : 'in'} the shear plane)`,
      S`Ab = ${u(Ab, A)};  Fnt = ${u(Fnt, ST)};  Fnv = ${u(Fnv, ST)}`, S`tension Rn = ${u(Rt, F)} (${cap} ${u(aT, F)});  shear Rn = ${u(Rv, F)} (${cap} ${u(aV, F)})`, 'bp.anchorStress');
    const n = Math.round(input.nRods), T = input.T > 0 ? input.T / n : 0, V = input.V > 0 ? input.V / n : 0;
    Object.assign(vals, { Ab, RnT: Rt, LRFDt: K.phi * Rt, ASDt: Rt / K.omega, RnV: Rv, LRFDv: K.phi * Rv, ASDv: Rv / K.omega });
    if (T > 0) out.checks.push(check('Rod tension', [(asd ? 'Ta' : 'Tu') + ' per rod', T, F], [cap, aT, F], T / aT, 'bp.anchor'));
    if (V > 0) out.checks.push(check('Rod shear', [(asd ? 'Va' : 'Vu') + ' per rod', V, F], [cap, aV, F], V / aV, 'bp.anchor'));
    if (T > 0 && V > 0) {
      const k13 = ed.steel.bolt.combined.k, frv = V * 1e3 / Ab, raw = asd ? k13 * Fnt - K.omega * Fnt / Fnv * frv : k13 * Fnt - Fnt / (K.phi * Fnv) * frv;
      const Fp = Math.max(0, Math.min(Fnt, raw)), aC = available(Fp * Ab / 1e3, K, method);
      rec.add('Combined tension and shear', asd ? S`F'nt = 1.3 Fnt − (Ω Fnt / Fnv) frv ≤ Fnt` : S`F'nt = 1.3 Fnt − (Fnt / (φ Fnv)) frv ≤ Fnt`, S`frv = ${u(frv, ST)}`, S`F'nt = ${u(Fp, ST)};  ${cap} = ${u(aC, F)} per rod`, 'bolt.combined');
      out.checks.push(check('Combined tension and shear', [(asd ? 'Ta' : 'Tu') + ' per rod', T, F], [cap + " with F'nt", aC, F], T / aC, 'bolt.combined'));
      vals.FntMod = Fp;
    }
    if (!(T > 0) && !(V > 0)) out.notes.push('Enter the uplift or shear to check the rods.');
    out.notes.push(BP.concreteNote);
    out.results = [res('Ab', Ab, A), res('Tension ' + cap, aT, F), res('Shear ' + cap, aV, F)];
    out.diagram = { kind: 'anchors', n, rod: input.rod, chips: [S`${n} rods, d = ${u(input.rod, L)}`] };
    return done();
  }

  if (!positive(input, ['B', 'N', 'Bs', 'Ns', 'fc']) || !(input.P >= 0)) return stop('Give the plate, the support and f\'c.');
  const K = BP.bearing, b = bearingPp({ B: input.B, N: input.N, Bs: input.Bs, Ns: input.Ns, fc: input.fc }, ed), Pp = b.Pp / 1e3, aPp = available(Pp, K, method);
  if (input.Bs < input.B || input.Ns < input.N) return stop('The support must be at least as large as the plate.');
  rec.add('Areas', S`A1 = B N;  A2 = largest area of the support similar to and concentric with the plate`, S`A1 = ${v(input.B, L)} · ${v(input.N, L)} = ${u(b.A1, A)}`, S`A2 = ${u(b.A2, A)}`, 'bp.bearing');
  rec.add('Bearing strength of the concrete', b.full ? S`full area of the support: Pp = ${K.k} f'c A1` : S`Pp = ${K.k} f'c A1 √(A2 / A1) ≤ ${K.cap} f'c A1`, S`√(A2 / A1) = ${b.root}`,
    S`Pp = ${u(Pp, F)};  ${asd ? S`Pp / Ωc = Pp / ${K.omega}` : S`φc Pp = ${K.phi} Pp`} = ${u(aPp, F)}`, 'bp.bearing', 'φc = ' + K.phi + ' and Ωc = ' + K.omega + ' as printed in NSCP 2015.');
  Object.assign(vals, { A1: b.A1, A2: b.A2, Pp, phiPp: K.phi * Pp, PpASD: Pp / K.omega });
  const P = input.P;
  out.diagram = { kind: 'plate', B: input.B, N: input.N, Bs: input.Bs, Ns: input.Ns, d: input.dsec, bf: input.bf, chips: [S`plate ${v(input.B, L)} × ${u(input.N, L)}`, S`f'c = ${u(input.fc, ST)}`] };
  if (P > 0) out.checks.push(check('Bearing on concrete', [dem, P, F], [asd ? 'Pp/Ωc' : 'φcPp', aPp, F], P / aPp, 'bp.bearing'));

  if (input.mode === 'bearing') {
    const ratio = input.A2A1 > 0 ? input.A2A1 : 1, A1req = P * 1e3 / ((asd ? 1 / K.omega : K.phi) * Math.min(K.k * input.fc * Math.sqrt(ratio), K.cap * input.fc));
    if (P > 0) {
      rec.add('Plate area required (design helper)', S`A1 = P / (${asd ? '1/Ωc' : 'φc'} · ${K.k} f'c √(A2/A1)) with an assumed A2 / A1, √(A2/A1) ≤ ${K.cap / K.k}`, S`A2 / A1 assumed = ${ratio}`, S`A1 required = ${u(A1req, A)} (square side ${u(Math.sqrt(A1req), L)})`, 'bp.bearing');
      vals.A1req = A1req;
    }
    out.results = [res('A1', b.A1, A), res('A2', b.A2, A), res('Pp', Pp, F), res(asd ? 'Pp/Ωc' : 'φcPp', aPp, F)];
    return done();
  }

  // Plate thickness, cantilever method
  if (!positive(input, ['dsec', 'bf', 'Fy']) || !(P > 0)) return stop('Give the column d and bf, the plate Fy and the load.');
  const C = BP.cantilever, Y = BP.yield, d = input.dsec, bf = input.bf, Bp = input.B, Np = input.N;
  const m = (Np - C.m * d) / 2, n = (Bp - C.n * bf) / 2;
  const X = Math.min(C.xK * d * bf / Math.pow(d + bf, 2) * (asd ? K.omega * P / Pp : P / (K.phi * Pp)), 1);
  const lam = Math.min(2 * Math.sqrt(X) / (1 + Math.sqrt(1 - X)), 1), lamN = lam * Math.sqrt(d * bf) / C.lamDiv, l = Math.max(m, n, lamN);
  const t = asd ? l * Math.sqrt(2 * Y.omega * P * 1e3 / (input.Fy * Bp * Np)) : l * Math.sqrt(2 * P * 1e3 / (Y.phi * input.Fy * Bp * Np));
  const tUse = BP.plates.find((x) => x >= t - 1e-9);
  rec.add('Cantilever dimensions', S`m = (N − ${C.m} d) / 2;  n = (B − ${C.n} bf) / 2`, S`m = (${v(Np, L)} − ${C.m} · ${v(d, L)}) / 2;  n = (${v(Bp, L)} − ${C.n} · ${v(bf, L)}) / 2`, S`m = ${u(m, L)},  n = ${u(n, L)}`, 'theory.plain');
  rec.add('Thornton factor', asd ? S`X = [${C.xK} d bf / (d + bf)²] Ωc Pa / Pp ≤ 1;  λ = 2√X / (1 + √(1 − X)) ≤ 1;  λn' = λ √(d bf) / ${C.lamDiv}` : S`X = [${C.xK} d bf / (d + bf)²] Pu / (φc Pp) ≤ 1;  λ = 2√X / (1 + √(1 − X)) ≤ 1;  λn' = λ √(d bf) / ${C.lamDiv}`,
    S`X = ${X};  λ = ${lam}`, S`λn' = ${u(lamN, L)};  ℓ = largest of m, n, λn' = ${u(l, L)}`, 'theory.plain');
  rec.add('Plate thickness', asd ? S`t = ℓ √(2 · ${Y.omega} Pa / (Fy B N))` : S`t = ℓ √(2 Pu / (${Y.phi} Fy B N))`, S`t = ${v(l, L)} √(2 · ${asd ? Y.omega + ' · ' : ''}${v(P, F)} × 10³ / (${asd ? '' : Y.phi + ' · '}${v(input.Fy, ST)} · ${v(Bp, L)} · ${v(Np, L)}))`,
    tUse ? S`t = ${u(t, L)};  use ${u(tUse, L)}` : S`t = ${u(t, L)};  thicker than the plate list`, 'theory.plain');
  Object.assign(vals, { m, n, X, lam, lamN, l, t, tUse });
  if (input.tProv > 0) out.checks.push(check('Plate thickness', ['t required', t, L], ['t provided', input.tProv, L], t / input.tProv, 'theory.plain'));
  out.results = [res(asd ? 'Pp/Ωc' : 'φcPp', aPp, F), res('m', m, L), res('n', n, L), res('ℓ', l, L), res('t required', t, L), res('Plate to use', tUse ? tUse : t, L)];
  return done();
}
