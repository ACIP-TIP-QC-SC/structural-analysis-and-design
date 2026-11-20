// Wind loads, NSCP 2015 Sec. 207A and 207B Part 1 (directional procedure; ASCE 7-10 Ch. 26 and 27 in
// metric): velocity pressure, wall and roof pressures of rigid enclosed and partially enclosed buildings,
// and storey forces of the main wind-force resisting system. Pure: no DOM, no rounding. Every factor,
// table and clause comes from ctx.edition.wind.
// Units: V km/h, lengths m, pressures kPa, forces kN, moments kN·m.
import { S, v, u, recorder, blank, fail, res, check } from '../../core/steps.js';
import { rad } from './angles.js';
import { fmt } from '../../core/format.js';

const isNum = (x) => typeof x === 'number' && isFinite(x);

// Linear interpolation, clamped at both ends.
export function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  for (let i = 0; i < n; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) return ys[i] + (x - xs[i]) / (xs[i + 1] - xs[i]) * (ys[i + 1] - ys[i]);
  }
  return ys[n];
}

// Kz by Table 207B.3-1 (interpolated, clamped) and by the formula of its note.
export function kzTable(W, z, exp) { return interp(z, W.KzTable.z, W.KzTable[exp]); }
export function kzFormula(W, z, exp) {
  const t = W.terrain[exp];
  return W.KzFormula.coef * Math.pow(Math.max(z, W.KzFormula.zmin) / t.zg, 2 / t.alpha);
}

// Topographic factor (207A.8, Fig. 207A.8-1). Returns { on, K1, K2, Lh, gamma, why, kzt(z) -> { K3, Kzt } }.
export function topography(W, I) {
  const shape = I.topo || 'none', none = { on: false, K1: null, K2: null, kzt: () => ({ K3: null, Kzt: 1 }) };
  if (shape === 'none' || !W.topo[shape]) return Object.assign(none, { why: 'No hill, ridge or escarpment: Kzt = 1.0.' });
  const T = W.topo[shape], H = I.H, Lh0 = I.Lh, exp = I.exposure;
  if (!(H > 0) || !(Lh0 > 0)) return Object.assign(none, { why: 'Hill height H and half-length Lh are needed for Kzt.', bad: true });
  let HL = H / Lh0, Lh = Lh0;
  if (HL < W.topo.HLmin || H < W.topo.Hmin[exp]) {
    return Object.assign(none, { why: 'H/Lh = ' + fmt(HL) + ' or H = ' + fmt(H) + ' m is below the 207A.8.1 thresholds (H/Lh ≥ ' + W.topo.HLmin + ', H ≥ ' + W.topo.Hmin[exp] + ' m for Exposure ' + exp + '): Kzt = 1.0.' });
  }
  const capped = HL > W.topo.HLmax;
  if (capped) { HL = W.topo.HLmax; Lh = 2 * H; }
  const K1 = T.k1[exp] * HL;
  const mu = I.side === 'downwind' ? T.muDown : T.muUp;
  const K2 = Math.max(0, 1 - Math.abs(I.x || 0) / (mu * Lh));
  return {
    on: true, shape, K1, K2, HL, Lh, mu, gamma: T.gamma, capped,
    kzt: (z) => { const K3 = Math.exp(-T.gamma * z / Lh); return { K3, Kzt: Math.pow(1 + K1 * K2 * K3, 2) }; }
  };
}

const qzOf = (W, Kz, Kzt, Kd, Vms) => W.rho * Kz * Kzt * Kd * Vms * Vms / 1000;   // kPa

