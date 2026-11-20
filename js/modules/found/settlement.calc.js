// Settlement of shallow foundations (theory: Das, Principles of Foundation Engineering, Ch. 8 and 9), with the code
// provisions on settlement as notes. Pure calculation.
// Units: m (plan, depths, thicknesses), kPa (pressures, Es), kN/m³; settlements in mm.
import { S, v, u, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { fmt } from '../../core/format.js';

const LM = 'length_m', L = 'length_mm', P = 'pressure', G = 'unitweight';
const clause = (ed, key) => (ed.clauses[key] ? ed.clauses[key].nscp : '');

// Steinbrenner factors F1, F2 in closed form (Das Eqs. 9.12 to 9.16).
export function steinbrenner(m, n) {
  const s1 = Math.sqrt(m * m + 1), s2 = Math.sqrt(m * m + n * n), s3 = Math.sqrt(m * m + n * n + 1);
  const A0 = m * Math.log((1 + s1) * s2 / (m * (1 + s3))), A1 = Math.log((m + s1) * Math.sqrt(1 + n * n) / (m + s3)), A2 = m / (n * s3);
  return { F1: (A0 + A1) / Math.PI, F2: n / (2 * Math.PI) * Math.atan(A2) };
}
// Boussinesq influence factor below the corner of a B x L rectangle at depth z (Das Eq. 8.10).
export function cornerFactor(B, Lr, z) {
  const m = B / z, n = Lr / z, s = m * m + n * n + 1, mn = m * n;
  const t1 = 2 * mn * Math.sqrt(s) / (m * m + n * n + mn * mn + 1) * (m * m + n * n + 2) / s;
  const den = s - mn * mn;
  let t2 = Math.atan(2 * mn * Math.sqrt(s) / den);
  if (den < 0) t2 += Math.PI;
  return (t1 + t2) / (4 * Math.PI);
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) { return input.mode === 'consolidation' ? consolidation(input, ctx.edition) : elastic(input, ctx.edition); }

const rows = (x) => (Array.isArray(x) ? x : []);

// Code provisions shown on every result.
function codeNotes(out, ed) {
  out.notes.push('NSCP 2015 gives no settlement formula; the calculation follows soil mechanics theory. Expected total and differential settlements are part of the foundation investigation report (' + clause(ed, 'found.settleReport') + '), compressible soils call for consolidation tests (' + clause(ed, 'found.settleTests') + '), and differential settlement is to be minimised (' + clause(ed, 'found.settleDiff') + ').');
}
// Optional allowable settlement: a check row and a verdict only when it is given.
function allowable(out, input, Sx, name) {
  if (input.allow > 0) {
    out.checks.push(check(name + ' (owner\'s or designer\'s limit)', ['S', Sx, L], ['allowable', input.allow, L], Sx / input.allow, 'theory.settleElastic'));
    out.verdict = verdictOf(out.checks);
  } else out.verdict = null;
}

// ---------------------------------------------------------------- elastic settlement (Steinbrenner)
function elastic(input, ed) {
  const T = ed.theory.settlement, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  if (!positive(input, ['B', 'L', 'q0', 'H']) || !(input.mu >= 0 && input.mu < 0.5)) return stop('B, L, q0 and H need numbers above zero, and μ a value from 0 to below 0.5.');
  let B = input.B, Lf = input.L;
  if (B > Lf) { [B, Lf] = [Lf, B]; out.notes.push('B and L were swapped so that B ≤ L.'); }
  const mu = input.mu, q0 = input.q0, H = input.H, If = input.If > 0 ? input.If : 1, point = input.point === 'corner' ? 'corner' : 'center';
  const layers = rows(input.layers).filter((r) => r && r.t > 0 && r.Es > 0);
  if (!layers.length) return stop('Add at least one soil layer with a thickness and Es above zero.');
  // Weighted Es over zbar (the last layer is cut at zbar, or extended to it).
  const zbar = Math.min(T.zbarB * B, H);
  let z = 0, sum = 0;
  const used = [];
  layers.forEach((r, i) => {
    if (z >= zbar) return;
    const last = i === layers.length - 1, dz = last ? zbar - z : Math.min(r.t, zbar - z);
    sum += r.Es * dz; used.push({ t: dz, Es: r.Es }); z += dz;
  });
  if (layers.reduce((s, r) => s + r.t, 0) < zbar) out.notes.push('The layers end above z̄ = ' + fmt(zbar) + ' m: the last layer is taken to continue to z̄.');
  const Es = sum / zbar;
  rec.add('Average modulus of the soil', S`z̄ = min(${T.zbarB} B, H);  Es = Σ Es,i Δzi / z̄`, S`z̄ = min(${T.zbarB} · ${v(B, LM)}, ${v(H, LM)}) = ${u(zbar, LM)};  Σ Es,i Δzi = ${used.map((r) => fmt(r.Es) + ' × ' + fmt(r.t)).join(' + ')}`, S`Es = ${u(Es, P)}`, 'theory.settleElastic');
  const factors = (pt) => {
    const alpha = T.alpha[pt], Bp = pt === 'corner' ? B : B / 2, m = Lf / B, n = H / Bp, f = steinbrenner(m, n), Is = f.F1 + (1 - 2 * mu) / (1 - mu) * f.F2;
    return { alpha, Bp, m, n, F1: f.F1, F2: f.F2, Is };
  };
  const seOf = (k, IfV) => q0 * (k.alpha * k.Bp) * (1 - mu * mu) / Es * k.Is * IfV * 1e3;
  const k = factors(point), Se = seOf(k, If), kc = point === 'center' ? k : factors('center'), SeCentre = seOf(kc, If), SeRigid = T.rigid * SeCentre;
  rec.add('Steinbrenner factors', S`${point === 'corner' ? 'corner' : 'centre'}: α = ${k.alpha}, B' = ${point === 'corner' ? 'B' : 'B / 2'};  m' = L / B, n' = H / B';  F1, F2 by Eqs. 9.12 to 9.16`,
    S`m' = ${k.m};  n' = ${k.n};  F1 = ${k.F1};  F2 = ${k.F2}`, S`Is = F1 + (1 − 2μ) / (1 − μ) F2 = ${k.Is}`, 'theory.settleElastic', 'The textbook reads F1 and F2 from tables, so its values differ in the third digit.');
  rec.add('Elastic settlement', S`Se = q0 (α B') (1 − μ²) / Es × Is × If`, S`Se = ${v(q0, P)} · (${k.alpha} · ${v(k.Bp, LM)}) · (1 − ${mu}²) / ${v(Es, P)} · ${k.Is} · ${If}`, S`Se = ${u(Se, L)}`, 'theory.settleElastic');
  if (input.rigid) rec.add('Rigid footing', S`Se,rigid ≈ ${T.rigid} Se at the centre`, S`${T.rigid} · ${v(SeCentre, L)}`, S`Se,rigid = ${u(SeRigid, L)}`, 'theory.settleElastic');
  Object.assign(vals, { zbar, Es, m: k.m, n: k.n, F1: k.F1, F2: k.F2, Is: k.Is, Se, SeCentre, SeRigid });
  out.results = [res('Es (average)', Es, P), res('Is', k.Is), res('Se (' + (point === 'corner' ? 'corner' : 'centre') + ')', Se, L), res('Se at the centre', SeCentre, L)].concat(input.rigid ? [res('Se, rigid footing', SeRigid, L)] : []);
  codeNotes(out, ed);
  allowable(out, input, input.rigid ? SeRigid : Se, 'Elastic settlement');
  out.diagram = { mode: 'elastic', B, L: Lf, H, zbar, point, layers: layers.map((r) => ({ t: r.t, Es: r.Es })), Se, q0, chips: [S`Es = ${u(Es, P)}`, S`Se = ${u(Se, L)}`] };
  out.steps = rec.steps;
  return { vals, result: out };
}

// ---------------------------------------------------------------- primary consolidation
function consolidation(input, ed) {
  const T = ed.theory.settlement, gw = ed.theory.gammaW, vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const clay = input.clay || {};
  if (!positive(input, ['B', 'L', 'q0']) || !(input.Df >= 0)) return stop('B, L and q0 need numbers above zero, and Df a number of 0 or more.');
  if (!positive(clay, ['Hc', 'gammaSat', 'e0', 'Cc', 'Cs'])) return stop('The clay layer needs Hc, γsat, e0, Cc and Cs above zero.');
  let B = input.B, Lf = input.L;
  if (B > Lf) { [B, Lf] = [Lf, B]; out.notes.push('B and L were swapped so that B ≤ L.'); }
  const q0 = input.q0, Df = input.Df, wt = input.gw >= 0 ? input.gw : Infinity;
  const layers = rows(input.layers).filter((r) => r && r.t > 0);
  if (layers.some((r) => !(r.gamma > 0) || !(r.gammaSat > 0))) return stop('Every soil layer needs γ and γsat above zero.');
  // Effective stress at the middle of the clay.
  let z = 0, sig = 0;
  const parts = [];
  const addLayer = (t, gam, gsat) => {
    const above = Math.max(0, Math.min(z + t, wt) - z), below = t - above;
    if (above > 0) { sig += gam * above; parts.push(fmt(above) + ' × ' + fmt(gam)); }
    if (below > 0) { sig += (gsat - gw) * below; parts.push(fmt(below) + ' × (' + fmt(gsat) + ' − ' + gw + ')'); }
    z += t;
  };
  layers.forEach((r) => addLayer(r.t, r.gamma, r.gammaSat));
  const clayTop = z, Hc = clay.Hc;
  if (clayTop + Hc / 2 < wt) out.notes.push('The middle of the clay is above the water table; γsat of the clay is used there.');
  addLayer(Hc / 2, clay.gammaSat, clay.gammaSat);
  const sigO = sig, ztop = clayTop - Df;
  if (!(ztop >= 0)) return stop('The clay must start at or below the base of the footing (the layers above the clay must be at least Df thick).');
  rec.add("Effective stress at the middle of the clay", S`σ'o = Σ γ t above the water table + Σ (γsat − γw) t below it;  γw = ${gw}`, [parts.join(' + ')], S`σ'o = ${u(sigO, P)}`, 'theory.settleConsol');
  // Stress increase below the centre of the footing.
  const zs = [ztop, ztop + Hc / 2, ztop + Hc], bous = input.stress !== '2to1';
  const ds = zs.map((zz) => (bous ? (zz > 0 ? T.alpha.center * q0 * cornerFactor(B / 2, Lf / 2, zz) : q0) : q0 * B * Lf / ((B + 2 * zz / T.spread) * (Lf + 2 * zz / T.spread))));
  const W = T.simpson, dsAv = (W[0] * ds[0] + W[1] * ds[1] + W[2] * ds[2]) / (W[0] + W[1] + W[2]);
  rec.add('Stress increase in the clay (below the centre)', bous ? S`Boussinesq: Δσ = ${T.alpha.center} q0 I(B / 2, L / 2, z)` : S`2:1 method: Δσ = q0 B L / [(B + z)(L + z)]`,
    S`z = ${u(zs[0], LM)}, ${u(zs[1], LM)}, ${u(zs[2], LM)} below the base`, S`Δσt = ${u(ds[0], P)};  Δσm = ${u(ds[1], P)};  Δσb = ${u(ds[2], P)}`, 'theory.stress');
  rec.add('Average stress increase', S`Δσav = (Δσt + ${W[1]} Δσm + Δσb) / ${W[0] + W[1] + W[2]}`, S`Δσav = (${v(ds[0], P)} + ${W[1]} · ${v(ds[1], P)} + ${v(ds[2], P)}) / ${W[0] + W[1] + W[2]}`, S`Δσav = ${u(dsAv, P)}`, 'theory.stress');
  // Settlement.
  const k = Hc / (1 + clay.e0), fin = sigO + dsAv, sc = clay.sigc > 0 ? clay.sigc : null;
  let Sc, clayCase;
  if (sc == null || sc < sigO) {
    if (sc != null) out.warnings.push("σ'c = " + fmt(sc) + " kPa is below σ'o = " + fmt(sigO) + ' kPa: the clay appears underconsolidated; the normally consolidated formula is used.');
    Sc = clay.Cc * k * Math.log10(fin / sigO); clayCase = 'NC';
    rec.add('Consolidation settlement (normally consolidated)', S`Sc = Cc Hc / (1 + e0) log[(σ'o + Δσav) / σ'o]`, S`Sc = ${clay.Cc} · ${v(Hc, LM)} / (1 + ${clay.e0}) · log(${v(fin, P)} / ${v(sigO, P)})`, null, 'theory.settleConsol');
  } else if (fin <= sc) {
    Sc = clay.Cs * k * Math.log10(fin / sigO); clayCase = 'OC1';
    rec.add('Consolidation settlement (overconsolidated, σ\'o + Δσav ≤ σ\'c)', S`Sc = Cs Hc / (1 + e0) log[(σ'o + Δσav) / σ'o]`, S`Sc = ${clay.Cs} · ${v(Hc, LM)} / (1 + ${clay.e0}) · log(${v(fin, P)} / ${v(sigO, P)})`, null, 'theory.settleConsol');
  } else {
    Sc = clay.Cs * k * Math.log10(sc / sigO) + clay.Cc * k * Math.log10(fin / sc); clayCase = 'OC2';
    rec.add('Consolidation settlement (overconsolidated, σ\'o < σ\'c < σ\'o + Δσav)', S`Sc = Cs Hc / (1 + e0) log(σ'c / σ'o) + Cc Hc / (1 + e0) log[(σ'o + Δσav) / σ'c]`,
      S`Sc = ${clay.Cs} · ${v(k, LM)} · log(${v(sc, P)} / ${v(sigO, P)}) + ${clay.Cc} · ${v(k, LM)} · log(${v(fin, P)} / ${v(sc, P)})`, null, 'theory.settleConsol');
  }
  Sc *= 1e3;
  rec.steps[rec.steps.length - 1].result = S`Sc = ${u(Sc, L)}`;
  Object.assign(vals, { sigO, ztop, dsTop: ds[0], dsMid: ds[1], dsBot: ds[2], dsAv, Sc, clayCase });
  out.results = [res("σ'o (middle of the clay)", sigO, P), res('Δσav', dsAv, P), res('Sc', Sc, L), res('Clay', clayCase === 'NC' ? 'normally consolidated' : 'overconsolidated', 'text')];
  codeNotes(out, ed);
  allowable(out, input, Sc, 'Consolidation settlement');
  out.diagram = { mode: 'consolidation', B, L: Lf, Df, wt: Number.isFinite(wt) ? wt : null, layers: layers.map((r) => ({ t: r.t })), clayTop, Hc, zs, ds, dsAv, bous, q0, Sc,
    chips: [S`σ'o = ${u(sigO, P)}`, S`Δσav = ${u(dsAv, P)}`, S`Sc = ${u(Sc, L)}`] };
  out.steps = rec.steps;
  return { vals, result: out };
}
