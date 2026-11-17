// Bolted connections: bearing-type, slip-critical and eccentrically loaded bolt groups. Pure calculation.
// Units: mm, mm², MPa, kN; moments of the bolt group in kN·mm.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { available } from './common.js';
import { boltGroup, boltPattern } from './groupElastic.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force';

export const boltArea = (d) => Math.PI * d * d / 4;
export function boltGrade(input, ed) { return ed.steel.bolt.grades.find((g) => g.value === input.grade) || ed.steel.bolt.grades[0]; }
// Nominal shear strength of one bolt per shear plane, N.
export function boltShearRn(d, grade, threads) { return (threads === 'X' ? grade.FnvX : grade.FnvN) * boltArea(d); }
// Bearing at one bolt, N. Lc = clear distance in the line of force.
export function bearingRn(Lc, d, t, Fu, deformation, ed) {
  const K = deformation ? ed.steel.bolt.bearing.def : ed.steel.bolt.bearing.noDef;
  return { a: K.lc * Lc * t * Fu, b: K.d * d * t * Fu, Rn: Math.min(K.lc * Lc * t * Fu, K.d * d * t * Fu), K };
}
// Modified nominal tensile stress with shear, MPa.
export function combinedFnt(grade, threads, frv, method, ed) {
  const B = ed.steel.bolt, Fnv = threads === 'X' ? grade.FnvX : grade.FnvN, k = B.combined.k;
  const raw = method === 'ASD' ? k * grade.Fnt - B.shear.omega * grade.Fnt / Fnv * frv : k * grade.Fnt - grade.Fnt / (B.shear.phi * Fnv) * frv;
  return Math.max(0, Math.min(grade.Fnt, raw));
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, B = ed.steel.bolt, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD', asd = method === 'ASD';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const grade = boltGrade(input, ed), d = input.bolt, Ab = boltArea(d), threads = input.threads === 'X' ? 'X' : 'N';
  const cap = asd ? 'Rn/Ω' : 'φRn', dem = (s) => (asd ? s + 'a' : s + 'u');
  if (!(d > 0) || !(input.planes > 0)) return stop('Choose the bolt size and the number of shear planes.');
  const Fnv = threads === 'X' ? grade.FnvX : grade.FnvN;
  const rnShear = boltShearRn(d, grade, threads) / 1e3, aShear = available(rnShear, B.shear, method);
  const shearStep = () => {
    rec.add('Bolt area and shear strength', S`Ab = π d² / 4;  Rn = Fnv Ab per shear plane  (${grade.label}, threads ${threads === 'X' ? 'excluded' : 'included'}: Fnv = ${u(Fnv, ST)})`, S`Ab = π (${v(d, L)})² / 4 = ${u(Ab, A)}`,
      asd ? S`Rn = ${u(rnShear, F)};  Rn / ${B.shear.omega} = ${u(aShear, F)} per plane` : S`Rn = ${u(rnShear, F)};  ${B.shear.phi} Rn = ${u(aShear, F)} per plane`, 'bolt.shear');
    Object.assign(vals, { Ab, RnShear: rnShear, shearLRFD: B.shear.phi * rnShear, shearASD: rnShear / B.shear.omega });
  };

  // ------------------------------------------------ eccentric group
  if (input.mode === 'eccentric') {
    let pts;
    if (input.layout === 'free') pts = (input.points || []).map((p) => ({ x: p.x, y: p.y }));
    else {
      if (!positive(input, ['rows', 'cols', 'pitch', 'gauge'])) return stop('Give the rows, columns, pitch and gauge of the bolt pattern.');
      pts = boltPattern(Math.round(input.rows), Math.round(input.cols), input.pitch, input.gauge);
    }
    if (pts.length < 2) return stop('The group needs at least two bolts.');
    if (!(input.P > 0)) return stop('Give the load on the group.');
    const ang = (input.angle || 0) * Math.PI / 180, Px = input.P * Math.sin(ang), Py = -input.P * Math.cos(ang);
    const gr = boltGroup(pts, { Px, Py, ex: input.ex || 0, ey: input.ey || 0 });
    if (!(gr.J > 0)) return stop('The bolts must not all sit at one point.');
    shearStep();
    const avail = aShear * input.planes, c = gr.crit;
    rec.add('Centroid and polar moment of the group', S`x̄ = Σx / n;  ȳ = Σy / n;  Σd² = Σ (x² + y²) about the centroid`, S`n = ${gr.n};  centroid at (${v(gr.cx, L)}, ${v(gr.cy, L)})`, S`Σd² = ${u(gr.J, A)}`, 'theory.plain');
    rec.add('Moment about the centroid', S`M = P × eccentricity`, S`load ${u(input.P, F)} at ${input.angle || 0}° from the vertical, applied at (${v(input.ex || 0, L)}, ${v(input.ey || 0, L)}) from the centroid`, S`M = ${u(Math.abs(gr.M) / 1e3, 'moment')}`, 'theory.plain');
    rec.add('Forces on the critical bolt', S`direct = P / n;  rx = M y / Σd²;  ry = M x / Σd² (perpendicular to the radius);  R = vector sum`,
      S`bolt at (${v(c.rx, L)}, ${v(c.ry, L)}) from the centroid: direct ${u(Math.hypot(c.dx, c.dy), F)};  rx = ${u(Math.abs(c.tx), F)},  ry = ${u(Math.abs(c.ty), F)}`, S`R = ${u(c.R, F)}`, 'theory.plain', B.eccentricNote);
    rec.add('Critical bolt against the bolt shear strength', S`R ≤ ${cap} per bolt (${input.planes} plane${input.planes > 1 ? 's' : ''})`, S`${cap} = ${u(avail, F)}`, S`R / ${cap} = ${dc(c.R / avail)}`, 'bolt.shear');
    out.checks.push(check('Critical bolt', ['R', c.R, F], [cap, avail, F], c.R / avail, 'bolt.shear'));
    Object.assign(vals, { n: gr.n, J: gr.J, M: Math.abs(gr.M), direct: Math.hypot(c.dx, c.dy), rx: Math.abs(c.tx), ry: Math.abs(c.ty), R: c.R, avail });
    out.results = [res('Σd²', gr.J, A), res('M', Math.abs(gr.M) / 1e3, 'moment'), res('Direct shear per bolt', Math.hypot(c.dx, c.dy), F), res('R, critical bolt', c.R, F), res(cap + ' per bolt', avail, F)];
    out.diagram = { kind: 'group', pts, forces: gr.forces, crit: c, cx: gr.cx, cy: gr.cy, load: { ex: input.ex || 0, ey: input.ey || 0, angle: input.angle || 0 }, chips: [S`${gr.n} bolts M${d}`, S`P = ${u(input.P, F)}`] };
    return done();
  }

  // ------------------------------------------------ bearing-type checks (also run for slip-critical)
  if (!positive(input, ['lines', 'perLine', 't', 'Fu', 'Le', 's'])) return stop('Give the bolt layout, plate thickness and Fu, end distance and spacing.');
  const lines = Math.round(input.lines), perLine = Math.round(input.perLine), n = lines * perLine, dh = ed.steel.holeDia(d);
  const V = input.V >= 0 ? input.V : 0;
  shearStep();
  const totalShear = n * input.planes * aShear;
  rec.add('Bolt shear strength of the connection', S`n × planes × ${cap}`, S`${n} × ${input.planes} × ${v(aShear, F)}`, S`${u(totalShear, F)}  (nominal ${u(n * input.planes * rnShear, F)})`, 'bolt.shear');
  const def = input.deformation !== false;
  const end = bearingRn(input.Le - dh / 2, d, input.t, input.Fu, def, ed), mid = bearingRn(input.s - dh, d, input.t, input.Fu, def, ed);
  if (input.Le - dh / 2 <= 0 || input.s - dh <= 0) return stop('The end distance and spacing must be larger than the hole.');
  const sumRn = (lines * end.Rn + lines * (perLine - 1) * mid.Rn) / 1e3, aBear = available(sumRn, B.bearing, method);
  rec.add('Bearing at the bolt holes', S`Rn = ${end.K.lc} Lc t Fu ≤ ${end.K.d} d t Fu  (${def ? 'deformation at service load is a design consideration' : 'deformation is not a consideration'});  standard hole dh = ${u(dh, L)}`,
    S`end bolt: Lc = Le − dh/2 = ${u(input.Le - dh / 2, L)} → ${u(end.Rn / 1e3, F)};  other bolts: Lc = s − dh = ${u(input.s - dh, L)} → ${u(mid.Rn / 1e3, F)}`,
    S`Σ Rn = ${lines} × ${v(end.Rn / 1e3, F)} + ${lines * (perLine - 1)} × ${v(mid.Rn / 1e3, F)} = ${u(sumRn, F)};  ${cap} = ${u(aBear, F)}`, 'bolt.bearing', 'Summed over the bolts for the thinner or weaker connected part (' + ed.clauses['bolt.bearingSum'].nscp + ').');
  const conn = Math.min(totalShear, aBear);
  rec.add('Shear strength of the connection', S`lesser of bolt shear and bearing`, S`lesser of ${v(totalShear, F)} and ${v(aBear, F)}`, S`${cap} = ${u(conn, F)}`, 'bolt.bearingSum');
  Object.assign(vals, { n, dh, bearingEnd: end.Rn / 1e3, bearingOther: mid.Rn / 1e3, bearingSum: sumRn, bearingLRFD: B.bearing.phi * sumRn, bearingASD: sumRn / B.bearing.omega,
    shearN: n * input.planes * rnShear, shearNLRFD: B.shear.phi * n * input.planes * rnShear, shearNASD: n * input.planes * rnShear / B.shear.omega, connection: conn });
  // detailing notes
  const em = B.edgeMin[d], edgeMin = em ? em[input.edge === 'rolled' ? 1 : 0] : d * (input.edge === 'rolled' ? B.edgeMin.largeRolled : B.edgeMin.largeSheared), edgeMax = Math.min(B.edgeMax.t * input.t, B.edgeMax.max);
  if (input.s < B.spacing.min * d) out.warnings.push('Bolt spacing is below 2⅔ d (' + ed.clauses['bolt.spacing'].nscp + '); see the Detailing step.');
  else if (input.s < B.spacing.preferred * d) out.notes.push('A spacing of at least 3d is preferred (' + ed.clauses['bolt.spacing'].nscp + ').');
  if (input.Le < edgeMin) out.warnings.push('The end distance is below the minimum edge distance of ' + edgeMin + ' mm (' + ed.clauses['bolt.edgeMin'].nscp + ').');
  if (input.Le > edgeMax) out.warnings.push('The end distance is above the maximum of 12 t, not more than 150 mm (' + ed.clauses['bolt.edgeMax'].nscp + ').');
  rec.add('Detailing', S`spacing ≥ 2⅔ d (3d preferred);  minimum edge distance from the table;  maximum edge distance 12 t ≤ ${u(B.edgeMax.max, L)}`,
    S`s = ${u(input.s, L)} against ${u(B.spacing.min * d, L)};  Le = ${u(input.Le, L)} against ${u(edgeMin, L)} to ${u(edgeMax, L)}`, null, 'bolt.edgeMin');
  if (V > 0) {
    out.checks.push(check('Bolt shear', [dem('V'), V, F], [cap, totalShear, F], V / totalShear, 'bolt.shear'));
    out.checks.push(check('Bearing', [dem('V'), V, F], [cap, aBear, F], V / aBear, 'bolt.bearing'));
  }
  const T = input.T > 0 ? input.T : 0;
  if (T > 0) {
    const tens = available(grade.Fnt * Ab / 1e3, B.shear, method), frv = V * 1e3 / n / (input.planes * Ab);
    const Fp = combinedFnt(grade, threads, frv, method, ed), aComb = available(Fp * Ab / 1e3, B.shear, method);
    rec.add('Bolt tension', S`Rn = Fnt Ab,  Fnt = ${u(grade.Fnt, ST)}`, S`Rn = ${v(grade.Fnt, ST)} · ${v(Ab, A)} = ${u(grade.Fnt * Ab / 1e3, F)}`, S`${cap} = ${u(tens, F)} per bolt`, 'bolt.shear');
    rec.add('Combined tension and shear', asd ? S`F'nt = 1.3 Fnt − (Ω Fnt / Fnv) frv ≤ Fnt,  frv = shear per bolt / Ab` : S`F'nt = 1.3 Fnt − (Fnt / (φ Fnv)) frv ≤ Fnt,  frv = shear per bolt / Ab`,
      S`frv = ${v(V / n, F)} × 10³ / ${v(input.planes * Ab, A)} = ${u(frv, ST)};  F'nt = ${u(Fp, ST)}`, S`available tension = ${u(aComb, F)} per bolt`, 'bolt.combined');
    const lowV = frv <= B.combined.ruleOfThumb * (asd ? Fnv / B.shear.omega : B.shear.phi * Fnv), lowT = T <= B.combined.ruleOfThumb * tens;
    if (lowV || lowT) out.notes.push('The ' + (lowV ? 'shear' : 'tension') + ' is not more than 30% of its available strength, so the interaction need not be checked; it is shown anyway.');
    out.checks.push(check('Bolt tension', [dem('T') + ' per bolt', T, F], [cap, tens, F], T / tens, 'bolt.shear'));
    out.checks.push(check('Combined tension and shear', [dem('T') + ' per bolt', T, F], [cap + " with F'nt", aComb, F], T / aComb, 'bolt.combined'));
    Object.assign(vals, { frv, FntMod: Fp, tensionAvail: tens, combinedAvail: aComb });
  }
  out.results = [res('Ab', Ab, A), res('Bolt shear ' + cap + ', connection', totalShear, F), res('Bearing ' + cap, aBear, F), res('Connection ' + cap, conn, F)];
  if (vals.combinedAvail) out.results.push(res("Tension with shear, " + cap, vals.combinedAvail, F));
  out.diagram = { kind: 'plate', lines, perLine, Le: input.Le, s: input.s, d, chips: [S`${n} bolts M${d} ${grade.value}-${threads}`, S`t = ${u(input.t, L)}`] };

  if (input.mode === 'slip') {
    const SL = B.slip, Tb = (B.pretension[grade.value] || {})[d];
    if (!Tb) return stop('Slip-critical connections need A325 or A490 bolts of a listed size.');
    const mu = SL.mu[input.surface === 'B' ? 'B' : 'A'], hsc = (SL.hsc.find((x) => x.value === input.hole) || SL.hsc[0]).h, Ns = input.planes;
    const Rn1 = mu * SL.Du * hsc * Tb * 1;
    let ks = 1;
    if (input.Tslip > 0) {
      const Nb = input.Nb > 0 ? input.Nb : n;
      ks = asd ? 1 - SL.ksASD * input.Tslip / (SL.Du * Tb * Nb) : 1 - input.Tslip / (SL.Du * Tb * Nb);
      if (ks <= 0) return stop('The applied tension removes the whole clamping force.');
      rec.add('Reduction for applied tension', asd ? S`ks = 1 − ${SL.ksASD} Ta / (Du Tb Nb)` : S`ks = 1 − Tu / (Du Tb Nb)`, S`ks = 1 − ${asd ? SL.ksASD + ' · ' : ''}${v(input.Tslip, F)} / (${SL.Du} · ${v(Tb, F)} · ${Nb})`, S`ks = ${ks}`, 'bolt.slipTension');
    }
    const lvl = input.level === 'strength' ? SL.strength : SL.service, RnPer = Rn1 * Ns * ks, aSlip = available(RnPer, lvl, method) * n;
    rec.add('Slip resistance', S`Rn = μ Du hsc Tb Ns,  μ = ${mu} (Class ${input.surface === 'B' ? 'B' : 'A'}), Du = ${SL.Du}, hsc = ${hsc}, Tb = ${u(Tb, F)}`, S`Rn = ${mu} · ${SL.Du} · ${hsc} · ${v(Tb, F)} · ${Ns}${ks < 1 ? S` · ks ${ks}` : ''} = ${u(RnPer, F)} per bolt`,
      S`${input.level === 'strength' ? 'slip at the required strength level' : 'slip as a serviceability limit state'}: ${asd ? S`Ω = ${lvl.omega}` : S`φ = ${lvl.phi}`};  connection ${cap} = ${u(aSlip, F)}`, 'bolt.slip');
    Object.assign(vals, { Tb, RnSlip: Rn1, servLRFD: SL.service.phi * Rn1, servASD: Rn1 / SL.service.omega, strLRFD: SL.strength.phi * Rn1, strASD: Rn1 / SL.strength.omega, ks, RnSlipPlanes: Rn1 * Ns, slipAvail: aSlip });
    if (V > 0) out.checks.unshift(check('Slip resistance', [dem('V'), V, F], [cap, aSlip, F], V / aSlip, 'bolt.slip'));
    out.results.unshift(res('Slip ' + cap + ', connection', aSlip, F), res('Rn per bolt, one plane', Rn1, F));
    out.notes.push('A slip-critical connection must also pass the bearing-type checks; both are shown.');
  }
  if (V === 0 && T === 0) out.notes.push('No load was given, so nothing is checked.');
  return done();
}