// One row of Fig. 207B.4-1 at angle th: blank cells are 0.0, 'th' cells are 0.01 theta.
function rowAt(W, cells, th) { return interp(th, W.CpRoof.theta, cells.map((c) => (c === 'th' ? th / 100 : c == null ? 0 : c))); }
export function roofWindward(W, th, hL) {
  const R = W.CpRoof;
  if (th > R.steep.theta) return { CpA: null, CpB: R.steep.Cp };
  const A = interp(hL, R.hL, R.windA.map((cells) => rowAt(W, cells, th)));
  const B = interp(hL, R.hL, R.windB.map((cells) => rowAt(W, cells, th)));
  return { CpA: th >= R.theta[R.theta.length - 1] ? null : A, CpB: B };
}
export function roofLeeward(W, th, hL) {
  const R = W.CpRoof;
  return interp(hL, R.hL, R.lee.map((row) => interp(th, R.leeTheta, row)));
}
// Zones of a flat roof (or any roof with the wind parallel to the ridge) from the windward edge.
export function flatZones(W, h, L, hL, B) {
  const F = W.CpRoof.flat, out = [];
  for (let i = 0; i < F.edges.length; i++) {
    const x1 = F.edges[i] * h, x2 = i + 1 < F.edges.length ? Math.min(F.edges[i + 1] * h, L) : L;
    if (x1 >= L) break;
    const area = (x2 - x1) * B;
    const factor = i === 0 ? interp(area, F.reduce.area, F.reduce.factor) : null;
    const hi = i === 0 ? F.high[0] * factor : F.high[i];
    out.push({ x1, x2, area, factor, Cp: interp(hL, [W.CpRoof.hL[1], W.CpRoof.hL[2]], [F.low[i], hi]), CpAlt: F.second });
  }
  return out;
}

const levelsOf = (list, key) => (Array.isArray(list) ? list.map((r) => (typeof r === 'number' ? r : r && r[key])) : []);

