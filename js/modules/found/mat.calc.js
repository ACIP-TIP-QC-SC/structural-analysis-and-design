// Mat foundations by the conventional rigid method ("Theory"). Pure calculation.
// Units: m, kN, kPa, kN/m, kN·m. Coordinates from the centre of the mat; x along B, y along L.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { beamDiagrams } from './combined.calc.js';
import { factoredGravity } from './isolated.calc.js';

const LM = 'length_m', PR = 'pressure', F = 'force', M = 'moment', LL = 'lineload';

// Pressure function and resultant of a set of column loads on a rigid mat.
export function rigidMat(B, Lm, cols) {
  const Q = cols.reduce((t, c) => t + c.P, 0), Mx = cols.reduce((t, c) => t + c.P * c.y, 0), My = cols.reduce((t, c) => t + c.P * c.x, 0);
  const Ix = B * Math.pow(Lm, 3) / 12, Iy = Lm * Math.pow(B, 3) / 12;
  return { Q, ex: My / Q, ey: Mx / Q, Mx, My, Ix, Iy, q: (x, y) => Q / (B * Lm) + My * x / Iy + Mx * y / Ix };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  if (!positive(input, ['B', 'Lm'])) return stop('Give the plan size of the mat.');
  const { B, Lm } = input, factored = input.loads === 'factored';
  const raw = (input.columns || []).filter((c) => c && isFinite(c.x) && isFinite(c.y));
  if (!raw.length) return stop('Add at least one column.');
  if (raw.some((c) => Math.abs(c.x) > B / 2 + 1e-9 || Math.abs(c.y) > Lm / 2 + 1e-9)) return stop('Every column must lie on the mat (coordinates from the mat centre).');
  const cols = raw.map((c) => ({ x: c.x, y: c.y, P: factored ? factoredGravity(c.D || 0, c.L || 0, ed).value : (c.D || 0) + (c.L || 0) }));
  if (!(cols.reduce((t, c) => t + c.P, 0) > 0)) return stop('The column loads add up to zero.');
  const m = rigidMat(B, Lm, cols), tag = factored ? 'factored' : 'service';
  rec.add('Resultant of the column loads', S`Q = Σ Qi;  x' = Σ Qi xi / Q;  y' = Σ Qi yi / Q  (${tag} loads)`, S`Q = ${u(m.Q, F)}`, S`ex = ${u(m.ex, LM)},  ey = ${u(m.ey, LM)}`, 'theory.plain');
  rec.add('Moments of inertia of the mat plan', S`Ix = B L³ / 12;  Iy = L B³ / 12;  My = Q ex;  Mx = Q ey`, S`Ix = ${u(m.Ix, 'inertia_m4')},  Iy = ${u(m.Iy, 'inertia_m4')}`, S`Mx = ${u(m.Mx, M)},  My = ${u(m.My, M)}`, 'theory.plain');
  const corners = [[-B / 2, Lm / 2], [B / 2, Lm / 2], [B / 2, -Lm / 2], [-B / 2, -Lm / 2]].map(([x, y]) => ({ x, y, q: m.q(x, y) }));
  const qavg = m.Q / (B * Lm), qmax = Math.max(...corners.map((c) => c.q)), qmin = Math.min(...corners.map((c) => c.q));
  rec.add('Soil pressure', S`q(x, y) = Q / (B L) + My x / Iy + Mx y / Ix`, S`average ${u(qavg, PR)};  corners ${u(corners[0].q, PR)}, ${u(corners[1].q, PR)}, ${u(corners[2].q, PR)}, ${u(corners[3].q, PR)}`, S`qmax = ${u(qmax, PR)},  qmin = ${u(qmin, PR)}`, 'theory.plain');
  Object.assign(vals, { Q: m.Q, ex: m.ex, ey: m.ey, Ix: m.Ix, Iy: m.Iy, qAvg: qavg, qA: corners[0].q, qB: corners[1].q, qC: corners[2].q, qD: corners[3].q, qmax, qmin });
  if (!factored && input.qa > 0) out.checks.push(check('Soil pressure', ['qmax', qmax, PR], ['qa (net)', input.qa, PR], qmax / input.qa, 'found.baseArea'));
  out.checks.push(check('Pressure not negative', ['average − qmin', qavg - qmin, PR], ['average', qavg, PR], (qavg - qmin) / qavg, 'theory.plain', { note: 'D/C above 1 means part of the mat lifts off' }));
  const tables = [{ title: 'Soil pressure at the corners and under the columns (' + tag + ' loads)', head: ['Point', 'x', 'y', 'q'],
    rows: corners.map((c, i) => ({ cells: ['Corner ' + 'ABCD'[i], u(c.x, LM), u(c.y, LM), u(c.q, PR)] })).concat(cols.map((c, i) => ({ cells: ['Column ' + (i + 1), u(c.x, LM), u(c.y, LM), u(m.q(c.x, c.y), PR)] }))) }];
  // Design strip
  const alongY = input.strip !== 'x', s1 = input.s1, s2 = input.s2;
  if (isFinite(s1) && isFinite(s2) && s2 > s1) {
    const half = alongY ? B / 2 : Lm / 2, len = alongY ? Lm : B;
    if (s1 < -half - 1e-9 || s2 > half + 1e-9) return stop('The strip must lie within the mat.');
    const w = s2 - s1, cl = (s1 + s2) / 2;
    const qe1 = alongY ? m.q(cl, Lm / 2) : m.q(B / 2, cl), qe2 = alongY ? m.q(cl, -Lm / 2) : m.q(-B / 2, cl), qav = (qe1 + qe2) / 2;
    const on = cols.filter((c) => { const t = alongY ? c.x : c.y; return t >= s1 - 1e-9 && t <= s2 + 1e-9; });
    const colSum = on.reduce((t, c) => t + c.P, 0), soil = qav * w * len, avg = (soil + colSum) / 2;
    if (!(colSum > 0)) return stop('No column lies on this strip.');
    const qmod = qav * avg / soil, Fm = avg / colSum;
    rec.add('Design strip', S`strip ${alongY ? 'in the y direction' : 'in the x direction'} from ${u(s1, LM)} to ${u(s2, LM)}, width B1 = ${u(w, LM)};  qav = average of the pressures at the ends of the centreline`,
      S`qav = (${v(qe1, PR)} + ${v(qe2, PR)}) / 2 = ${u(qav, PR)}`, S`soil reaction = qav B1 L = ${u(soil, F)};  column sum = ${u(colSum, F)}`, 'theory.plain');
    rec.add('Modified loads on the strip', S`average load = (soil reaction + column sum) / 2;  qav,mod = qav × average / soil reaction;  F = average / column sum`, S`average = ${u(avg, F)}`, S`qav,mod = ${u(qmod, PR)},  F = ${Fm}`, 'theory.plain',
      'The strip is a beam loaded upward by qav,mod B1 and downward by F × the column loads.');
    const loads = on.map((c) => ({ x: (alongY ? c.y : c.x) + len / 2, P: Fm * c.P }));
    const pts = beamDiagrams(len, () => qmod * w, loads, 400);
    const Mx_ = Math.max(...pts.map((p) => p.M)), Mn_ = Math.min(...pts.map((p) => p.M)), Vmax = Math.max(...pts.map((p) => Math.abs(p.V)));
    rec.add('Strip shear and moment', S`statics along the strip`, null, S`|V|max = ${u(Vmax, F)};  M from ${u(Mn_, M)} to ${u(Mx_, M)}`, 'mat.strength', ed.found.mat.note);
    Object.assign(vals, { width: w, qav, soil, colSum, average: avg, qmod, F: Fm, Vmax, Mpos: Mx_, Mneg: Mn_ });
    out.results.push(res('Strip qav,mod', qmod, PR), res('Factor F', Fm), res('Strip |V|max', Vmax, F), res('Strip M max', Mx_, M), res('Strip M min', Mn_, M));
    out.diagram.strip = { s1, s2, alongY, len, V: pts.filter((p, i) => i % 4 === 0).map((p) => [p.x, p.V]), M: pts.filter((p, i) => i % 4 === 0).map((p) => [p.x, p.M]) };
  }
  out.results = [res('Q', m.Q, F), res('ex', m.ex, LM), res('ey', m.ey, LM), res('qmax', qmax, PR), res('qmin', qmin, PR)].concat(out.results);
  if (factored) {
    const big = cols.reduce((mx, c) => (c.P > mx.P ? c : mx), cols[0]);
    out.send = [{ to: 'rc/two-way-slab', mode: 'punching', label: 'Check punching at the most heavily loaded column (Two-way slabs)', values: { vuFrom: 'typed', Vu: big.P, location: 'interior' } }];
  }
  out.notes.push(ed.found.mat.note);
  Object.assign(out.diagram, { B, Lm, cols, corners, tables, chips: [S`${v(B, LM)} × ${u(Lm, LM)} mat`, [tag + ' loads'], S`Q = ${u(m.Q, F)}`] });
  return done();
}
