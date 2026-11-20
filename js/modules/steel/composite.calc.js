// Composite members (NSCP 2015 Sec. 509): composite beam with studs, encased column, filled column. Pure calculation.
// Units: mm, mm², mm⁴, MPa, kg/m³, kN, kN·m. Every factor comes from edition.steel.composite and edition.steel.E.
import { S, v, u, si, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { available } from './common.js';
import { fmt } from '../../core/format.js';

const L = 'length_mm', A = 'area', I = 'inertia', ST = 'stress', F = 'force', M = 'moment', D = 'density', EI = 'rigidity';

// Second moments of area about the centroid: ∫ y² dA of a rectangle and of a full circle.
const rectI = (b, h) => 2 * b * Math.pow(h / 2, 3) / 3;
const circI = (dia) => Math.PI * Math.pow(dia / 2, 4) / 4;
const circA = (dia) => Math.PI * dia * dia / 4;

// Ec = 0.043 wc^1.5 √f'c (MPa), 509.1.2.
export const EcOf = (wc, fc, CO) => CO.EcCoef * wc * Math.sqrt(wc) * Math.sqrt(fc);

// Flexural buckling of a composite column from Po and Pe (kN), Eqs. 509.2-2 and 509.2-3.
export function columnStrength(Po, Pe, CO) {
  const K = CO.column, inelastic = Pe >= K.Pe * Po;
  return { inelastic, Pn: inelastic ? Po * Math.pow(K.base, Po / Pe) : K.elastic * Pe };
}

// Stud strength Qn (kN) and the Rg, Rp factors for the slab type.
export function studStrength(input, fc, Ec, CO) {
  const T = CO.RgRp, dia = input.stud, Asc = circA(dia);
  let key = 'none';
  if (input.deck === 'parallel') key = input.wr / input.hr >= T.parallelRatio ? 'parallelWide' : 'parallelNarrow';
  else if (input.deck === 'perpendicular') key = input.studsPerRib >= 3 ? 'perp3' : input.studsPerRib === 2 ? 'perp2' : 'perp1';
  const Rg = T[key].Rg, Rp = input.deck === 'perpendicular' && input.emid50 ? T.RpEmid : T[key].Rp;
  const QnCone = CO.stud.qn * Asc * Math.sqrt(fc * Ec) / 1e3, QnSteel = Rg * Rp * Asc * input.Fu / 1e3;
  return { Asc, Rg, Rp, key, QnCone, QnSteel, Qn: Math.min(QnCone, QnSteel) };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const mode = input.mode === 'encased' || input.mode === 'filled' ? input.mode : 'beam';
  return mode === 'beam' ? beam(input, ctx) : column(input, ctx, mode);
}

const methodOf = (ctx) => (ctx.method === 'ASD' ? 'ASD' : 'LRFD');
const isFull = (N1) => N1 === 'full' || N1 == null || N1 === '';
const clause = (ed, key) => (ed.clauses[key] ? ed.clauses[key].nscp : '');

// Material limits of 509.1.2 as warnings.
function materialNotes(out, ed, fc, wc, Fy) {
  const CO = ed.steel.composite;
  if (fc < CO.fcRange[0] || fc > CO.fcRange[1]) out.warnings.push("f'c = " + fmt(fc) + ' MPa is outside ' + CO.fcRange[0] + ' to ' + CO.fcRange[1] + ' MPa for normal-weight concrete (' + clause(ed, 'comp.materials') + ').');
  if (wc < CO.wcRange[0] || wc > CO.wcRange[1]) out.warnings.push('wc = ' + fmt(wc) + ' kg/m³ is outside ' + CO.wcRange[0] + ' to ' + CO.wcRange[1] + ' kg/m³, the range of the Ec formula (' + clause(ed, 'comp.Ec') + ').');
  if (Fy > CO.FyMax) out.warnings.push('Fy above ' + CO.FyMax + ' MPa is not permitted for the strength calculation of composite members (' + clause(ed, 'comp.materials') + ').');
}

// ---------------------------------------------------------------- composite beam (509.3)
function beam(input, ctx) {
  const ed = ctx.edition, CO = ed.steel.composite, B = CO.beam, E = ed.steel.E, method = methodOf(ctx);
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const deck = input.deck === 'perpendicular' || input.deck === 'parallel' ? input.deck : 'none';
  const need = ['As', 'dsec', 'bf', 'tf', 'tw', 'htw', 'Fy', 'span', 'spacingL', 'tc', 'fc', 'wc', 'stud', 'Fu'];
  if (!(input.edge > 0)) need.push('spacingR');
  if (deck !== 'none') need.push('hr');
  if (deck === 'parallel') need.push('wr');
  if (!positive(input, need) || !(input.Mu >= 0)) return stop('Every section property, dimension, material value and the required moment needs a number (spacing, slab and stud values above zero).');
  const full = isFull(input.N1);
  if (!full && !(Number.isInteger(input.N1) && input.N1 > 0)) return stop('N1, the number of studs between the point of maximum moment and the nearest zero moment, must be a whole number above zero (or Full composite).');
  const { As, dsec, bf, tf, tw, htw, Fy, span, tc, fc, wc } = input, hr = deck === 'none' ? 0 : input.hr, wr = deck !== 'none' && input.wr > 0 ? input.wr : 0;
  out.diagram = { mode: 'beam', dsec, bf, tf, tw, span, tc, hr, wr, deck, stud: input.stud, studsPerRib: input.studsPerRib, fc, Fy };
  materialNotes(out, ed, fc, wc, Fy);

  // 1. Effective width, each side the least of span/8, half the distance to the next beam and the edge distance.
  const sideL = Math.min(span / B.beDiv, input.spacingL / 2), edgeSide = input.edge > 0;
  const sideR = edgeSide ? Math.min(span / B.beDiv, input.edge) : Math.min(span / B.beDiv, input.spacingR / 2);
  const be = sideL + sideR;
  rec.add('Effective width', S`be = Σ min(L / ${B.beDiv}, s / 2, edge distance) over the two sides`,
    edgeSide ? S`left: min(${v(span, L)} / ${B.beDiv}, ${v(input.spacingL, L)} / 2) = ${v(sideL, L)};  edge side: min(${v(span, L)} / ${B.beDiv}, ${v(input.edge, L)}) = ${v(sideR, L)}`
      : S`left: min(${v(span, L)} / ${B.beDiv}, ${v(input.spacingL, L)} / 2) = ${v(sideL, L)};  right: min(${v(span, L)} / ${B.beDiv}, ${v(input.spacingR, L)} / 2) = ${v(sideR, L)}`,
    S`be = ${u(be, L)}`, 'comp.beWidth');

  // 2. Concrete in compression.
  const Ac = be * tc, Ycon = hr + tc;
  rec.add('Concrete in compression', deck === 'none' ? S`solid slab: Ac = be tc;  Ycon = tc` : S`deck: concrete below the top of the deck is neglected, Ac = be tc;  Ycon = hr + tc`,
    deck === 'none' ? S`Ac = ${v(be, L)} · ${v(tc, L)}` : S`Ac = ${v(be, L)} · ${v(tc, L)};  Ycon = ${v(hr, L)} + ${v(tc, L)}`, S`Ac = ${u(Ac, A)};  Ycon = ${u(Ycon, L)}`, deck === 'none' ? 'comp.positive' : 'comp.deck',
    deck === 'parallel' ? 'The concrete in the ribs is ignored (conservative).' : '');
  if (deck === 'parallel') out.notes.push('Deck ribs parallel to the beam: the concrete in the ribs is ignored, which is conservative.');

  // 3 and 4. Ec, stud area and stud strength.
  const Ec = EcOf(wc, fc, CO), q = studStrength(Object.assign({}, input, { deck }), fc, Ec, CO), Asc = q.Asc, Qn = q.Qn;
  rec.add('Modulus of elasticity of concrete', S`Ec = ${CO.EcCoef} wc^(1.5) √f'c`, S`Ec = ${CO.EcCoef} · ${si(wc, D)}^(1.5) · √(${si(fc, ST)})`, S`Ec = ${si(Ec, ST)}`, 'comp.Ec');
  rec.add('Stud strength', S`Qn = min(${CO.stud.qn} Asc √(f'c Ec), Rg Rp Asc Fu);  Asc = π d² / 4`,
    S`Asc = π · ${v(input.stud, L)}² / 4 = ${u(Asc, A)};  Rg = ${q.Rg}, Rp = ${q.Rp};  Qn = min(${v(q.QnCone, F)}, ${v(q.QnSteel, F)})`, S`Qn = ${u(Qn, F)} per stud`, 'comp.Qn');

  // 5. Compression force in the slab.
  const Py = As * Fy / 1e3, Cc = CO.C2.rect * fc * Ac / 1e3, SumQn = full ? Infinity : input.N1 * Qn, C = Math.min(Cc, Py, SumQn);
  rec.add('Horizontal shear force (compression in the slab)', full ? S`full composite: C = min(${CO.C2.rect} f'c Ac, As Fy)` : S`C = min(${CO.C2.rect} f'c Ac, As Fy, ΣQn);  ΣQn = N1 Qn`,
    full ? S`C = min(${v(Cc, F)}, ${v(Py, F)})` : S`ΣQn = ${input.N1} · ${v(Qn, F)} = ${v(SumQn, F)};  C = min(${v(Cc, F)}, ${v(Py, F)}, ${v(SumQn, F)})`, S`C = ${u(C, F)}`, 'comp.Vprime');

  // Web compactness: the plastic distribution needs h/tw ≤ 3.76 √(E/Fy).
  const webLimit = B.webPlastic * Math.sqrt(E / Fy);
  Object.assign(vals, { be, Ac, Ec, Asc, Qn, Rg: q.Rg, Rp: q.Rp, Py, Cc });
  if (!full) vals.SumQn = SumQn;
  vals.C = C; vals.webLimit = webLimit;
  rec.add('Web slenderness for the plastic stress distribution', S`h / tw ≤ ${B.webPlastic} √(E / Fy)`, S`${htw} against ${B.webPlastic} · √(${v(E, ST)} / ${v(Fy, ST)}) = ${webLimit}`,
    [htw <= webLimit ? 'Plastic stress distribution applies.' : 'The web is too slender for the plastic distribution.'], 'comp.positive');
  if (htw > webLimit) return stop('Elastic stress distribution (' + clause(ed, 'comp.positive') + '(b)) is not built.');

  // 6. Depth of the stress block and the plastic neutral axis.
  const a = C * 1e3 / (CO.C2.rect * fc * be), d1 = Ycon - a / 2, Cs = (Py - C) / 2, Af = bf * tf * Fy / 1e3;
  let d2 = 0, PNA = 'slab', ybar = 0;
  if (Cs > 0) {   // C = As Fy exactly when the steel yields: PNA in the slab
    if (Cs <= Af) { const y = Cs * 1e3 / (bf * Fy); d2 = y / 2; PNA = 'top flange'; ybar = y; }
    else { const yw = (Cs - Af) * 1e3 / (tw * Fy); d2 = (Af * tf / 2 + (Cs - Af) * (tf + yw / 2)) / Cs; PNA = 'web'; ybar = tf + yw; }
  }
  const d3 = dsec / 2;
  rec.add('Depth of the concrete stress block', S`a = C / (${CO.C2.rect} f'c be);  d1 = Ycon − a / 2`, S`a = ${v(C, F)} × 10³ / (${CO.C2.rect} · ${v(fc, ST)} · ${v(be, L)}) = ${u(a, L)}`, S`d1 = ${v(Ycon, L)} − ${v(a, L)} / 2 = ${u(d1, L)}`, 'comp.positive');
  rec.add('Plastic neutral axis', S`Cs = (As Fy − C) / 2;  flange capacity bf tf Fy`,
    S`Cs = (${v(Py, F)} − ${v(C, F)}) / 2 = ${u(Cs, F)};  bf tf Fy = ${u(Af, F)}`,
    PNA === 'slab' ? S`PNA in the slab: d2 = 0` : PNA === 'top flange' ? S`PNA in the top flange, ${u(ybar, L)} below the top of steel: d2 = ${u(d2, L)}` : S`PNA in the web, ${u(ybar, L)} below the top of steel: d2 = ${u(d2, L)}`,
    'comp.positive', 'd2 is the centroid of the steel in compression from the top of the steel; fillets are ignored.');

  // 7. Nominal and available flexural strength.
  const Mn = (C * (d1 + d2) + Py * (d3 - d2)) / 1e3, phiMn = B.phi * Mn, MnOmega = Mn / B.omega, Ma = available(Mn, B, method);
  rec.add('Nominal flexural strength', S`Mn = C (d1 + d2) + As Fy (d3 − d2);  d3 = d / 2`,
    S`Mn = ${v(C, F)} · (${v(d1, L)} + ${v(d2, L)}) + ${v(Py, F)} · (${v(d3, L)} − ${v(d2, L)})`,
    method === 'ASD' ? S`Mn = ${u(Mn, M)};  Mn / Ω = ${v(Mn, M)} / ${B.omega} = ${u(MnOmega, M)}` : S`Mn = ${u(Mn, M)};  φMn = ${B.phi} · ${v(Mn, M)} = ${u(phiMn, M)}`, 'comp.positive');

  // 8. Degree of composite action.
  const ratio = C / Math.min(Cc, Py), Nfull = Math.ceil(Math.min(Cc, Py) / Qn);
  rec.add('Degree of composite action', S`ratio = C / min(${CO.C2.rect} f'c Ac, As Fy);  N for full composite = min(${CO.C2.rect} f'c Ac, As Fy) / Qn`,
    S`ratio = ${v(C, F)} / ${v(Math.min(Cc, Py), F)};  N = ${v(Math.min(Cc, Py), F)} / ${v(Qn, F)}`, S`ratio = ${ratio};  ${Nfull} studs each side of maximum moment for full composite`, 'comp.Vprime');
  if (!full && ratio < B.practiceRatio) out.warnings.push('The composite ratio ' + fmt(ratio) + ' is below ' + B.practiceRatio + ', the common practice minimum (practice, not a code limit).');
  Object.assign(vals, { a, d1, d2, d3, PNA, Mn, phiMn, MnOmega, ratio, Nfull });

  // 9. Studs and deck.
  const SD = CO.stud, DK = CO.deck, N = full ? Nfull : input.N1, sAvg = span / (2 * N), tTotal = tc + hr, dia = input.stud;
  out.notes.push('Stud diameter ' + fmt(dia) + ' mm against ' + SD.diaFlange + ' tf = ' + fmt(SD.diaFlange * tf) + ' mm: the limit does not apply to studs placed over the web, which is assumed for a beam (' + clause(ed, 'comp.studs') + ').');
  rec.add('Stud spacing', S`average spacing s = L / (2 N);  ${SD.minLong} d ≤ s ≤ ${SD.maxSlab} × total slab thickness`,
    S`s = ${v(span, L)} / (2 · ${N}) = ${u(sAvg, L)};  ${SD.minLong} · ${v(dia, L)} = ${u(SD.minLong * dia, L)};  ${SD.maxSlab} · ${v(tTotal, L)} = ${u(SD.maxSlab * tTotal, L)}`, null, 'comp.studs');
  out.checks.push(check('Stud spacing, minimum', ['s min', SD.minLong * dia, L], ['s', sAvg, L], SD.minLong * dia / sAvg, 'comp.studs'));
  out.checks.push(check('Stud spacing, maximum', ['s', sAvg, L], ['s max', SD.maxSlab * tTotal, L], sAvg / (SD.maxSlab * tTotal), 'comp.studs'));
  if (deck !== 'none') {
    rec.add('Steel deck limits', S`hr ≤ ${DK.hrMax} mm;  wr ≥ ${DK.wrMin} mm;  stud d ≤ ${DK.studDiaMax} mm;  slab above the deck ≥ ${DK.slabAbove} mm`,
      wr > 0 ? S`hr = ${v(hr, L)};  wr = ${v(wr, L)};  d = ${v(dia, L)};  tc = ${v(tc, L)}` : S`hr = ${v(hr, L)};  d = ${v(dia, L)};  tc = ${v(tc, L)}`, null, 'comp.deck');
    out.checks.push(check('Deck rib height', ['hr', hr, L], ['hr max', DK.hrMax, L], hr / DK.hrMax, 'comp.deck'));
    if (wr > 0) out.checks.push(check('Deck rib width', ['wr min', DK.wrMin, L], ['wr', wr, L], DK.wrMin / wr, 'comp.deck'));
    else out.notes.push('Average rib width not given: check wr ≥ ' + DK.wrMin + ' mm (' + clause(ed, 'comp.deck') + ').');
    out.checks.push(check('Stud diameter with deck', ['d', dia, L], ['d max', DK.studDiaMax, L], dia / DK.studDiaMax, 'comp.deck'));
    out.checks.push(check('Slab above the deck', ['tc min', DK.slabAbove, L], ['tc', tc, L], DK.slabAbove / tc, 'comp.deck'));
    if (dia > DK.studDiaMax) out.warnings.push('Studs larger than ' + DK.studDiaMax + ' mm are not permitted through a steel deck (' + clause(ed, 'comp.deck') + ').');
  }

  // 10. Strength.
  const st = check('Flexural strength (positive moment)', [method === 'ASD' ? 'Ma' : 'Mu', input.Mu, M], [method === 'ASD' ? 'Mn/Ω' : 'φMn', Ma, M], input.Mu / Ma, 'comp.positive');
  out.checks.unshift(st);
  if (st.status === 'NG') out.warnings.push('The required moment exceeds the available flexural strength of the composite section.');
  out.notes.push('Negative moment: use the steel section alone (' + clause(ed, 'comp.positive') + '(b)); check it in Steel beams.');
  out.notes.push('Construction stage: the steel section alone carries the loads applied before the concrete reaches ' + B.setup * 100 + '% of f\'c (' + clause(ed, 'comp.construction') + '); check it in Steel beams.');
  out.results = [res('Effective width be', be, L), res('Stud strength Qn', Qn, F), res('Slab compression C', C, F), res('Stress block depth a', a, L), res('PNA', PNA, 'text'), res('Mn', Mn, M), res(method === 'ASD' ? 'Mn / Ω' : 'φMn', Ma, M), res('Composite ratio', ratio), res('Studs for full composite (each half span)', Nfull, 'count')];
  Object.assign(out.diagram, { be, a, PNA, ybar, Ycon, N, sAvg, full, ratio, C, Py, chips: [S`be = ${u(be, L)}`, S`a = ${u(a, L)}`, ['PNA: ' + PNA], S`${method === 'ASD' ? 'Mn/Ω' : 'φMn'} = ${u(Ma, M)}`] });
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}

// ---------------------------------------------------------------- columns (509.2)
function column(input, ctx, mode) {
  const ed = ctx.edition, CO = ed.steel.composite, K = CO.column, E = ed.steel.E, method = methodOf(ctx);
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const { Fy, fc, wc, KL } = input;
  if (!positive(input, ['Fy', 'fc', 'wc', 'KL']) || !(input.Pu >= 0)) return stop('Fy, f\'c, wc, KL and the required strength need numbers (all above zero, Pu may be 0).');
  let geo;
  if (mode === 'encased') geo = encasedGeometry(input, ed, rec, out);
  else geo = filledGeometry(input, ed, rec, out);
  if (geo.error) { if (geo.slender != null) Object.assign(vals, { slender: geo.slender, slenderLimit: geo.slenderLimit }); return stop(geo.error); }
  out.diagram = Object.assign({ mode, KL, fc, Fy }, geo.diagram);
  materialNotes(out, ed, fc, wc, Fy);
  const Ec = EcOf(wc, fc, CO);
  rec.add('Modulus of elasticity of concrete', S`Ec = ${CO.EcCoef} wc^(1.5) √f'c`, S`Ec = ${CO.EcCoef} · ${si(wc, D)}^(1.5) · √(${si(fc, ST)})`, S`Ec = ${si(Ec, ST)}`, 'comp.Ec');
  const strengthKey = mode === 'encased' ? 'comp.encStrength' : 'comp.fillStrength';
  let Po, Pe, PeX, PeY;
  if (mode === 'encased') {
    const { As, Asr, Ac, Isr, Is, Ig } = geo, C1 = Math.min(CO.encased.C1.a + CO.encased.C1.b * As / (Ac + As), CO.encased.C1.max);
    rec.add('Coefficient C1', S`C1 = min(${CO.encased.C1.a} + ${CO.encased.C1.b} As / (Ac + As), ${CO.encased.C1.max})`, S`C1 = min(${CO.encased.C1.a} + ${CO.encased.C1.b} · ${v(As, A)} / (${v(Ac, A)} + ${v(As, A)}), ${CO.encased.C1.max})`, S`C1 = ${C1}`, strengthKey);
    const ax = ['x', 'y'].map((k) => {
      const Ic = Ig[k] - Is[k] - Isr[k], EIeff = E * Is[k] + CO.encased.EIsr * E * Isr[k] + C1 * Ec * Ic, P = Math.PI * Math.PI * EIeff / (KL * KL) / 1e3;
      rec.add('Effective stiffness, ' + k + ' axis', S`Ic = Ig − Is − Isr;  EIeff = Es Is + ${CO.encased.EIsr} Es Isr + C1 Ec Ic;  Pe = π² EIeff / (KL)²`,
        S`Ic = ${v(Ig[k], I)} − ${v(Is[k], I)} − ${v(Isr[k], I)} = ${u(Ic, I)};  EIeff = ${u(EIeff, EI)}`, S`Pe = π² · ${v(EIeff, EI)} / ${v(KL, L)}² = ${u(P, F)}`, strengthKey);
      return { Ic, EIeff, Pe: P };
    });
    PeX = ax[0].Pe; PeY = ax[1].Pe; Pe = Math.min(PeX, PeY);
    Po = (As * Fy + Asr * input.Fyr + CO.C2.rect * fc * Ac) / 1e3;
    rec.add('Nominal axial strength without length effects', S`Po = As Fy + Asr Fysr + ${CO.C2.rect} f'c Ac`, S`Po = ${v(As, A)} · ${v(Fy, ST)} + ${v(Asr, A)} · ${v(input.Fyr, ST)} + ${CO.C2.rect} · ${v(fc, ST)} · ${v(Ac, A)}`, S`Po = ${u(Po, F)}`, strengthKey);
    Object.assign(vals, { nbars: geo.nbars, Asr, Ac, Ec, C1, rhoS: geo.rhoS, rhoSr: geo.rhoSr, EIeffX: ax[0].EIeff, EIeffY: ax[1].EIeff, PeX, PeY });
  } else {
    const { As, Ac, Is, Ic, C2 } = geo, C3 = Math.min(CO.filled.C3.a + CO.filled.C3.b * As / (Ac + As), CO.filled.C3.max);
    const EIeff = E * Is + C3 * Ec * Ic;
    Pe = Math.PI * Math.PI * EIeff / (KL * KL) / 1e3;
    Po = (As * Fy + C2 * fc * Ac) / 1e3;
    rec.add('Coefficient C3 and effective stiffness', S`C3 = min(${CO.filled.C3.a} + ${CO.filled.C3.b} As / (Ac + As), ${CO.filled.C3.max});  EIeff = Es Is + C3 Ec Ic`,
      S`C3 = min(${CO.filled.C3.a} + ${CO.filled.C3.b} · ${v(As, A)} / (${v(Ac, A)} + ${v(As, A)}), ${CO.filled.C3.max}) = ${C3};  EIeff = ${v(E, ST)} · ${v(Is, I)} + ${C3} · ${v(Ec, ST)} · ${v(Ic, I)}`, S`EIeff = ${u(EIeff, EI)}`, strengthKey);
    rec.add('Elastic buckling load', S`Pe = π² EIeff / (KL)²`, S`Pe = π² · ${v(EIeff, EI)} / ${v(KL, L)}²`, S`Pe = ${u(Pe, F)}`, strengthKey);
    rec.add('Nominal axial strength without length effects', S`Po = As Fy + C2 f'c Ac;  C2 = ${C2}`, S`Po = ${v(As, A)} · ${v(Fy, ST)} + ${C2} · ${v(fc, ST)} · ${v(Ac, A)}`, S`Po = ${u(Po, F)}`, strengthKey);
    Object.assign(vals, { As, Is, Ac, Ic, Ec, C2, C3, EIeff });
  }
  const cs = columnStrength(Po, Pe, CO), Pn = cs.Pn, phiPn = K.phi * Pn, PnOmega = Pn / K.omega, Pa = available(Pn, K, method);
  rec.add('Nominal compressive strength', cs.inelastic ? S`Pe ≥ ${K.Pe} Po: Pn = Po · ${K.base}^(Po / Pe)` : S`Pe < ${K.Pe} Po: Pn = ${K.elastic} Pe`,
    cs.inelastic ? S`${v(Pe, F)} ≥ ${K.Pe} · ${v(Po, F)};  Pn = ${v(Po, F)} · ${K.base}^(${v(Po, F)} / ${v(Pe, F)})` : S`${v(Pe, F)} < ${K.Pe} · ${v(Po, F)};  Pn = ${K.elastic} · ${v(Pe, F)}`,
    method === 'ASD' ? S`Pn = ${u(Pn, F)};  Pn / Ω = ${v(Pn, F)} / ${K.omega} = ${u(PnOmega, F)}` : S`Pn = ${u(Pn, F)};  φPn = ${K.phi} · ${v(Pn, F)} = ${u(phiPn, F)}`, strengthKey);
  Object.assign(vals, { Po, Pe, Pn, phiPn, PnOmega });
  const st = check('Compressive strength', [method === 'ASD' ? 'Pa' : 'Pu', input.Pu, F], [method === 'ASD' ? 'Pn/Ω' : 'φPn', Pa, F], input.Pu / Pa, strengthKey);
  out.checks.unshift(st);
  if (st.status === 'NG') out.warnings.push('The required axial strength exceeds the available compressive strength of the composite column.');
  out.results = [res('Po', Po, F), res('Pe (governing axis)', Pe, F), res('Pn', Pn, F), res(method === 'ASD' ? 'Pn / Ω' : 'φPn', Pa, F)];
  if (mode === 'encased') {
    const T = CO.tension, PnT = (geo.As * Fy + geo.Asr * input.Fyr) / 1e3;
    rec.add('Tensile strength', S`Pn = As Fy + Asr Fysr`, S`Pn = ${v(geo.As, A)} · ${v(Fy, ST)} + ${v(geo.Asr, A)} · ${v(input.Fyr, ST)}`,
      method === 'ASD' ? S`Pn = ${u(PnT, F)};  Pn / Ω = ${u(PnT / T.omega, F)}` : S`Pn = ${u(PnT, F)};  φPn = ${T.phi} · ${v(PnT, F)} = ${u(T.phi * PnT, F)}`, 'comp.encTension');
    vals.PnT = PnT;
    out.results.push(res('Tensile strength Pn', PnT, F), res(method === 'ASD' ? 'Tension Pn / Ω' : 'Tension φPn', available(PnT, T, method), F));
  } else Object.assign(vals, { slender: geo.slender, slenderLimit: geo.slenderLimit, rhoS: geo.rhoS });
  Object.assign(out.diagram, { Pn, Pa, Pu: input.Pu, inelastic: cs.inelastic, chips: [S`Po = ${u(Po, F)}`, S`Pe = ${u(Pe, F)}`, S`${method === 'ASD' ? 'Pn/Ω' : 'φPn'} = ${u(Pa, F)}`] });
  out.steps = rec.steps.concat(geo.after || []); out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}

// Encased column geometry and detailing (509.2.1). Bars at cover + tie + db/2 from each face, barsPerFace on each face.
function encasedGeometry(input, ed, rec, out) {
  const CO = ed.steel.composite, EC = CO.encased;
  const need = ['As', 'dsec', 'bf', 'tf', 'tw', 'Ix', 'Iy', 'b', 'h', 'db', 'Fyr', 'cover', 'tie'];
  if (!positive(input, need)) return { error: 'Every section property, the concrete size, bar and tie sizes, Fyr and the cover need numbers above zero.' };
  const n = input.barsPerFace;
  if (!(Number.isInteger(n) && n >= 2)) return { error: 'Bars per face must be a whole number of 2 or more.' };
  const { As, dsec, bf, b, h, db, tie, cover } = input, cc = cover + tie + db / 2;
  if (!(dsec < h - 2 * (cover + tie)) || !(bf < b - 2 * (cover + tie))) return { error: 'The steel shape does not fit inside the ties: d and bf must be smaller than the concrete size less twice the cover and tie.' };
  if (!(b > 2 * cc) || !(h > 2 * cc)) return { error: 'The concrete section is too small for the cover, tie and bar size.' };
  const nbars = 4 * (n - 1), Ab = circA(db), Asr = nbars * Ab;
  // Bar positions from the centre: the corner bars and the bars between them on each face.
  const xs = [], ys = [];
  for (let i = 0; i < n; i++) { xs.push(-(b / 2 - cc) + i * (b - 2 * cc) / (n - 1)); ys.push(-(h / 2 - cc) + i * (h - 2 * cc) / (n - 1)); }
  const bars = [];
  xs.forEach((x) => { bars.push([x, ys[0]], [x, ys[n - 1]]); });
  ys.slice(1, n - 1).forEach((y) => { bars.push([xs[0], y], [xs[n - 1], y]); });
  const Isr = { x: bars.reduce((s, p) => s + Ab * p[1] * p[1], 0), y: bars.reduce((s, p) => s + Ab * p[0] * p[0], 0) };
  const Ag = b * h, Ac = Ag - As - Asr, rhoS = As / Ag, rhoSr = Asr / Ag;
  const Ig = { x: rectI(b, h), y: rectI(h, b) }, Is = { x: input.Ix, y: input.Iy };
  rec.add('Areas', S`bars = 4 (n − 1);  Asr = bars · π db² / 4;  Ac = b h − As − Asr`,
    S`bars = 4 · (${n} − 1) = ${nbars};  Asr = ${nbars} · π · ${v(db, L)}² / 4 = ${u(Asr, A)};  Ac = ${v(b, L)} · ${v(h, L)} − ${v(As, A)} − ${v(Asr, A)}`, S`Ac = ${u(Ac, A)}`, 'comp.encLimits');
  rec.add('Moments of inertia of the bars', S`Isr = Σ Ab y² about each axis;  bar centres at cover + tie + db / 2 = ${u(cc, L)} from each face`,
    S`Isr,x = ${u(Isr.x, I)};  Isr,y = ${u(Isr.y, I)}`, S`Ig,x = b h³ / 12 = ${u(Ig.x, I)};  Ig,y = h b³ / 12 = ${u(Ig.y, I)}`, 'comp.encStrength');
  // Detailing checks (509.2.1.1, 509.2.1.6).
  const after = [];
  out.checks.push(check('Steel shape ratio As / Ag', ['minimum', EC.AsMin, 'ratio'], ['As / Ag', rhoS, 'ratio'], EC.AsMin / rhoS, 'comp.encLimits'));
  out.checks.push(check('Longitudinal bar ratio Asr / Ag', ['minimum', EC.rhoSrMin, 'ratio'], ['Asr / Ag', rhoSr, 'ratio'], EC.rhoSrMin / rhoSr, 'comp.encLimits'));
  out.checks.push(check('Number of bars', ['minimum', EC.barsMin, 'count'], ['bars', nbars, 'count'], EC.barsMin / nbars, 'comp.encLimits'));
  out.checks.push(check('Clear cover to the ties', ['minimum', EC.cover, L], ['cover', cover, L], EC.cover / cover, 'comp.encDetail'));
  if (input.sTie > 0) {
    const T = EC.tie, sMax = Math.min(T.db * db, T.dt * tie, T.dim * Math.min(b, h));
    after.push({ title: 'Tie spacing', formula: S`s ≤ min(${T.db} db, ${T.dt} tie diameters, ${T.dim} × least dimension)`, substitution: S`min(${T.db} · ${v(db, L)}, ${T.dt} · ${v(tie, L)}, ${T.dim} · ${v(Math.min(b, h), L)}) = ${u(sMax, L)}`, result: S`s = ${u(input.sTie, L)}`, note: '', clause: 'comp.encLimits' });
    out.checks.push(check('Tie spacing', ['s', input.sTie, L], ['s max', sMax, L], input.sTie / sMax, 'comp.encLimits'));
  } else out.notes.push('Tie spacing not given: check s ≤ min(' + EC.tie.db + ' db, ' + EC.tie.dt + ' tie diameters, ' + EC.tie.dim + ' × least dimension) (' + clause(ed, 'comp.encLimits') + ').');
  return { As, Asr, Ac, Isr, Is, Ig, nbars, rhoS, rhoSr, after, diagram: { b, h, dsec, bf, tf: input.tf, tw: input.tw, db, tie, cover, cc, bars } };
}

// Filled HSS geometry and the wall slenderness limit (509.2.2).
function filledGeometry(input, ed, rec, out) {
  const CO = ed.steel.composite, FL = CO.filled, E = ed.steel.E, Fy = input.Fy, t = input.t;
  const rect = input.hss !== 'round';
  if (rect ? !positive(input, ['B', 'H', 't']) : !positive(input, ['D', 't'])) return { error: rect ? 'B, H and t need numbers above zero.' : 'D and t need numbers above zero.' };
  let As, Is, Ac, Ic, slender, slenderLimit, C2, diagram;
  if (rect) {
    const { B, H } = input, bi = B - 2 * t, hi = H - 2 * t;
    if (!(bi > 0 && hi > 0)) return { error: 'The wall thickness is too large for the tube size.' };
    As = B * H - bi * hi; Ac = bi * hi;
    Is = Math.min(rectI(B, H) - rectI(bi, hi), rectI(H, B) - rectI(hi, bi)); Ic = Math.min(rectI(bi, hi), rectI(hi, bi));
    slender = (Math.max(B, H) - 3 * t) / t; slenderLimit = FL.rectBt * Math.sqrt(E / Fy); C2 = CO.C2.rect;
    rec.add('Steel and concrete areas', S`As = B H − (B − 2t)(H − 2t);  Ac = (B − 2t)(H − 2t)`, S`As = ${v(B, L)} · ${v(H, L)} − ${v(bi, L)} · ${v(hi, L)} = ${u(As, A)}`, S`Ac = ${u(Ac, A)}`, 'comp.fillStrength');
    rec.add('Moments of inertia (weaker axis)', S`Is = [B H³ − (B − 2t)(H − 2t)³] / 12;  Ic = (B − 2t)(H − 2t)³ / 12`, null, S`Is = ${u(Is, I)};  Ic = ${u(Ic, I)}`, 'comp.fillStrength');
    rec.add('Wall slenderness', S`b / t = (max(B, H) − 3t) / t ≤ ${FL.rectBt} √(E / Fy)`, S`(${v(Math.max(B, H), L)} − 3 · ${v(t, L)}) / ${v(t, L)} = ${slender} against ${FL.rectBt} · √(${v(E, ST)} / ${v(Fy, ST)}) = ${slenderLimit}`,
      [slender <= slenderLimit ? 'The wall is not slender.' : 'The wall is slender.'], 'comp.fillLimits');
    diagram = { hss: 'rect', B, H, t };
  } else {
    const Dd = input.D, di = Dd - 2 * t;
    if (!(di > 0)) return { error: 'The wall thickness is too large for the tube size.' };
    As = circA(Dd) - circA(di); Ac = circA(di); Is = circI(Dd) - circI(di); Ic = circI(di);
    slender = Dd / t; slenderLimit = FL.roundDt * E / Fy; C2 = CO.C2.round;
    rec.add('Steel and concrete areas', S`As = π [D² − (D − 2t)²] / 4;  Ac = π (D − 2t)² / 4`, S`As = π · (${v(Dd, L)}² − ${v(di, L)}²) / 4 = ${u(As, A)}`, S`Ac = ${u(Ac, A)}`, 'comp.fillStrength');
    rec.add('Moments of inertia', S`Is = π [D⁴ − (D − 2t)⁴] / 64;  Ic = π (D − 2t)⁴ / 64`, null, S`Is = ${u(Is, I)};  Ic = ${u(Ic, I)}`, 'comp.fillStrength');
    rec.add('Wall slenderness', S`D / t ≤ ${FL.roundDt} E / Fy`, S`${v(Dd, L)} / ${v(t, L)} = ${slender} against ${FL.roundDt} · ${v(E, ST)} / ${v(Fy, ST)} = ${slenderLimit}`,
      [slender <= slenderLimit ? 'The wall is not slender.' : 'The wall is slender.'], 'comp.fillLimits');
    diagram = { hss: 'round', D: Dd, t };
  }
  const rhoS = As / (As + Ac);
  out.checks.push(check('Wall slenderness', [rect ? 'b/t' : 'D/t', slender, 'ratio'], ['limit', slenderLimit, 'ratio'], slender / slenderLimit, 'comp.fillLimits'));
  out.checks.push(check('Steel ratio As / Ag', ['minimum', FL.AsMin, 'ratio'], ['As / Ag', rhoS, 'ratio'], FL.AsMin / rhoS, 'comp.fillLimits'));
  if (slender > slenderLimit) return { error: 'not covered: ' + clause(ed, 'comp.fillLimits') + ' limit. The tube wall is slender (' + fmt(slender) + ' > ' + fmt(slenderLimit) + ').', slender, slenderLimit };
  return { As, Is, Ac, Ic, C2, slender, slenderLimit, rhoS, diagram };
}