function run(input, ctx) {
  const ed = ctx.edition, W = ed.wind, mode = input.mode || 'velocity';
  const I = Object.assign({ exposure: 'C', Kd: W.Kd[0].value, kzMethod: 'table', topo: 'none', side: 'downwind', occupancy: 'IV',
    roof: 'flat', theta: 0, direction: 'normal', enclosure: 'enclosed', G: W.G }, input);
  ['exposure', 'kzMethod', 'topo', 'side', 'occupancy', 'roof', 'direction', 'enclosure'].forEach((k) => { if (input[k] == null || input[k] === '') I[k] = Object.assign({ exposure: 'C', kzMethod: 'table', topo: 'none', side: 'downwind', occupancy: 'IV', roof: 'flat', direction: 'normal', enclosure: 'enclosed' })[k]; });
  if (!isNum(I.Kd)) I.Kd = W.Kd[0].value;
  if (!isNum(I.G)) I.G = W.G;
  const errs = [];
  if (!(I.V > 0)) errs.push('Enter the basic wind speed V.');
  if (!W.terrain[I.exposure]) errs.push('Choose Exposure B, C or D.');
  const topo = topography(W, I);
  if (topo.bad) errs.push(topo.why);
  if (mode !== 'velocity') {
    if (I.enclosure === 'open') errs.push('Open buildings use 207B Part 1 figures not built here.');
    if (!(I.B > 0) || !(I.L > 0)) errs.push('Enter the building width B and length L.');
    if (I.roof === 'gable' && !(isNum(I.theta) && I.theta >= 0)) errs.push('Enter the roof slope θ.');
  }
  const zs = levelsOf(mode === 'velocity' ? I.heights : I.levels, 'z');
  if (!zs.length) errs.push(mode === 'velocity' ? 'Add at least one height z.' : 'Add at least one level.');
  if (zs.some((z) => !(z > 0))) errs.push('Every height must be a number above zero.');
  if (mode === 'storeys' && zs.some((z, i) => i && !(z > zs[i - 1]))) errs.push('List the floor levels from the lowest to the highest.');
  if (mode === 'pressures' && !(I.eave > 0)) errs.push('Enter the eave height.');
  if (errs.length) return { vals: { error: true }, result: fail(errs) };

  const out = blank(), rec = recorder(), vals = {};
  const Vms = I.V / 3.6;
  const Kz = (z) => (I.kzMethod === 'formula' ? kzFormula(W, z, I.exposure) : kzTable(W, z, I.exposure));
  const tz = W.terrain[I.exposure];
  const qAt = (z) => { const k = Kz(z), t = topo.kzt(z); return { z, Kz: k, KzTable: kzTable(W, z, I.exposure), KzFormula: kzFormula(W, z, I.exposure), K3: t.K3, Kzt: t.Kzt, qz: qzOf(W, k, t.Kzt, I.Kd, Vms) }; };
  vals.Vms = Vms; vals.K1 = topo.on ? topo.K1 : null; vals.K2 = topo.on ? topo.K2 : null;
  const zmax = W.KzTable.z[W.KzTable.z.length - 1];
  if (I.kzMethod !== 'formula' && zs.some((z) => z > zmax)) out.warnings.push('A height is above ' + zmax + ' m, the top of Table 207B.3-1: Kz is held at the ' + zmax + ' m value. Use the formula for taller buildings.');

  // ---- common steps
  const figure = { I: 'Fig. 207A.5-1C (Occupancy I)', II: 'Fig. 207A.5-1B (Occupancy II)' }[I.occupancy] || 'Fig. 207A.5-1A (Occupancy III, IV and V)';
  rec.add('Basic wind speed', S`V from ${figure}; V in m/s = V/3.6`, S`V = ${u(I.V, 'speed_kph')} = ${v(I.V)}/3.6`, S`V = ${Vms} m/s`, 'wind.speed', 'NSCP 2015 has no province table: read V from the map for the occupancy category.');
  rec.add('Exposure category', S`Exposure ${I.exposure}: α = ${tz.alpha}, zg = ${u(tz.zg, 'length_m')}`, null, null, 'wind.exposure',
    'B: urban or suburban terrain upwind for 450 m or 20h; D: flat unobstructed terrain or water for 1500 m or 20h; C otherwise.');
  const kdRow = W.Kd.find((k) => k.value === I.Kd);
  rec.add('Directionality factor', S`Kd = ${I.Kd}`, null, null, 'wind.Kd', kdRow ? kdRow.label + '.' : '');
  if (topo.on) {
    rec.add('Topographic factor', S`Kzt = (1 + K1 K2 K3)²; K1 = (K1/(H/Lh)) × H/Lh; K2 = 1 − |x|/(μ Lh); K3 = e^(−γ z/Lh)`,
      S`H/Lh = ${topo.HL}${topo.capped ? ' (capped; Lh = 2H = ' + topo.Lh + ' m)' : ''}; μ = ${topo.mu}; γ = ${topo.gamma}`,
      S`K1 = ${topo.K1}; K2 = ${topo.K2}`, 'wind.KztFig', 'K3 and Kzt are computed at each height below.');
  } else rec.add('Topographic factor', S`Kzt = 1.0`, null, null, 'wind.Kzt', topo.why);
  const kzStep = (z, k) => rec.add('Velocity pressure exposure coefficient at z = ' + z + ' m', I.kzMethod === 'formula' ? S`Kz = ${W.KzFormula.coef} (z/zg)^(2/α), z ≥ ${W.KzFormula.zmin} m` : S`Kz from Table 207B.3-1 (interpolated)`,
    I.kzMethod === 'formula' ? S`Kz = ${W.KzFormula.coef} (${v(Math.max(z, W.KzFormula.zmin), 'length_m')}/${v(tz.zg, 'length_m')})^(2/${tz.alpha})` : null, S`Kz = ${k}`, I.kzMethod === 'formula' ? 'wind.terrain' : 'wind.Kz');
  const qStep = (title, r) => rec.add(title, S`qz = ${W.rho} Kz Kzt Kd V² (N/m²)`, S`qz = ${W.rho} × ${r.Kz} × ${r.Kzt} × ${I.Kd} × ${Vms}² / 1000`, S`qz = ${u(r.qz, 'pressure_lo')}`, 'wind.qz');

  if (mode === 'velocity') {
    const rows = zs.map((z) => qAt(z));
    vals.rows = rows.map((r) => ({ z: r.z, Kz: r.Kz, KzTable: r.KzTable, KzFormula: r.KzFormula, K3: r.K3, Kzt: r.Kzt, qz: r.qz }));
    rows.forEach((r) => {
      rec.add('Kz at z = ' + r.z + ' m, by the table and by the formula', S`Kz (Table 207B.3-1) = ${r.KzTable}; Kz (formula) = ${W.KzFormula.coef} (${v(Math.max(r.z, W.KzFormula.zmin), 'length_m')}/${v(tz.zg, 'length_m')})^(2/${tz.alpha}) = ${r.KzFormula}`, null,
        S`Kz used (${I.kzMethod === 'formula' ? 'formula' : 'table'}) = ${r.Kz}${topo.on ? ['; K3 = ', v(r.K3), '; Kzt = ', v(r.Kzt)] : ''}`, I.kzMethod === 'formula' ? 'wind.terrain' : 'wind.Kz');
      qStep('Velocity pressure at z = ' + r.z + ' m', r);
    });
    const top = rows.reduce((a, b) => (b.z > a.z ? b : a));
    out.results = [res('Basic wind speed V', I.V, 'speed_kph'), res('V in m/s', Vms), res('Kz at ' + top.z + ' m', top.Kz), res('qz at ' + top.z + ' m', top.qz, 'pressure_lo')];
    if (topo.on) out.results.push(res('K1', topo.K1), res('K2', topo.K2));
    out.diagram = { mode, rows: vals.rows, topo: topo.on ? { shape: topo.shape, H: I.H, Lh: I.Lh, x: I.x || 0, side: I.side } : null,
      tables: [{ title: 'Velocity pressure', head: ['z', 'Kz (table)', 'Kz (formula)', 'Kzt', 'qz'], rows: rows.map((r) => ({ cells: [u(r.z, 'length_m'), v(r.KzTable), v(r.KzFormula), v(r.Kzt), u(r.qz, 'pressure_lo')] })) }],
      chips: [['Exposure ' + I.exposure], S`Kd = ${I.Kd}`] };
    out.steps = rec.steps;
    return { vals, result: out };
  }

  // ---- building geometry (pressures and storeys)
  const B = I.B, L = I.L, gable = I.roof === 'gable', th = gable ? I.theta : 0;
  const rise = gable ? (I.direction === 'parallel' ? B / 2 : L / 2) * Math.tan(rad(th)) : 0;
  const eave = mode === 'storeys' && !(I.eave > 0) ? zs[zs.length - 1] : I.eave;
  const h = th <= W.CpRoof.theta[0] ? eave : eave + rise / 2;
  const hq = qAt(h), qh = hq.qz, G = I.G, GCpi = W.GCpi[I.enclosure];
  const LB = L / B, hL = h / L;
  Object.assign(vals, { Kh: hq.Kz, qh, h, rise, LB, hL });
  rec.add('Mean roof height', gable && th > W.CpRoof.theta[0] ? S`h = eave + rise/2; rise = (${I.direction === 'parallel' ? 'B' : 'L'}/2) tan θ` : S`h = eave (θ ≤ ${W.CpRoof.theta[0]}°)`,
    gable && th > W.CpRoof.theta[0] ? S`rise = ${v((I.direction === 'parallel' ? B : L) / 2, 'length_m')} × tan ${th}° = ${u(rise, 'length_m')}` : null, S`h = ${u(h, 'length_m')}; L/B = ${LB}; h/L = ${hL}`, 'wind.Cp');
  kzStep(h, hq.Kz);
  qStep('Velocity pressure at the mean roof height', hq);
  rec.add('Gust-effect factor', S`G = ${G}`, null, null, 'wind.G', 'Rigid building (207A.9.1).');
  rec.add('Internal pressure coefficient', S`GCpi = ±${GCpi}`, null, null, 'wind.GCpi', I.enclosure === 'partial' ? 'Partially enclosed building.' : 'Enclosed building.');
  const pp = (q, Cp) => ({ pPos: q * G * Cp - qh * GCpi, pNeg: q * G * Cp + qh * GCpi });
  const CpLee = interp(LB, W.CpWall.leeward.LB, W.CpWall.leeward.Cp), CpWW = W.CpWall.windward, CpSide = W.CpWall.side;

  if (mode === 'pressures') {
    const tab = [];
    const ww = zs.map((z) => { const r = qAt(z); return Object.assign({ z, Kz: r.Kz, qz: r.qz }, pp(r.qz, CpWW)); });
    vals.windward = ww;
    vals.leeward = Object.assign({ Cp: CpLee }, pp(qh, CpLee));
    vals.side = Object.assign({ Cp: CpSide }, pp(qh, CpSide));
    rec.add('External pressure coefficients, walls', S`windward Cp = ${CpWW} (qz); leeward Cp from L/B = ${LB}: ${CpLee} (qh); side walls Cp = ${CpSide} (qh)`, null, null, 'wind.Cp');
    ww.forEach((r) => tab.push({ cells: ['Windward wall at ' + r.z + ' m', v(CpWW), u(r.qz, 'pressure_lo'), u(r.pPos, 'pressure_lo'), u(r.pNeg, 'pressure_lo')] }));
    tab.push({ cells: ['Leeward wall', v(CpLee), u(qh, 'pressure_lo'), u(vals.leeward.pPos, 'pressure_lo'), u(vals.leeward.pNeg, 'pressure_lo')] });
    tab.push({ cells: ['Side walls', v(CpSide), u(qh, 'pressure_lo'), u(vals.side.pPos, 'pressure_lo'), u(vals.side.pNeg, 'pressure_lo')] });
    const zonesMode = !gable || th < W.CpRoof.theta[0] || I.direction === 'parallel';
    if (zonesMode) {
      const zones = flatZones(W, h, I.direction === 'parallel' && gable ? L : L, hL, B);
      vals.roof = zones.map((z) => Object.assign({ x1: z.x1, x2: z.x2, Cp: z.Cp }, pp(qh, z.Cp), { CpAlt: z.CpAlt, pAltPos: qh * G * z.CpAlt - qh * GCpi, pAltNeg: qh * G * z.CpAlt + qh * GCpi }));
      zones.forEach((z, i) => rec.add('Roof zone ' + (i + 1) + ' (' + z.x1 + ' to ' + z.x2 + ' m from the windward edge)', i === 0 ? S`Cp = interpolate in h/L between ${W.CpRoof.flat.low[0]} (h/L ≤ ${W.CpRoof.hL[1]}) and ${W.CpRoof.flat.high[0]} × R (h/L ≥ ${W.CpRoof.hL[2]}); R from the zone area` : S`Cp = interpolate in h/L between ${W.CpRoof.flat.low[i]} and ${W.CpRoof.flat.high[i]}`,
        i === 0 ? S`zone area = ${u(z.area, 'area_m2')}; R = ${z.factor}` : null, S`Cp = ${z.Cp}, or ${z.CpAlt}`, 'wind.Cp'));
      vals.roof.forEach((r, i) => {
        tab.push({ cells: ['Roof zone ' + (i + 1) + ' (' + r.x1 + ' to ' + r.x2 + ' m)', v(r.Cp), u(qh, 'pressure_lo'), u(r.pPos, 'pressure_lo'), u(r.pNeg, 'pressure_lo')] });
        tab.push({ cells: ['Roof zone ' + (i + 1) + ', second value', v(r.CpAlt), u(qh, 'pressure_lo'), u(r.pAltPos, 'pressure_lo'), u(r.pAltNeg, 'pressure_lo')] });
      });
    } else {
      const wr = roofWindward(W, th, hL), lr = roofLeeward(W, th, hL);
      vals.roofWW = { CpA: wr.CpA, CpB: wr.CpB };
      if (wr.CpA != null) Object.assign(vals.roofWW, { pAPos: qh * G * wr.CpA - qh * GCpi, pANeg: qh * G * wr.CpA + qh * GCpi });
      Object.assign(vals.roofWW, { pBPos: qh * G * wr.CpB - qh * GCpi, pBNeg: qh * G * wr.CpB + qh * GCpi });
      vals.roofLW = Object.assign({ Cp: lr }, pp(qh, lr));
      rec.add('Roof pressure coefficients, wind normal to the ridge', S`Fig. 207B.4-1 at θ = ${th}° and h/L = ${hL} (interpolated in θ, then in h/L)`, null,
        S`windward roof Cp = ${wr.CpA == null ? 'none' : v(wr.CpA)} or ${wr.CpB}; leeward roof Cp = ${lr}`, 'wind.Cp', wr.CpA == null ? 'At θ ≥ 60° only the positive value 0.01θ applies.' : 'Both windward values are checked.');
      if (wr.CpA != null) tab.push({ cells: ['Windward roof, first value', v(wr.CpA), u(qh, 'pressure_lo'), u(vals.roofWW.pAPos, 'pressure_lo'), u(vals.roofWW.pANeg, 'pressure_lo')] });
      tab.push({ cells: ['Windward roof, second value', v(wr.CpB), u(qh, 'pressure_lo'), u(vals.roofWW.pBPos, 'pressure_lo'), u(vals.roofWW.pBNeg, 'pressure_lo')] });
      tab.push({ cells: ['Leeward roof', v(lr), u(qh, 'pressure_lo'), u(vals.roofLW.pPos, 'pressure_lo'), u(vals.roofLW.pNeg, 'pressure_lo')] });
    }
    rec.add('Design wind pressure', S`p = q G Cp − qi (GCpi), qi = qh, with +GCpi and −GCpi`,
      S`windward wall at ${ww[0].z} m: p = ${v(ww[0].qz, 'pressure_lo')} × ${G} × ${CpWW} ∓ ${v(qh, 'pressure_lo')} × ${GCpi}`,
      S`p = ${u(ww[0].pPos, 'pressure_lo')} (+GCpi) or ${u(ww[0].pNeg, 'pressure_lo')} (−GCpi)`, 'wind.p', 'Positive pressure acts toward the surface. Every surface is listed in the table.');
    out.results = [res('Mean roof height h', h, 'length_m'), res('Kh', hq.Kz), res('qh', qh, 'pressure_lo'), res('GCpi', GCpi), res('Leeward wall Cp', CpLee),
      res('Windward wall p at ' + ww[ww.length - 1].z + ' m (+GCpi)', ww[ww.length - 1].pPos, 'pressure_lo'), res('Leeward wall p (+GCpi)', vals.leeward.pPos, 'pressure_lo')];
    out.notes.push('Main wind-force resisting system of a rigid building (G = ' + G + '). Components and cladding, the envelope procedure (207C) and flexible buildings are not covered.');
    out.diagram = { mode, B, L, h, eave, rise, theta: th, gable, direction: I.direction, zonesMode, qh, GCpi, windward: vals.windward, leeward: vals.leeward, side: vals.side,
      roof: vals.roof || null, roofWW: vals.roofWW || null, roofLW: vals.roofLW || null,
      tables: [{ title: 'Design wind pressures', head: ['Surface', 'Cp', 'q', 'p (+GCpi)', 'p (−GCpi)'], rows: tab, note: 'p = q G Cp − qh (GCpi). Positive pressure acts toward the surface.' }],
      chips: [['Exposure ' + I.exposure], S`qh = ${u(qh, 'pressure_lo')}`, [I.enclosure === 'partial' ? 'Partially enclosed' : 'Enclosed']] };
    out.steps = rec.steps;
    return { vals, result: out };
  }

  // ---- storeys (main wind-force resisting system, Load Case 1 and 2)
  const storeys = zs.map((z, i) => {
    const below = z - (i ? zs[i - 1] : 0), above = i + 1 < zs.length ? zs[i + 1] - z : 0, trib = below / 2 + above / 2;
    const r = qAt(z), pw = r.qz * G * CpWW, pl = Math.abs(qh * G * CpLee), F = (pw + pl) * B * trib;
    return { z, trib, qz: r.qz, pw, pl, F, MT: W.cases.case2 * F * W.cases.ecc * B };
  });
  const Vbase = storeys.reduce((t, s) => t + s.F, 0), Mbase = storeys.reduce((t, s) => t + s.F * s.z, 0);
  // 207B.4.7: 0.77 kPa on the wall area and 0.38 kPa on the roof area projected on a vertical plane normal
  // to the wind. Wind normal to the ridge: walls B × eave, roof B × rise. Wind parallel to the ridge: the
  // gable-end wall B × eave + B × rise/2 (its triangle), and the roof adds no projected area.
  const parallel = gable && I.direction === 'parallel';
  const wallArea = B * eave + (parallel ? B * rise / 2 : 0), roofArea = parallel ? 0 : B * rise;
  const Fmin = W.minimum.wall * wallArea + W.minimum.roof * roofArea;
  vals.storeys = storeys.map((s) => ({ z: s.z, trib: s.trib, F: s.F, MT: s.MT }));
  Object.assign(vals, { Vbase, Mbase, Vcase2: W.cases.case2 * Vbase, Fmin });
  rec.add('Net wall pressure on the windward and leeward walls', S`pw = qz G ${CpWW}; pl = qh G Cp(leeward) = ${v(qh, 'pressure_lo')} × ${G} × ${CpLee}; internal pressures cancel`, null,
    S`|pl| = ${u(storeys[0].pl, 'pressure_lo')}`, 'wind.p');
  storeys.forEach((s) => rec.add('Storey force at z = ' + s.z + ' m', S`F = (pw + |pl|) B × tributary height`, S`F = (${v(s.pw, 'pressure_lo')} + ${v(s.pl, 'pressure_lo')}) × ${v(B, 'length_m')} × ${v(s.trib, 'length_m')}`, S`F = ${u(s.F, 'force')}`, 'wind.p'));
  rec.add('Base shear and overturning moment', S`Vbase = ΣF; Mbase = Σ F z`, null, S`Vbase = ${u(Vbase, 'force')}; Mbase = ${u(Mbase, 'moment')}`, 'wind.p');
  rec.add('Load Case 2', S`${W.cases.case2} of the forces with a torsion MT = ${W.cases.case2} F × ${W.cases.ecc} B at each level`, null,
    S`V (Case 2) = ${u(vals.Vcase2, 'force')}; MT at ${storeys[0].z} m = ${u(storeys[0].MT, 'moment')}`, 'wind.cases',
    'Cases 3 and 4 combine both directions at ' + W.cases.case2 + ' and ' + W.cases.case4 + ' of the forces; they are not computed here.');
  rec.add('Minimum design wind load', S`Fmin = ${W.minimum.wall} × wall area + ${W.minimum.roof} × projected roof area`, S`Fmin = ${W.minimum.wall} × ${v(wallArea, 'area_m2')} + ${W.minimum.roof} × ${v(roofArea, 'area_m2')}`,
    S`Fmin = ${u(Fmin, 'force')}`, 'wind.minimum', 'Wall area (' + (parallel ? 'gable-end wall, B × eave + B × rise/2' : 'B × eave') + ') times ' + W.minimum.wall + ' kPa plus the roof area projected on a vertical plane normal to the wind (' + (parallel ? 'none' : 'B × rise') + ') times ' + W.minimum.roof + ' kPa (207B.4.7).');
  out.checks = [check('Minimum wind load (207B.4.7)', ['Fmin', Fmin, 'force'], ['Vbase', Vbase, 'force'], Fmin / Vbase, 'wind.minimum')];
  // The minimum check is shown as a check row; like the other load modules there is no ADEQUATE verdict
  // (the presets expect none), and a failing minimum gives the warning below.
  out.verdict = null;
  if (Fmin > Vbase) out.warnings.push('The computed base shear is below the 207B.4.7 minimum: design for Fmin = ' + fmt(Fmin) + ' kN.');
  out.results = [res('Base shear Vbase', Vbase, 'force'), res('Overturning moment Mbase', Mbase, 'moment'), res('Case 2 base shear', vals.Vcase2, 'force'), res('Minimum Fmin', Fmin, 'force'), res('qh', qh, 'pressure_lo')];
  out.notes.push('Load Cases 3 and 4 (Fig. 207B.4-8) apply ' + W.cases.case2 + ' and ' + W.cases.case4 + ' of the forces in both directions together; check them with the same storey forces.');
  out.diagram = { mode, B, L, h, eave, rise, theta: th, gable, storeys: vals.storeys, Vbase, Mbase, ecc: W.cases.ecc,
    tables: [{ title: 'Storey forces (Load Case 1)', head: ['Level z', 'Tributary height', 'qz', 'F', 'MT (Case 2)'], rows: storeys.map((s) => ({ cells: [u(s.z, 'length_m'), u(s.trib, 'length_m'), u(s.qz, 'pressure_lo'), u(s.F, 'force'), u(s.MT, 'moment')] })) }],
    chips: [['Exposure ' + I.exposure], S`Vbase = ${u(Vbase, 'force')}`] };
  out.send.push({ to: 'shared/load-combos', mode: 'strength', label: 'Use the wind base shear as W in Load combinations', values: { quantity: 'force', W: Vbase } });
  out.steps = rec.steps;
  return { vals, result: out };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }
