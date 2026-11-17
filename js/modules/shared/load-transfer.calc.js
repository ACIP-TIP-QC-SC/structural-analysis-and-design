// Load transfer: slab panel loads to edge beams, and load takeoff to beams, columns and footings.
// Pure calculation. Units: m, kPa, kN, kN/m, kN·m; beam size in mm.
import { S, v, u, recorder, blank, fail, res, positive } from '../../core/steps.js';
import { factoredGravity } from '../found/isolated.calc.js';

const LM = 'length_m', PR = 'pressure', F = 'force', LL = 'lineload', M = 'moment', AM = 'area_m2';

// Distribution of a uniform panel load w (kPa) to the edge beams. S = short span, Lg = long span (m).
export function panelDistribution(w, Sp, Lg, ed) {
  const ratio = Lg / Sp, m = Sp / Lg, oneWay = ratio >= ed.theory.tributary.oneWayRatio, peak = w * Sp / 2;
  if (oneWay) return { ratio, m, oneWay, peak, shortTotal: 0, longTotal: peak * Lg, shortPeak: 0, longPeak: peak, shortEqM: 0, longEqM: peak, shortEqV: 0, longEqV: peak, sum: 2 * peak * Lg, total: w * Sp * Lg };
  const shortTotal = w * Sp * Sp / 4, longTotal = w * (Sp * Lg / 2 - Sp * Sp / 4);
  return { ratio, m, oneWay, peak, shortPeak: peak, longPeak: peak, shortTotal, longTotal, shortEqM: w * Sp / 3, longEqM: (w * Sp / 3) * (3 - m * m) / 2, shortEqV: w * Sp / 4, longEqV: (w * Sp / 2) * (1 - m / 2),
    sum: 2 * shortTotal + 2 * longTotal, total: w * Sp * Lg };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, G = ed.loads.gravity, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; return { vals, result: out }; };
  const factorStep = (D, Lv, q, name) => {
    const fg = factoredGravity(D, Lv, ed);
    rec.add('Factored ' + name, S`greater of ${G.D1} D and ${G.D} D + ${G.L} L`, S`greater of ${G.D1} · ${v(D, q)} = ${v(fg.a, q)} and ${G.D} · ${v(D, q)} + ${G.L} · ${v(Lv, q)} = ${v(fg.b, q)}`, S`= ${u(fg.value, q)}`, 'loads.strength');
    return fg.value;
  };

  if (input.mode === 'takeoff') {
    if (!positive(input, ['tribW', 'beamSpan', 'colW', 'colL', 'floors']) || !(input.wD >= 0) || !(input.wL >= 0) || !(input.roofD >= 0) || !(input.roofL >= 0)) return stop('The tributary dimensions, the span and the number of floors need positive numbers; loads cannot be negative.');
    const nF = Math.floor(input.floors), bw = input.bw > 0 ? input.bw : 0, bh = input.bh > 0 ? input.bh : 0, gc = input.gammaC > 0 ? input.gammaC : 0, wall = input.wWall > 0 ? input.wWall : 0, extra = input.extraD > 0 ? input.extraD : 0;
    // Beam
    const self = bw * bh / 1e6 * gc, bD = input.wD * input.tribW + self + wall, bL = input.wL * input.tribW;
    rec.add('Beam line load, service', S`dead = wD · tributary width + self weight + wall;  live = wL · tributary width`, S`self weight = ${v(bw / 1000, LM)} · ${v(bh / 1000, LM)} · ${v(gc, 'unitweight')} = ${u(self, LL)};  dead = ${v(input.wD, PR)} · ${v(input.tribW, LM)} + ${v(self, LL)} + ${v(wall, LL)}`, S`dead = ${u(bD, LL)},  live = ${u(bL, LL)}`, 'theory.tributary');
    const wu = factorStep(bD, bL, LL, 'beam load'), Ls = input.beamSpan, Ru = wu * Ls / 2, Mu = wu * Ls * Ls / 8;
    rec.add('Beam reaction and moment, simple span', S`R = wu · L / 2;  Mu = wu · L² / 8`, S`R = ${v(wu, LL)} · ${v(Ls, LM)} / 2;  Mu = ${v(wu, LL)} · ${v(Ls, LM)}² / 8`, S`R = ${u(Ru, F)},  Mu = ${u(Mu, M)}`, 'basic.statics');
    // Column
    const area = input.colW * input.colL, fD = area * input.wD + extra, fL = area * input.wL, rD = area * input.roofD + extra, rL = area * input.roofL;
    rec.add('Column load per level', S`P = tributary area × load (+ other dead load per level)`, S`area = ${v(input.colW, LM)} · ${v(input.colL, LM)} = ${u(area, AM)};  floor: PD = ${v(area, AM)} · ${v(input.wD, PR)} + ${v(extra, F)}, PL = ${v(area, AM)} · ${v(input.wL, PR)}`, S`floor: PD = ${u(fD, F)}, PL = ${u(fL, F)};  roof: PD = ${u(rD, F)}, PL = ${u(rL, F)}`, 'theory.tributary');
    const perFloorU = factoredGravity(fD, fL, ed).value;
    const rows = []; let cD = 0, cL = 0;
    for (let i = 0; i <= nF; i++) {
      const roof = i === 0, d = roof ? rD : fD, l = roof ? rL : fL;
      if (i > nF) break;
      cD += d; cL += l;
      rows.push({ level: roof ? 'Roof' : 'Floor ' + (nF - i + 1), d, l, cD, cL, Pu: factoredGravity(cD, cL, ed).value });
    }
    const PuF = factorStep(cD, cL, F, 'footing load');
    rec.add('Load on the footing', S`sum of all levels above`, S`PD = ${u(cD, F)},  PL = ${u(cL, F)}`, S`service P = ${u(cD + cL, F)},  Pu = ${u(PuF, F)}`, 'theory.tributary', 'The roof level and ' + nF + ' floor level(s) are carried. No live load reduction is applied.');
    out.notes.push('No live load reduction is applied in this version. Column and footing self weight are not included unless entered as other dead load.');
    Object.assign(vals, { beamD: bD, beamL: bL, wu, Ru, Mu, area, floorD: fD, floorL: fL, perFloorFactored: perFloorU, PD: cD, PL: cL, Pu: PuF });
    out.results = [res('Beam wu', wu, LL), res('Beam reaction', Ru, F), res('Beam Mu', Mu, M), res('Column load per floor (factored)', perFloorU, F), res('Footing PD', cD, F), res('Footing PL', cL, F), res('Footing Pu', PuF, F)];
    out.diagram = { kind: 'takeoff', levels: rows.map((r) => ({ level: r.level, Pu: r.Pu })), chips: [S`tributary area ${u(area, AM)}`, S`${nF} floor(s) and roof`],
      tables: [{ title: 'Column load takeoff', head: ['Level', 'PD', 'PL', 'Cumulative PD', 'Cumulative PL', 'Cumulative Pu'], rows: rows.map((r) => ({ cells: [r.level, u(r.d, F), u(r.l, F), u(r.cD, F), u(r.cL, F), u(r.Pu, F)] })), note: 'Cumulative values are the load in the column below each level. The last row is the load on the footing.' }] };
    out.send = [{ to: 'rc/beam-flexure', mode: 'singly', label: 'Use the beam moment as Mu in Beam flexure', values: { Mu } },
      { to: 'rc/shear-torsion', mode: 'shear', label: 'Use the beam reaction as Vu in Shear and torsion', values: { Vu: Ru } },
      { to: 'found/isolated', mode: 'design', label: 'Use this column load in Isolated footings', values: { PD: cD, PL: cL } }];
    return done();
  }

  // Panel distribution
  if (!positive(input, ['S', 'Lg']) || !(input.wD >= 0) || !(input.wL >= 0) || !(input.wD + input.wL > 0)) return stop('The spans need positive numbers and the loads cannot be negative.');
  let Sp = input.S, Lg = input.Lg;
  if (Lg < Sp) { const t = Sp; Sp = Lg; Lg = t; out.notes.push('The spans were swapped so that S is the short span.'); }
  const factored = input.loadType !== 'service';
  const w = factored ? factorStep(input.wD, input.wL, PR, 'floor load') : input.wD + input.wL;
  if (!factored) rec.add('Service floor load', S`w = wD + wL`, S`w = ${v(input.wD, PR)} + ${v(input.wL, PR)}`, S`w = ${u(w, PR)}`, 'theory.tributary');
  const p = panelDistribution(w, Sp, Lg, ed), k = input.bothSides ? 2 : 1, lim = ed.theory.tributary.oneWayRatio;
  rec.add('Slab action', S`Lg / S against ${lim}`, S`Lg / S = ${v(Lg, LM)} / ${v(Sp, LM)} = ${p.ratio}`, [p.oneWay ? 'One-way action: the slab spans in the short direction and loads the long beams only.' : 'Two-way action: 45° lines from the corners divide the panel into two triangles and two trapezoids.'], 'theory.tributary');
  if (p.oneWay) rec.add('Load on each long beam', S`uniform line load = w · S / 2`, S`${v(w, PR)} · ${v(Sp, LM)} / 2`, S`${u(p.peak, LL)} on each long beam (total ${u(p.longTotal, F)}); the short beams receive no slab load`, 'theory.tributary');
  else {
    rec.add('Short beams: triangular load', S`peak = w · S / 2;  total = w · S² / 4`, S`peak = ${v(w, PR)} · ${v(Sp, LM)} / 2;  total = ${v(w, PR)} · ${v(Sp, LM)}² / 4`, S`peak = ${u(p.shortPeak, LL)},  total = ${u(p.shortTotal, F)}`, 'theory.tributary');
    rec.add('Long beams: trapezoidal load', S`peak = w · S / 2;  total = w (S · Lg / 2 − S² / 4)`, S`total = ${v(w, PR)} (${v(Sp, LM)} · ${v(Lg, LM)} / 2 − ${v(Sp, LM)}² / 4)`, S`peak = ${u(p.longPeak, LL)},  total = ${u(p.longTotal, F)}`, 'theory.tributary');
    rec.add('Equivalent uniform loads for bending', S`short beam: w · S / 3;  long beam: (w · S / 3)(3 − m²) / 2,  m = S / Lg`, S`m = ${p.m}`, S`short = ${u(p.shortEqM, LL)},  long = ${u(p.longEqM, LL)}`, 'theory.tributary');
    rec.add('Equivalent uniform loads for shear', S`short beam: w · S / 4;  long beam: (w · S / 2)(1 − m / 2)`, S`m = ${p.m}`, S`short = ${u(p.shortEqV, LL)},  long = ${u(p.longEqV, LL)}`, 'theory.tributary', 'Total load on the beam divided by its span.');
  }
  rec.add('Check: sum of the four beam loads', S`2 × short total + 2 × long total = w · S · Lg`, S`2 · ${v(p.shortTotal, F)} + 2 · ${v(p.longTotal, F)} = ${u(p.sum, F)}`, S`w · S · Lg = ${u(p.total, F)}`, 'basic.statics', input.bothSides ? 'An interior beam shared by two equal panels carries twice the values shown for one panel; the doubled values are in the key results.' : '');
  Object.assign(vals, { w, ratio: p.ratio, action: p.oneWay ? 'one-way' : 'two-way', peak: p.peak, shortTotal: p.shortTotal, longTotal: p.longTotal, sum: p.sum, total: p.total, shortEqM: p.shortEqM, longEqM: p.longEqM, shortEqV: p.shortEqV, longEqV: p.longEqV, longLine: p.oneWay ? p.peak : null, factor: k });
  const tag = input.bothSides ? ' (two panels)' : '';
  out.results = [res('w', w, PR), res('Peak on a long beam' + tag, k * p.longPeak, LL), res('Total on a long beam' + tag, k * p.longTotal, F), res('Total on a short beam' + tag, k * p.shortTotal, F),
    res('Long beam, equivalent for bending' + tag, k * p.longEqM, LL), res('Short beam, equivalent for bending' + tag, k * p.shortEqM, LL)];
  out.diagram = { kind: 'panel', S: Sp, Lg, oneWay: p.oneWay, peak: p.peak, chips: [S`S × Lg = ${v(Sp, LM)} × ${u(Lg, LM)}`, S`w = ${u(w, PR)} (${factored ? 'factored' : 'service'})`, [p.oneWay ? 'one-way' : 'two-way']] };
  if (factored) {
    const MuL = k * p.longEqM * Lg * Lg / 8, VuL = k * p.longTotal / 2;
    out.send = [{ to: 'rc/beam-flexure', mode: 'singly', label: 'Use the long beam moment (simple span) as Mu in Beam flexure', values: { Mu: MuL } },
      { to: 'rc/shear-torsion', mode: 'shear', label: 'Use the long beam reaction as Vu in Shear and torsion', values: { Vu: VuL } }];
    Object.assign(vals, { MuLong: MuL, VuLong: VuL });
    out.notes.push('The "Send to" values treat the long beam as simply supported and carry the slab load only. Add the beam self weight and any wall load in the Load takeoff mode.');
  }
  return done();
}
