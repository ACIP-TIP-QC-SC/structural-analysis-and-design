// Column-to-footing bearing and dowels. Pure calculation.
// Units: mm, mm², MPa, kN; footing plan size in m.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings } from '../rc/common.js';
import { ldCompression, lapCompressionMixed } from '../rc/devLength.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force';

// Bearing strengths of the column and of the footing below it, N.
export function bearingStrengths(p, ed) {
  const C = ed.concrete, phi = C.phi.bearing, K = ed.found.dowel, A1 = p.c1 * p.c2;
  const A2 = Math.min(p.c1 + K.frustum * p.h, p.L) * Math.min(p.c2 + K.frustum * p.h, p.B);
  const root = Math.min(Math.sqrt(A2 / A1), K.sqrtMax);
  return { phi, A1, A2, root, col: phi * C.sb * p.fcCol * A1, ftg: phi * C.sb * p.fcFtg * A1 * root };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, K = ed.found.dowel, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  if (!positive(input, ['c1', 'c2', 'fcCol', 'fcFtg', 'B', 'L', 'h', 'Pu'])) return stop('The column, footing, strengths and load need positive numbers.');
  const { c1, c2, fcCol, fcFtg, h, Pu } = input, Bm = input.B * 1000, Lm = input.L * 1000;
  if (Bm < c2 || Lm < c1) return stop('The footing must be at least as large as the column.');
  out.warnings.push(...materialWarnings(fcFtg, null, ed));
  const b = bearingStrengths({ c1, c2, h, B: Bm, L: Lm, fcCol, fcFtg }, ed), colB = b.col / 1e3, ftgB = b.ftg / 1e3;
  rec.add('Bearing on the column concrete', S`φBn = φ · ${C.sb} f'c,col · A1,  φ = ${b.phi}`, S`A1 = ${v(c1, L)} · ${v(c2, L)} = ${u(b.A1, A)};  φBn = ${b.phi} · ${C.sb} · ${v(fcCol, ST)} · ${v(b.A1, A)}`, S`φBn = ${u(colB, F)}`, 'dw.colBearing');
  rec.add('Bearing on the footing', S`φBn = φ · ${C.sb} f'c,ftg · A1 · √(A2 / A1),  √(A2 / A1) ≤ ${K.sqrtMax};  A2 from a frustum with 1 vertical to 2 horizontal slopes, within the footing`,
    S`A2 = ${u(b.A2, A)};  √(A2 / A1) = ${Math.sqrt(b.A2 / b.A1)}${Math.sqrt(b.A2 / b.A1) > K.sqrtMax ? ', use ' + K.sqrtMax : ''}`, S`φBn = ${u(ftgB, F)}`, 'dw.ftgBearing');
  const gov = Math.min(colB, ftgB), excess = Math.max(Pu - gov, 0);
  Object.assign(vals, { A1: b.A1, A2: b.A2, phiBnCol: colB, phiBnFtg: ftgB, excess });
  out.diagram = { c1, c2, h, B: input.B, L: input.L, chips: [S`column ${v(c1, L)} × ${u(c2, L)}`, S`footing ${v(input.B, 'length_m')} × ${u(input.L, 'length_m')}, h = ${u(h, L)}`] };

  if (input.mode === 'bearing') {
    rec.add('Bearing strength against the load', S`Pu ≤ lesser φBn`, S`lesser φBn = ${u(gov, F)}`, excess > 0 ? S`excess = Pu − φBn = ${u(excess, F)}: dowels must carry it` : S`Pu / φBn = ${dc(Pu / gov)}`, colB <= ftgB ? 'dw.colBearing' : 'dw.ftgBearing');
    out.checks.push(check('Bearing on column concrete', ['Pu', Pu, F], ['φBn', colB, F], Pu / colB, 'dw.colBearing'));
    out.checks.push(check('Bearing on footing', ['Pu', Pu, F], ['φBn', ftgB, F], Pu / ftgB, 'dw.ftgBearing'));
    if (excess > 0) out.notes.push('The load exceeds the bearing strength of the concrete. Use the Dowels mode: the excess is carried by the dowels.');
    out.results = [res('φBn column', colB, F), res('φBn footing', ftgB, F), res('Excess', excess, F)];
    return done();
  }

  if (!positive(input, ['fy', 'dbCol', 'dbDowel', 'dbFtg'])) return stop('Give fy and the column, dowel and footing bar sizes.');
  const { fy, dbCol, dbDowel, dbFtg } = input, phi = C.phi.bearing, cover = C.cover.ground;
  const AsExcess = excess * 1e3 / (phi * fy), AsMin = K.minRatio * c1 * c2, AsReq = Math.max(AsExcess, AsMin);
  const n = Math.max(K.minBars, Math.ceil(AsReq / barArea(1, dbDowel) - 1e-9)), AsProv = barArea(n, dbDowel);
  rec.add('Dowel area for the excess load', S`As = (Pu − φBn) / (φ fy)`, S`As = ${v(excess, F)} × 10³ / (${phi} · ${v(fy, ST)})`, S`As = ${u(AsExcess, A)}`, 'dw.colBearing');
  rec.add('Minimum dowel area', S`As,min = ${K.minRatio} Ag of the column;  at least ${K.minBars} bars`, S`As,min = ${K.minRatio} · ${v(c1 * c2, A)} = ${u(AsMin, A)}`,
    S`use ${n} - ${dbDowel} mm dowels, As = ${u(AsProv, A)}`, 'dw.minArea');
  const ldc = ldCompression({ db: dbDowel, fy, fc: fcFtg, lambda: 1, confined: false }, ed).ldc;
  const avail = h - cover - K.footingBarLayers * dbFtg - dbDowel;
  rec.add('Embedment of the dowels in the footing', S`ℓdc of the dowel bar in footing concrete;  available = h − cover − ${K.footingBarLayers} layers of footing bars − dowel diameter`,
    S`ℓdc = ${u(ldc, L)};  available = ${v(h, L)} − ${v(cover, L)} − ${K.footingBarLayers} · ${v(dbFtg, L)} − ${v(dbDowel, L)} = ${u(avail, L)}`, S`${ldc <= avail ? 'enough straight length' : 'not enough straight length'}`, 'dw.embed',
    ldc <= avail ? '' : 'Thicken the footing or use more, smaller dowels. Hooks do not develop bars in compression (' + ed.clauses['dev.hookComp'].nscp + ').');
  const lap = lapCompressionMixed({ db1: dbCol, db2: dbDowel, fy, fc: fcCol, lambda: 1, confined: false }, ed);
  rec.add('Lap of the dowels with the column bars', S`greater of ℓdc of the larger bar (column concrete) and the compression lap of the smaller bar`, S`ℓdc (${lap.big} mm) = ${u(lap.ldcBig, L)};  lap (${lap.little} mm) = ${u(lap.lapSmall, L)}`, S`lap = ${u(lap.lap, L)}`, 'dev.lap.compSizes');
  const dowelCap = phi * AsProv * fy / 1e3;
  out.checks.push(check('Bearing on column concrete', ['Pu', Pu, F], ['φBn + dowels', colB + dowelCap, F], Pu / (colB + dowelCap), 'dw.colBearing', { note: 'dowels carry the load above the concrete bearing strength' }));
  out.checks.push(check('Bearing on footing', ['Pu', Pu, F], ['φBn + dowels', ftgB + dowelCap, F], Pu / (ftgB + dowelCap), 'dw.ftgBearing'));
  out.checks.push(check('Dowel area', ['As required', AsReq, A], ['As provided', AsProv, A], AsReq / AsProv, 'dw.minArea'));
  out.checks.push(check('Embedment', ['ℓdc', ldc, L], ['available', avail, L], ldc / avail, 'dw.embed'));
  Object.assign(vals, { AsExcess, AsMin, AsReq, nDowels: n, AsProv, ldcFtg: ldc, ldcCol: lap.ldcBig, lapSmall: lap.lapSmall, lap: lap.lap, avail });
  out.results = [res('φBn column', colB, F), res('φBn footing', ftgB, F), res('Dowels', n + ' - ' + dbDowel + ' mm', 'text'), res('ℓdc in the footing', ldc, L), res('Available', avail, L), res('Lap with column bars', lap.lap, L)];
  Object.assign(out.diagram, { dowel: true, ldc, lap: lap.lap, avail, cover });
  return done();
}
