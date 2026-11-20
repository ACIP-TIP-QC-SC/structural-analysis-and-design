// Seismic loads, NSCP 2015 Sec. 208 (the UBC-1997 static force procedure): design base shear, its
// vertical distribution, the simplified static method, redundancy, load effects E and Em, and the storey
// drift check. Pure: no DOM, no rounding. Every factor, table and clause comes from ctx.edition.seismic.
// Units: heights m, weights and forces kN, moments kN·m, displacements mm, period s, distance km.
import { S, v, u, recorder, blank, fail, res, check, verdictOf } from '../../core/steps.js';
import { interp } from './wind.calc.js';
import { fmt } from '../../core/format.js';

const isNum = (x) => typeof x === 'number' && isFinite(x);
const SMRF = ['A-C1', 'B-C1', 'B-C5'];      // special moment-resisting frames (Table 208-11 rows), 208.6.1

// Near-source factors Na and Nv (Tables 208-5 and 208-6), linear in the distance, clamped.
export function nearSource(SE, source, dist) {
  return { Na: interp(dist, SE.Na.km, SE.Na[source]), Nv: interp(dist, SE.Nv.km, SE.Nv[source]) };
}

function run(input, ctx) {
  const ed = ctx.edition, SE = ed.seismic, mode = input.mode || 'static';
  const I0 = Object.assign({ zone: 4, soil: 'SD', occupancy: 'IV', source: 'C', dist: 10, system: 'A-C1', ct: 'rc-mrf', regular: true }, input);
  ['soil', 'occupancy', 'source', 'system', 'ct'].forEach((k) => { if (input[k] == null || input[k] === '') I0[k] = { soil: 'SD', occupancy: 'IV', source: 'C', system: 'A-C1', ct: 'rc-mrf' }[k]; });
  const zone = Number(I0.zone) === 2 ? 2 : 4, Z = SE.zones[zone], z4 = zone === 4;
  const sys = SE.systems.find((r) => r.id === I0.system);
  const errs = [];
  if (!sys) errs.push('Choose a structural system from Table 208-11.');
  const levels = Array.isArray(I0.levels) ? I0.levels.map((r) => Object.assign({}, r)) : [];
  if (mode !== 'static') {
    if (!levels.length) errs.push('Add at least one level.');
    const key = mode === 'drift' ? 'dS' : 'w';
    if (levels.some((r) => !(r.h > 0) || !isNum(r[key]))) errs.push('Every level needs its height h above the base and ' + (mode === 'drift' ? 'its displacement δS.' : 'its weight w.'));
    if (levels.some((r, i) => i && !(r.h > levels[i - 1].h))) errs.push('List the levels from the lowest to the highest.');
  }
  if (mode === 'drift') { if (!(I0.T > 0)) errs.push('Enter the fundamental period T.'); }
  else {
    if (!SE.Ca[zone][I0.soil] && I0.soil !== 'unknown') errs.push('Choose a soil profile SA to SE (SF needs a site-specific evaluation).');
    if (z4 && (!SE.Na[I0.source] || !(I0.dist >= 0))) errs.push('Zone 4: choose the seismic source type and the distance to it.');
  }
  if (mode === 'static') {
    if (!(I0.hn > 0)) errs.push('Enter the height hn.');
    if (!(I0.W > 0)) errs.push('Enter the seismic dead load W.');
  }
  if (I0.ct === 'walls' && mode !== 'drift' && mode !== 'simplified' && !(I0.Ac > 0)) errs.push('Enter the combined effective area Ac of the shear walls.');
  if (errs.length) return { vals: { error: true }, result: fail(errs) };

  const out = blank(), rec = recorder(), vals = {};
  const R = sys.R, Omega0 = sys.Omega0;
  Object.assign(vals, { R, Omega0 });
  const sysText = sys.material + ', ' + sys.system.toLowerCase() + ': ' + sys.name;
  rec.add('Structural system', S`Table 208-11, row ${sys.id}: ${sysText}`, null, S`R = ${R}; Ω0 = ${Omega0}`, 'seis.system',
    sys.id === 'A-B2' ? 'As printed in NSCP 2015, ordinary RC shear walls in a building frame have R 5.6 and Ω0 2.2, higher than the special walls (5.0); used as printed.' : '');

  // ---------------------------------------------------------------- drift (208.6.4, 208.6.5)
  if (mode === 'drift') {
    const T = I0.T, short = T < SE.drift.Tbreak, k = short ? SE.drift.limShort : SE.drift.limLong;
    let prevD = 0, prevH = 0, worst = null;
    vals.levels = levels.map((r, i) => {
      const dS = r.dS - prevD, hs = (r.h - prevH) * 1000, dM = SE.drift.DM * R * dS, limit = k * hs;
      prevD = r.dS; prevH = r.h;
      const row = { h: r.h, dS, dM, limit, ratio: dM / limit, storey: i + 1 };
      if (!worst || row.ratio > worst.ratio) worst = row;
      return row;
    });
    vals.dcMax = worst.ratio; vals.limit = worst.limit;
    rec.add('Drift limit', S`T = ${u(T, 'time_s')} ${short ? '<' : '≥'} ${SE.drift.Tbreak} s: ΔM ≤ ${k} × storey height`, null, null, 'seis.drift');
    vals.levels.forEach((r) => {
      rec.add('Storey ' + r.storey + ' (to h = ' + r.h + ' m)', S`ΔS = δS(${r.storey}) − δS(${r.storey - 1}); ΔM = ${SE.drift.DM} R ΔS`, S`ΔS = ${u(r.dS, 'disp')}; ΔM = ${SE.drift.DM} × ${R} × ${v(r.dS, 'disp')}`,
        S`ΔM = ${u(r.dM, 'disp')} against ${u(r.limit, 'disp')}`, 'seis.drift');
      out.checks.push(check('Storey ' + r.storey + ' drift', ['ΔM', r.dM, 'disp'], ['Limit', r.limit, 'disp'], r.ratio, 'seis.drift'));
    });
    out.verdict = verdictOf(out.checks);
    out.notes.push('P-Δ effects need not be considered when the stability ratio is ≤ ' + SE.pdelta.ratio + ', or in Zone 4 when the drift ratio is ≤ ' + SE.pdelta.zone4 + '/R (208.6.3).');
    out.notes.push('Deformation compatibility uses the larger of ΔM and ' + SE.drift.compat + ' × the storey height (208.7.2.3). ρ = 1.0 for drift.');
    out.results = [res('Largest ΔM / limit', vals.dcMax), res('Limit of that storey', vals.limit, 'disp'), res('R', R), res('T', T, 'time_s')];
    out.diagram = { mode, R, T, levels: vals.levels,
      tables: [{ title: 'Storey drift', head: ['Storey', 'h', 'ΔS', 'ΔM', 'Limit', 'ΔM / limit'], rows: vals.levels.map((r) => ({ hl: r === worst, cells: [String(r.storey), u(r.h, 'length_m'), u(r.dS, 'disp'), u(r.dM, 'disp'), u(r.limit, 'disp'), v(r.ratio)] })) }] };
    out.steps = rec.steps;
    return { vals, result: out };
  }

  // ---------------------------------------------------------------- site and coefficients
  const simplified = mode === 'simplified';
  const soil = I0.soil === 'unknown' ? (simplified ? SE.soilUnknownSimplified : SE.soilUnknown)[zone] : I0.soil;
  vals.soilUsed = soil;
  let Na = 1, Nv = 1;
  if (z4) ({ Na, Nv } = nearSource(SE, I0.source, I0.dist));
  if (simplified && Na > SE.NaCapSimplified) { Na = SE.NaCapSimplified; out.notes.push('Simplified method: Na need not exceed ' + SE.NaCapSimplified + ' for structures without the listed irregularities (208.5.1.1).'); }
  const Ca = SE.Ca[zone][soil] * (z4 ? Na : 1), Cv = SE.Cv[zone][soil] * (z4 ? Nv : 1);
  // The simplified method applies only to Occupancy IV and V (208.4.8.1), so I = 1.0 there.
  const I = simplified ? SE.importance.IV.I : SE.importance[I0.occupancy].I;
  Object.assign(vals, { Z, Na, Nv, Ca, Cv, I });
  rec.add('Seismic zone', S`Zone ${zone}: Z = ${Z}`, null, null, 'seis.zone', SE.zone2Note);
  rec.add('Soil profile', S`Soil profile ${soil}${I0.soil === 'unknown' ? ' (soil properties not known)' : ''}`, null, null, I0.soil === 'unknown' ? 'seis.soilUnknown' : 'seis.soil',
    I0.soil === 'unknown' ? (simplified ? 'Simplified method: ' + SE.soilUnknownSimplified[4] + ' in Zone 4 and ' + SE.soilUnknownSimplified[2] + ' in Zone 2 (208.5.1.1).' : 'SD is used where the soil properties are not known in enough detail (208.4.3).') : '');
  if (z4) {
    rec.add('Seismic source and near-source factors', S`Source type ${I0.source}; distance ${u(I0.dist, 'dist_km')}; Na and Nv by linear interpolation`, null, S`Na = ${Na}; Nv = ${Nv}`, 'seis.Na',
      'Use the largest Na and Nv of all sources within 15 km (Table 208-5 note).');
  }
  rec.add('Seismic coefficient Ca', z4 ? S`Ca = ${SE.Ca[zone][soil]} Na` : S`Ca from Table 208-7`, z4 ? S`Ca = ${SE.Ca[zone][soil]} × ${Na}` : null, S`Ca = ${Ca}`, 'seis.Ca');
  rec.add('Seismic coefficient Cv', z4 ? S`Cv = ${SE.Cv[zone][soil]} Nv` : S`Cv from Table 208-8`, z4 ? S`Cv = ${SE.Cv[zone][soil]} × ${Nv}` : null, S`Cv = ${Cv}`, 'seis.Cv');
  if (!simplified) rec.add('Importance factor', S`I = ${I}`, null, null, 'seis.importance', SE.importance[I0.occupancy].label + '.');

  // height limit of the system and the procedure (208.4.8)
  const hn = mode === 'static' ? I0.hn : levels[levels.length - 1].h;
  const W = mode === 'static' ? I0.W : levels.reduce((t, r) => t + r.w, 0);
  const hmax = z4 ? sys.hmaxZone4 : sys.hmaxZone2;
  if (hmax === 'NP') out.checks.push(check('Structural system permitted (Table 208-11)', ['hn', hn, 'length_m'], ['Limit', 'not permitted in Zone ' + zone, 'text'], Infinity, 'seis.system'));
  else if (hmax == null) out.checks.push(check('Height limit of the system (Table 208-11)', ['hn', hn, 'length_m'], ['Limit', 'no limit', 'text'], 0, 'seis.system'));
  else out.checks.push(check('Height limit of the system (Table 208-11)', ['hn', hn, 'length_m'], ['Limit', hmax, 'length_m'], hn / hmax, 'seis.system'));
  const PR = SE.procedure, storeys = mode === 'static' ? null : levels.length;
  if (simplified) {
    const maxSt = I0.light ? PR.simplifiedLight : PR.simplifiedOther;
    if (storeys > maxSt) return { vals: { error: true }, result: fail(['The simplified static method is limited to ' + PR.simplifiedLight + ' storeys of light-frame construction or ' + PR.simplifiedOther + ' storeys of other construction (208.4.8.1). Use the static force procedure.']) };
    out.checks.push(check('Simplified method permitted (208.4.8.1)', ['Storeys', storeys, 'count'], ['Limit', maxSt, 'count'], storeys / maxSt, 'seis.procedure'));
  } else {
    const anyH = zone === 2 && (I0.occupancy === 'IV' || I0.occupancy === 'V');
    const regular = I0.regular !== false;
    if (!anyH) {
      const ok = regular ? hn < PR.staticMaxH : hn <= PR.irregMaxH && (storeys == null || storeys <= PR.irregMaxStoreys);
      if (!ok) return { vals: { error: true }, result: fail(['The static force procedure is not permitted for this structure: ' + (regular ? 'a regular structure ' + PR.staticMaxH + ' m or taller' : 'an irregular structure over ' + PR.irregMaxStoreys + ' storeys or ' + PR.irregMaxH + ' m') + ' needs the dynamic lateral-force procedure (208.4.8.3), which is not built here.']) };
      out.checks.push(check('Static force procedure permitted (208.4.8.2)', ['hn', hn, 'length_m'], ['Limit', regular ? PR.staticMaxH : PR.irregMaxH, 'length_m'], hn / (regular ? PR.staticMaxH : PR.irregMaxH), 'seis.procedure', regular ? null : { note: storeys == null ? 'Irregular: the storey count is checked in Vertical distribution.' : storeys + ' storeys' }));
    } else out.checks.push(check('Static force procedure permitted (208.4.8.2)', ['Zone 2, Occupancy', I0.occupancy, 'text'], ['Limit', 'any height', 'text'], 0, 'seis.procedure'));
  }

  // ---------------------------------------------------------------- base shear
  let V, governs, T = null, TA = null;
  if (simplified) {
    V = SE.simplified.coef * Ca * W / R;
    governs = 'Eq. 208-5';
    Object.assign(vals, { V, VW: V / W });
    rec.add('Design base shear, simplified static method', S`V = (${SE.simplified.coef} Ca / R) W`, S`V = ${SE.simplified.coef} × ${Ca} / ${R} × ${v(W, 'force')}`, S`V = ${u(V, 'force')}`, 'seis.simplified');
    vals.levels = levels.map((r) => ({ h: r.h, w: r.w, F: SE.simplified.coef * Ca * r.w / R }));
    let acc = 0;
    for (let i = vals.levels.length - 1; i >= 0; i--) { acc += vals.levels[i].F; vals.levels[i].V = acc; vals.levels[i].Ftotal = vals.levels[i].F; }
    rec.add('Lateral force at each level', S`Fx = (${SE.simplified.coef} Ca / R) wx`, null, S`F at the top level = ${u(vals.levels[vals.levels.length - 1].F, 'force')}`, 'seis.simplified');
    vals.Ft = 0;
    vals.Mot = vals.levels.reduce((t, r) => t + r.F * r.h, 0);
    out.notes.push('Simplified method: storey drift is taken as ' + SE.simplified.drift + ' × the storey height unless computed (208.5.1.6). ρ and Ev are included in E below (208.6.1).');
  } else {
    const ct = I0.ct, Ct = ct === 'walls' ? SE.CtWalls.coef / Math.sqrt(I0.Ac) : SE.Ct[ct];
    TA = Ct * Math.pow(hn, 3 / 4);
    const cap = SE.periodBCap[zone];
    T = isNum(I0.TB) && I0.TB > 0 ? Math.min(I0.TB, cap * TA) : TA;
    Object.assign(vals, { TA, T });
    rec.add('Period by Method A', ct === 'walls' ? S`T = Ct hn^(3/4), Ct = ${SE.CtWalls.coef}/√Ac` : S`T = Ct hn^(3/4)`, S`T = ${Ct} × ${v(hn, 'length_m')}^(3/4)`, S`TA = ${u(TA, 'time_s')}`, 'seis.period');
    if (isNum(I0.TB) && I0.TB > 0) rec.add('Period by Method B', S`T = min(TB, ${cap} TA)`, S`T = min(${v(I0.TB, 'time_s')}, ${cap} × ${v(TA, 'time_s')})`, S`T = ${u(T, 'time_s')}`, 'seis.periodB');
    const V8 = Cv * I * W / (R * T), V9 = SE.base.cap * Ca * I * W / R, V10 = SE.base.min * Ca * I * W, V11 = z4 ? SE.base.min4 * Z * Nv * I * W / R : 0;
    V = Math.min(V8, V9); governs = V8 <= V9 ? 'Eq. 208-8' : 'Eq. 208-9';
    if (V10 > V) { V = V10; governs = 'Eq. 208-10'; }
    if (V11 > V) { V = V11; governs = 'Eq. 208-11'; }
    Object.assign(vals, { V8, V9, V10, V11, V, VW: V / W });
    rec.add('Design base shear', S`V = Cv I W / (R T)`, S`V = ${Cv} × ${I} × ${v(W, 'force')} / (${R} × ${v(T, 'time_s')})`, S`V = ${u(V8, 'force')}`, 'seis.V');
    rec.add('Upper limit', S`V ≤ ${SE.base.cap} Ca I W / R`, S`${SE.base.cap} × ${Ca} × ${I} × ${v(W, 'force')} / ${R}`, S`= ${u(V9, 'force')}`, 'seis.Vmax');
    rec.add('Lower limit', S`V ≥ ${SE.base.min} Ca I W`, S`${SE.base.min} × ${Ca} × ${I} × ${v(W, 'force')}`, S`= ${u(V10, 'force')}`, 'seis.Vmin');
    if (z4) rec.add('Lower limit in Zone 4', S`V ≥ ${SE.base.min4} Z Nv I W / R`, S`${SE.base.min4} × ${Z} × ${Nv} × ${I} × ${v(W, 'force')} / ${R}`, S`= ${u(V11, 'force')}`, 'seis.Vmin4');
    rec.add('Governing base shear', S`V = max(min(Eq. 208-8, Eq. 208-9), Eq. 208-10${z4 ? ', Eq. 208-11' : ''})`, null, S`V = ${u(V, 'force')} (${governs} governs); V/W = ${V / W}`, governs === 'Eq. 208-8' ? 'seis.V' : governs === 'Eq. 208-9' ? 'seis.Vmax' : governs === 'Eq. 208-10' ? 'seis.Vmin' : 'seis.Vmin4');
    const Ft = T <= SE.Ft.T0 ? 0 : Math.min(SE.Ft.coef * T * V, SE.Ft.max * V);
    vals.Ft = Ft;
    rec.add('Concentrated force at the top', S`Ft = ${SE.Ft.coef} T V ≤ ${SE.Ft.max} V; Ft = 0 when T ≤ ${SE.Ft.T0} s`, T <= SE.Ft.T0 ? null : S`Ft = ${SE.Ft.coef} × ${v(T, 'time_s')} × ${v(V, 'force')}`, S`Ft = ${u(Ft, 'force')}`, 'seis.Ft');
    if (mode === 'distribution') {
      const sw = levels.reduce((t, r) => t + r.w * r.h, 0);
      vals.levels = levels.map((r) => ({ h: r.h, w: r.w, F: (V - Ft) * r.w * r.h / sw }));
      vals.levels[vals.levels.length - 1].Ftotal = 0;
      let acc = Ft;
      for (let i = vals.levels.length - 1; i >= 0; i--) { acc += vals.levels[i].F; vals.levels[i].V = acc; vals.levels[i].Ftotal = vals.levels[i].F + (i === vals.levels.length - 1 ? Ft : 0); }
      vals.Mot = vals.levels.reduce((t, r) => t + r.F * r.h, 0) + Ft * hn;
      rec.add('Vertical distribution', S`Fx = (V − Ft) wx hx / Σ wi hi`, S`Σ wi hi = ${v(sw, 'moment')}`, S`F at the top level = ${u(vals.levels[vals.levels.length - 1].F, 'force')} + Ft`, 'seis.Fx');
      rec.add('Overturning moment at the base', S`Mot = Σ Fx hx + Ft hn`, null, S`Mot = ${u(vals.Mot, 'moment')}`, 'seis.Fx');
    } else vals.Mot = null;
    vals.Ts = Cv / (SE.base.cap * Ca); vals.To = SE.spectrum.To * vals.Ts;
  }
  vals.governs = governs;

  // ---------------------------------------------------------------- redundancy and load effects (208.6.1)
  let rho = 1, rhoRaw = null;
  if (z4 && I0.rmax > 0 && I0.AB > 0) {
    rhoRaw = SE.rho.a - SE.rho.b / (I0.rmax * Math.sqrt(I0.AB));
    rho = Math.min(Math.max(rhoRaw, SE.rho.min), SE.rho.max);
    const dual = /^Dual/.test(sys.system);
    if (SMRF.includes(sys.id) && rho > SE.rho.smrf) {
      rho = SE.rho.smrf;
      out.warnings.push('ρ = ' + fmt(rhoRaw) + ' exceeds ' + SE.rho.smrf + ' for a special moment-resisting frame: add bays of frame until ρ ≤ ' + SE.rho.smrf + ' (208.6.1); ' + SE.rho.smrf + ' is used.');
    }
    if (dual) rho = Math.max(SE.rho.min, SE.rho.dual * rho);
    rec.add('Redundancy factor', S`ρ = ${SE.rho.a} − ${SE.rho.b} / (rmax √AB), ${SE.rho.min} ≤ ρ ≤ ${SE.rho.max}`, S`ρ = ${SE.rho.a} − ${SE.rho.b} / (${I0.rmax} × √${v(I0.AB, 'area_m2')})`,
      S`ρ = ${rhoRaw}; used ρ = ${rho}`, 'seis.rho', dual ? 'Dual system: ' + SE.rho.dual + ' × the computed value, not less than ' + SE.rho.min + '.' : '');
  } else rec.add('Redundancy factor', S`ρ = ${SE.rho.min}`, null, null, 'seis.rho', zone === 2 ? 'Zone 2: ρ = 1.0.' : 'rmax not given: ρ = 1.0.');
  const D = isNum(I0.D) ? I0.D : 0, Eh = V, rhoEh = rho * Eh, Ev = SE.Ev * Ca * I * D, E = rhoEh + Ev, Em = Omega0 * Eh;
  Object.assign(vals, { Eh, rhoRaw, rho, rhoEh, Ev, E, Em });
  rec.add('Earthquake load effect', S`E = ρ Eh + Ev, Ev = ${SE.Ev} Ca I D`, S`E = ${rho} × ${v(Eh, 'force')} + ${SE.Ev} × ${Ca} × ${I} × ${v(D, 'force')}`, S`E = ${u(E, 'force')}`, 'seis.E', 'Ev = 0 for allowable stress design. Eh is taken as the base shear V.');
  if (!simplified) rec.add('Estimated maximum earthquake force', S`Em = Ω0 Eh`, S`Em = ${Omega0} × ${v(Eh, 'force')}`, S`Em = ${u(Em, 'force')}`, 'seis.Em');

  // ---------------------------------------------------------------- results
  // The verdict carries which equation governs V (information, pass null) unless an applicability check
  // fails (a system not permitted or above its height limit): then the result is NOT ADEQUATE.
  const ng = out.checks.filter((c) => c.status === 'NG');
  out.verdict = { pass: ng.length ? false : null, governing: ng.length ? ng[0].name : governs, dc: ng.length ? ng[0].dc : vals.VW };
  ng.forEach((c) => out.warnings.push(c.name + ': ' + (c.capacity.value === 'not permitted in Zone ' + zone ? sys.name + ' is not permitted in Zone ' + zone + '.' : 'hn exceeds the limit of the system.') + ' Choose another system.'));
  out.results = [res('Design base shear V (' + governs + ')', V, 'force'), res('V / W', V / W), res('Ca', Ca), res('Cv', Cv)];
  if (!simplified) out.results.push(res('Period T', T, 'time_s'), res('Ft', vals.Ft, 'force'));
  out.results.push(res('ρ', rho), res('E = ρEh + Ev', E, 'force'));
  if (!simplified) out.results.push(res('Em = Ω0 Eh', Em, 'force'));
  if (vals.Mot != null) out.results.push(res('Overturning moment Mot', vals.Mot, 'moment'));
  out.notes.push('Accidental torsion: a ' + SE.accidental * 100 + '% eccentricity of the plan dimension, amplified by Ax ≤ ' + SE.amplifyMax + ' for torsional irregularity (208.5.1.3, 208.5.1.4).');
  const tables = [];
  if (vals.levels) tables.push({ title: 'Forces at the levels', head: ['Level', 'h', 'w', 'Fx', 'Storey shear'], rows: vals.levels.map((r, i) => ({ cells: [String(i + 1), u(r.h, 'length_m'), u(r.w, 'force'), u(r.Ftotal, 'force'), u(r.V, 'force')] })),
    note: vals.Ft ? 'The top level carries Fx + Ft.' : '' });
  out.diagram = { mode, Z, Ca, Cv, T, TA, Ts: vals.Ts, To: vals.To, V, V8: vals.V8, V9: vals.V9, V10: vals.V10, V11: vals.V11, governs, W, I, R, levels: vals.levels || null, Ft: vals.Ft, hn,
    tables, chips: [['Zone ' + zone + ', ' + soil], S`R = ${R}`, [governs + ' governs']] };
  out.send.push({ to: 'shared/load-combos', mode: 'strength', label: 'Use E = ρEh + Ev as E in Load combinations', values: { quantity: 'force', E } });
  if (!simplified) out.send.push({ to: 'shared/load-combos', mode: 'special', label: 'Use Em in the special seismic combinations', values: { quantity: 'force', Em } });
  out.steps = rec.steps;
  return { vals, result: out };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }
