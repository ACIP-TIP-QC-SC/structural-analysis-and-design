// Steel compression members: flexural buckling. Pure calculation.
// Units: mm, mm², MPa, kN.
import { S, v, u, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { gradeOf, available } from './common.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force';

// Local buckling class for uniform compression. Returns limits and whether an element is slender.
export function compressionLocal(p, ed) {
  const r = Math.sqrt(ed.steel.E / p.Fy), flangeLimit = ed.steel.local.compFlange.lr * r, webLimit = ed.steel.local.compWeb.lr * r;
  return { flangeLimit, webLimit, slender: p.bf2tf > flangeLimit || p.htw > webLimit };
}
// Flexural buckling strength. p: { Ag, rx, ry, Fy, Kx, Lx, Ky, Ly }. Pn in N.
export function compressiveStrength(p, ed) {
  const K = ed.steel.compression, E = ed.steel.E;
  const klrx = p.Kx * p.Lx / p.rx, klry = p.Ky * p.Ly / p.ry, axis = klrx > klry ? 'x' : 'y', klr = Math.max(klrx, klry);
  const limit = K.limit * Math.sqrt(E / p.Fy), Fe = Math.PI * Math.PI * E / (klr * klr), inelastic = klr <= limit;
  const Fcr = inelastic ? Math.pow(K.inelastic, p.Fy / Fe) * p.Fy : K.elastic * Fe;
  return { klrx, klry, klr, axis, limit, Fe, Fcr, inelastic, Pn: Fcr * p.Ag };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, SE = ed.steel, K = SE.compression, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const { Fy, label } = gradeOf(input, ed);
  if (!(Fy > 0) || !positive(input, ['Ag', 'rx', 'ry', 'bf2tf', 'htw', 'Kx', 'Lx', 'Ky', 'Ly']) || !(input.P >= 0)) return stop('Every section property, length and load needs a positive number.');
  const { Ag, rx, ry, bf2tf, htw, Kx, Lx, Ky, Ly, P } = input;
  out.diagram = { dsec: input.dsec, bf: input.bf, tf: input.tf, tw: input.tw, chips: [[label + ': '].concat(S`Fy = ${u(Fy, ST)}`), S`KLx = ${u(Kx * Lx, L)}, KLy = ${u(Ky * Ly, L)}`] };
  const loc = compressionLocal({ Fy, bf2tf, htw }, ed);
  Object.assign(vals, { flangeLimit: loc.flangeLimit, webLimit: loc.webLimit, slender: loc.slender });
  rec.add('Local buckling check', S`flange: bf / 2tf ≤ ${SE.local.compFlange.lr} √(E / Fy);  web: h / tw ≤ ${SE.local.compWeb.lr} √(E / Fy)`,
    S`flange: ${bf2tf} against ${loc.flangeLimit};  web: ${htw} against ${loc.webLimit}`, [loc.slender ? 'The section has slender elements.' : 'No slender elements: the full section is effective.'], 'steel.local');
  if (loc.slender) return stop(K.slenderMessage);
  const s = compressiveStrength({ Ag, rx, ry, Fy, Kx, Lx, Ky, Ly }, ed), Pn = s.Pn / 1e3, Pa = available(Pn, K, method);
  rec.add('Slenderness ratios', S`KL / r about each axis`, S`x: ${Kx} · ${v(Lx, L)} / ${v(rx, L)} = ${s.klrx};  y: ${Ky} · ${v(Ly, L)} / ${v(ry, L)} = ${s.klry}`, S`KL / r = ${s.klr} (${s.axis} axis governs)`, 'steel.comp.slenderness');
  if (s.klr > K.klrMax) out.notes.push('KL/r is above ' + K.klrMax + ', the preferred maximum for compression members (' + ed.clauses['steel.comp.slenderness'].nscp + ').');
  rec.add('Elastic buckling stress', S`Fe = π² E / (KL / r)²`, S`Fe = π² · ${v(SE.E, ST)} / ${s.klr}²`, S`Fe = ${u(s.Fe, ST)}`, 'steel.comp.Fcr');
  rec.add('Critical stress', s.inelastic ? S`KL / r ≤ ${K.limit} √(E / Fy): Fcr = ${K.inelastic}^(Fy / Fe) · Fy` : S`KL / r > ${K.limit} √(E / Fy): Fcr = ${K.elastic} Fe`,
    s.inelastic ? S`${s.klr} ≤ ${s.limit};  Fcr = ${K.inelastic}^(${v(Fy, ST)} / ${v(s.Fe, ST)}) · ${v(Fy, ST)}` : S`${s.klr} > ${s.limit};  Fcr = ${K.elastic} · ${v(s.Fe, ST)}`,
    S`Fcr = ${u(s.Fcr, ST)}`, 'steel.comp.Fcr', s.inelastic ? 'Inelastic buckling.' : 'Elastic buckling.');
  rec.add('Compressive strength', S`Pn = Fcr · Ag`, S`Pn = ${v(s.Fcr, ST)} · ${v(Ag, A)}`, method === 'ASD' ? S`Pn = ${u(Pn, F)};  Pn / Ω = ${v(Pn, F)} / ${K.omega} = ${u(Pa, F)}` : S`Pn = ${u(Pn, F)};  φPn = ${K.phi} · ${v(Pn, F)} = ${u(Pa, F)}`, 'steel.comp.Fcr');
  Object.assign(vals, { klrx: s.klrx, klry: s.klry, klr: s.klr, axis: s.axis, limit: s.limit, Fe: s.Fe, Fcr: s.Fcr, inelastic: s.inelastic, Pn, LRFD: K.phi * Pn, ASD: Pn / K.omega, avail: Pa });
  out.checks.push(check('Compressive strength', [method === 'ASD' ? 'Pa' : 'Pu', P, F], [method === 'ASD' ? 'Pn/Ω' : 'φPn', Pa, F], P / Pa, 'steel.comp.Fcr'));
  out.results = [res('KL/r, x', s.klrx), res('KL/r, y', s.klry), res('Fe', s.Fe, ST), res('Fcr', s.Fcr, ST), res('Pn', Pn, F), res('Available strength', Pa, F)];
  Object.assign(out.diagram, { axis: s.axis, klr: s.klr });
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}
