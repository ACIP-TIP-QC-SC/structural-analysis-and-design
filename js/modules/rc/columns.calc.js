// RC columns: axial strength, interaction diagram, ties and spirals, slenderness of braced columns.
// Pure calculation. Units: mm, mm², MPa, kN, kN·m.
import { S, v, u, si, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, materialWarnings, roundUp } from './common.js';
import { axialCapacity, namedPoints, interactionCurve, capacityAtEccentricity, interactionPoint, layersFromBars, sectionTotals } from './rcSection.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force', M = 'moment';

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, mode = input.mode || 'axial';
  const vals = {}, out = blank(), rec = recorder();
  const env = { ed, vals, out, rec, wsd: ctx.method === 'WSD',
    stop: (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) }),
    done: () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; } };
  if (env.wsd && mode !== 'axial') return env.stop('WSD reference mode covers the Axial mode of this calculator only. Switch the design method to USD.');
  if (mode === 'interaction') return interaction(input, env);
  if (mode === 'ties') return ties(input, env);
  if (mode === 'slenderness') return slenderness(input, env);
  return axial(input, env);
}

// Gross area of the section. Circular sections are spirally reinforced.
function gross(input) { return input.shape === 'circular' ? Math.PI * input.D * input.D / 4 : input.b * input.h; }

function axial(input, env) {
  const { ed, vals, out, rec } = env, C = ed.concrete, K = C.column, spiral = input.shape === 'circular';
  const kind = spiral ? 'spiral' : 'tied', k = K.PnMax[kind], phi = spiral ? C.phi.spiral : C.phi.tied, s85 = C.sb;
  if (!positive(input, ['fc', 'fy'])) return env.stop('Concrete and steel strengths need positive numbers.');
  const { fc, fy } = input;
  out.warnings.push(...materialWarnings(fc, fy, ed));
  const capStep = (Ag, Ast) => {
    const Po = (s85 * fc * (Ag - Ast) + fy * Ast) / 1e3, PnMax = k * Po, pP = phi * PnMax;
    rec.add('Nominal axial strength', S`Po = ${s85} f'c (Ag − Ast) + fy Ast`, S`Po = ${s85} · ${v(fc, ST)} (${v(Ag, A)} − ${v(Ast, A)}) + ${v(fy, ST)} · ${v(Ast, A)}`, S`Po = ${u(Po, F)}`, 'col.Po');
    rec.add('Maximum axial strength', S`Pn,max = ${k} Po (${kind})`, S`Pn,max = ${k} · ${v(Po, F)}`, S`Pn,max = ${u(PnMax, F)}`, 'col.PnMax');
    rec.add('Design axial strength', S`φPn,max = φ · Pn,max,  φ = ${phi} (${kind})`, S`φPn,max = ${phi} · ${v(PnMax, F)}`, S`φPn,max = ${u(pP, F)}`, 'flexure.phi');
    return { Po, PnMax, pP };
  };

  if (input.task === 'design') {
    if (!positive(input, ['Pu', 'rho'])) return env.stop('Give the factored load Pu and the chosen steel ratio ρg.');
    const { Pu, rho } = input;
    if (rho < K.rhoMin || rho > K.rhoMax) out.warnings.push('ρg = ' + rho + ' is outside the code range ' + K.rhoMin + ' to ' + K.rhoMax + '.');
    const AgReq = Pu * 1e3 / (phi * k * (s85 * fc * (1 - rho) + fy * rho));
    const side = spiral ? Math.sqrt(4 * AgReq / Math.PI) : Math.sqrt(AgReq), use = roundUp(side, input.round > 0 ? input.round : 50);
    rec.add('Required gross area', S`Ag = Pu / (φ · ${k} · [${s85} f'c (1 − ρg) + fy ρg])`, S`Ag = ${v(Pu, F)} × 10³ / (${phi} · ${k} · [${s85} · ${v(fc, ST)} (1 − ${rho}) + ${v(fy, ST)} · ${rho}])`,
      spiral ? S`Ag = ${u(AgReq, A)};  D = √(4 Ag / π) = ${u(side, L)}, use ${u(use, L)}` : S`Ag = ${u(AgReq, A)};  side = √Ag = ${u(side, L)}, use ${u(use, L)}`, 'col.PnMax');
    const b = spiral ? use : (input.b > 0 ? input.b : use), h = spiral ? use : (input.h > 0 ? input.h : use);
    const Ag = spiral ? Math.PI * use * use / 4 : b * h;
    const AstReq = (Pu * 1e3 / (phi * k) - s85 * fc * Ag) / (fy - s85 * fc), AstMin = K.rhoMin * Ag, AstUse = Math.max(AstReq, AstMin);
    rec.add('Required steel for the chosen section', S`Ast = [Pu / (φ · ${k}) − ${s85} f'c Ag] / (fy − ${s85} f'c)`, spiral ? S`D = ${u(use, L)}, Ag = ${u(Ag, A)}` : S`b × h = ${v(b, L)} × ${u(h, L)}, Ag = ${u(Ag, A)}`,
      S`Ast = ${u(AstReq, A)};  minimum ${K.rhoMin} Ag = ${u(AstMin, A)};  use ${u(AstUse, A)}`, 'col.rho');
    if (AstUse > K.rhoMax * Ag) out.warnings.push('The required steel is above ' + K.rhoMax + ' Ag. Use a larger section.');
    const db = input.db > 0 ? input.db : 25, nMin = K.minBars[kind], n = Math.max(nMin, Math.ceil(AstUse / barArea(1, db) - 1e-9)), nUse = spiral ? n : n + (n % 2);
    rec.add('Bars', S`n = Ast / Ab, rounded up (at least ${nMin}${spiral ? '' : ', even for a symmetric layout'})`, S`n = ${v(AstUse, A)} / ${v(barArea(1, db), A)}`, S`Use ${nUse} - ${db} mm (Ast = ${u(barArea(nUse, db), A)})`, 'col.minBars');
    const cap = capStep(Ag, barArea(nUse, db));
    out.checks.push(check('Axial strength', ['Pu', Pu, F], ['φPn,max', cap.pP, F], Pu / cap.pP, 'col.PnMax'));
    Object.assign(vals, { AgReq, side, sideUse: use, Ag, AstReq, AstUse, nBars: nUse });
    out.results = [res('Ag required', AgReq, A), res(spiral ? 'D required' : 'Side required', side, L), res('Section used', spiral ? use : b, L), res('Ast required', AstReq, A), res('Bars', nUse + ' - ' + db + ' mm', 'text'), res('φPn,max', cap.pP, F)];
    out.diagram = { kind: 'axial', shape: input.shape, b, h, D: use, n: nUse, db, chips: [spiral ? S`D = ${u(use, L)}` : S`${v(b, L)} × ${u(h, L)}`, S`${nUse} - ${db} mm bars`] };
    return env.done();
  }

  const need = spiral ? ['D', 'n', 'db'] : ['b', 'h', 'n', 'db'];
  if (!positive(input, need)) return env.stop('Give the section size and the bars.');
  const Ag = gross(input), Ast = barArea(input.n, input.db), rhoG = Ast / Ag;
  if (Ast >= Ag) return env.stop('The bars take up the whole section.');
  rec.add('Areas', spiral ? S`Ag = π D² / 4;  Ast = n π db² / 4` : S`Ag = b h;  Ast = n π db² / 4`, spiral ? S`Ag = π (${v(input.D, L)})² / 4;  Ast = ${input.n} · π (${v(input.db, L)})² / 4` : S`Ag = ${v(input.b, L)} · ${v(input.h, L)};  Ast = ${input.n} · π (${v(input.db, L)})² / 4`,
    S`Ag = ${u(Ag, A)},  Ast = ${u(Ast, A)},  ρg = ${rhoG}`, 'basic.barArea');
  const cap = capStep(Ag, Ast), allow = ed.wsd.columnAllow * cap.PnMax;
  rec.add('Allowable load, alternate design method (reference)', S`P allowable = ${ed.wsd.columnAllow} Pn,max  (φ = 1)`, S`${ed.wsd.columnAllow} · ${v(cap.PnMax, F)}`, S`P allowable = ${u(allow, F)}`, 'col.wsd');
  rec.add('Steel ratio and number of bars', S`${K.rhoMin} ≤ ρg ≤ ${K.rhoMax};  at least ${K.minBars[kind]} bars (${kind})`, S`ρg = ${rhoG};  n = ${input.n}`, [rhoG >= K.rhoMin && rhoG <= K.rhoMax ? 'ρg is within the limits.' : 'ρg is outside the limits.'], 'col.rho');
  const P = input.Pu;
  if (P > 0) {
    if (env.wsd) out.checks.push(check('Axial load (allowable)', ['P', P, F], ['P allowable', allow, F], P / allow, 'col.wsd'));
    else out.checks.push(check('Axial strength', ['Pu', P, F], ['φPn,max', cap.pP, F], P / cap.pP, 'col.PnMax'));
  } else out.notes.push('No load was given, so the axial strength is not checked.');
  out.checks.push(check('Steel ratio', ['ρg', rhoG, 'ratio'], ['limits', rhoG < K.rhoMin ? K.rhoMin : K.rhoMax, 'ratio'], rhoG < K.rhoMin ? K.rhoMin / rhoG : rhoG / K.rhoMax, 'col.rho', { note: K.rhoMin + ' to ' + K.rhoMax }));
  out.checks.push(check('Number of bars', ['minimum', K.minBars[kind], 'count'], ['n', input.n, 'count'], K.minBars[kind] / input.n, 'col.minBars'));
  Object.assign(vals, { Ag, Ast, rhoG, Po: cap.Po, PnMax: cap.PnMax, phiPnMax: cap.pP, wsdAllow: allow });
  out.results = [res('Ast', Ast, A), res('ρg', rhoG), res('Po', cap.Po, F), res('Pn,max', cap.PnMax, F), res('φPn,max', cap.pP, F), res('WSD allowable (reference)', allow, F)];
  out.diagram = { kind: 'axial', shape: input.shape, b: input.b, h: input.h, D: input.D, n: input.n, db: input.db, chips: [spiral ? S`D = ${u(input.D, L)}, spiral` : S`${v(input.b, L)} × ${u(input.h, L)}, tied`, S`${input.n} - ${input.db} mm bars`] };
  return env.done();
}

// Section layers from the input: typed layers or the bar helper.
export function columnLayers(input) {
  if (input.layerFrom === 'layers') return (input.layers || []).map((l) => ({ d: l.d, As: l.As, n: null }));
  const ls = layersFromBars({ n: input.n, db: input.db, cover: input.cover, tie: input.tie, h: input.h, arrangement: input.arrangement });
  if (!ls) return null;
  const ab = barArea(1, input.db);
  return ls.map((l) => Object.assign(l, { n: l.As / ab }));
}

function interaction(input, env) {
  const { ed, vals, out, rec } = env, C = ed.concrete;
  if (!positive(input, ['b', 'h', 'fc', 'fy'])) return env.stop('The section and the strengths need positive numbers.');
  if (input.layerFrom !== 'layers' && !positive(input, ['n', 'db', 'cover', 'tie'])) return env.stop('Give the number and size of the bars, the cover and the tie size.');
  const layers = columnLayers(input);
  if (!layers || !layers.length) return env.stop('These bars cannot be arranged on all four faces. Use an even number of 4 or more, or type the layers.');
  if (layers.some((l) => !(l.d > 0 && l.d < input.h && l.As > 0))) return env.stop('Every layer needs a depth inside the section and a positive area.');
  out.warnings.push(...materialWarnings(input.fc, input.fy, ed));
  const sec = { b: input.b, h: input.h, fc: input.fc, fy: input.fy, layers, spiral: input.confinement === 'spiral' };
  const tot = sectionTotals(sec), np = namedPoints(sec, ed), curve = interactionCurve(sec, ed), ax = curve.axial;
  rec.add('Section and layers', S`Ag = b h;  Ast = Σ As,i;  dt = depth of the farthest layer`, S`${layers.length} layers;  Ast = ${u(tot.Ast, A)}`, S`dt = ${u(tot.dt, L)},  ρg = ${tot.Ast / tot.Ag}`, 'basic.section');
  rec.add('Strain compatibility for a neutral axis depth c', S`a = β1 c ≤ h;  εs,i = ${C.ecu} (c − di) / c;  fs,i = Es εs,i within ± fy;  Cc = ${C.sb} f'c a b`,
    S`β1 = ${C.beta1(input.fc)};  ${C.sb} f'c is subtracted from layers inside the stress block in compression`, S`Pn = Cc + Σ Fs,i;  Mn = Cc (h/2 − a/2) + Σ Fs,i (h/2 − di)`, 'col.strain');
  rec.add('Pure compression and maximum axial strength', S`Po = ${C.sb} f'c (Ag − Ast) + fy Ast;  φPn,max = φ · ${ax.k} Po`, S`Po = ${u(ax.Po / 1e3, F)}`, S`φPn,max = ${u(ax.phiPnMax / 1e3, F)}`, 'col.PnMax');
  const show = (title, p, clause, note) => rec.add(title, S`c = ${u(p.c, L)}`, S`Pn = ${u(p.Pn / 1e3, F)},  Mn = ${u(p.Mn / 1e6, M)},  εt = ${p.et},  φ = ${p.phi}`, S`φPn = ${u(p.phiPn / 1e3, F)},  φMn = ${u(p.phiMn / 1e6, M)}`, clause, note);
  show('Balanced point', np.balanced, 'flexure.phi', 'c = ' + C.ecu + ' dt / (' + C.ecu + ' + εty).');
  show('Tension-controlled limit', np.tensionLimit, 'flexure.phi', 'c = ' + C.ecu + ' dt / (' + C.ecu + ' + ' + C.etTension + ').');
  show('Pure bending', np.pureBending, 'flexure.phi', 'Pn = 0, found by bisection.');
  rec.add('Pure tension', S`Pn = −fy Ast;  φ = ${C.phi.tension}`, S`Pn = −${v(input.fy, ST)} · ${v(tot.Ast, A)}`, S`Pn = ${u(np.pureTension.Pn / 1e3, F)},  φPn = ${u(np.pureTension.phiPn / 1e3, F)}`, 'flexure.phi');
  const pts = { balanced: np.balanced, tensionLimit: np.tensionLimit, pureBending: np.pureBending, pureTension: np.pureTension };
  Object.keys(pts).forEach((k) => { const p = pts[k]; vals[k] = { c: p.c, Pn: p.Pn / 1e3, Mn: p.Mn / 1e6, et: p.et, phi: p.phi, phiPn: p.phiPn / 1e3, phiMn: p.phiMn / 1e6 }; });
  if (input.cAt > 0) {
    const p = interactionPoint(sec, input.cAt, ed);
    const pPn = Math.min(p.phi * p.Pn, ax.phiPnMax);
    show('Point at the chosen neutral axis depth', Object.assign({}, p, { phiPn: pPn, phiMn: p.phi * p.Mn }), 'col.strain');
    vals.atC = { c: p.c, Pn: p.Pn / 1e3, Mn: p.Mn / 1e6, et: p.et, phi: p.phi, phiPn: pPn / 1e3, phiMn: p.phi * p.Mn / 1e6 };
  }
  Object.assign(vals, { Po: ax.Po / 1e3, phiPnMax: ax.phiPnMax / 1e3, Ast: tot.Ast });
  const Pu = input.Pu, Mu = input.Mu;
  let demand = null;
  if (Pu > 0 && Mu >= 0) {
    const e = Mu * 1e3 / Pu;
    if (e < 1e-6) {
      rec.add('Capacity at the demand', S`Mu = 0: axial load only`, null, S`φPn = φPn,max = ${u(ax.phiPnMax / 1e3, F)};  D/C = ${dc(Pu * 1e3 / ax.phiPnMax)}`, 'col.PnMax');
      out.checks.push(check('Combined axial and bending', ['Pu', Pu, F], ['φPn', ax.phiPnMax / 1e3, F], Pu * 1e3 / ax.phiPnMax, 'col.PnMax'));
    } else {
      const cap = capacityAtEccentricity(sec, e, ed);
      rec.add('Capacity at the demand eccentricity', S`e = Mu / Pu;  find c so that Mn / Pn = e;  φPn(e) ≤ φPn,max`, S`e = ${v(Mu, M)} / ${v(Pu, F)} = ${u(e, L)};  c = ${u(cap.c, L)}, Pn = ${u(cap.Pn / 1e3, F)}, Mn = ${u(cap.Mn / 1e6, M)}, εt = ${cap.et}, φ = ${cap.phi}`,
        S`φPn = ${u(cap.phiPn / 1e3, F)},  φMn = ${u(cap.phiMn / 1e6, M)};  D/C = Pu / φPn = ${dc(Pu * 1e3 / cap.phiPn)}`, 'col.strain', cap.capped ? 'φPn is limited to φPn,max at this eccentricity.' : '');
      out.checks.push(check('Combined axial and bending', ['Pu', Pu, F], ['φPn(e)', cap.phiPn / 1e3, F], Pu * 1e3 / cap.phiPn, 'col.strain'));
      vals.atE = { e, c: cap.c, Pn: cap.Pn / 1e3, Mn: cap.Mn / 1e6, et: cap.et, phi: cap.phi, phiPn: cap.phiPn / 1e3, phiMn: cap.phiMn / 1e6, dc: Pu * 1e3 / cap.phiPn };
      demand = cap;
    }
  } else if (Pu <= 0 && input.Pu != null) out.warnings.push('Only compression demands are checked. Enter Pu above zero.');
  out.results = [res('φPn,max', ax.phiPnMax / 1e3, F), res('Balanced φPn', np.balanced.phiPn / 1e3, F), res('Balanced φMn', np.balanced.phiMn / 1e6, M), res('Pure bending φMn', np.pureBending.phiMn / 1e6, M), res('Pure tension φPn', np.pureTension.phiPn / 1e3, F)];
  if (vals.atE) out.results.push(res('φPn at e', vals.atE.phiPn, F));
  const row = (name, p) => ({ cells: [name, p.c != null ? u(p.c, L) : '–', u(p.Pn / 1e3, F), u(p.Mn / 1e6, M), p.phi != null ? v(p.phi) : '–', u(p.phiPn / 1e3, F), u(p.phiMn / 1e6, M)] });
  out.diagram = {
    kind: 'interaction', b: input.b, h: input.h, layers, curve: { nominal: curve.nominal.map((p) => [p[0] / 1e6, p[1] / 1e3]), design: curve.design.map((p) => [p[0] / 1e6, p[1] / 1e3]) },
    demand: Pu > 0 ? { P: Pu, M: Mu } : null, cap: demand ? { c: demand.c, a: demand.a, et: demand.et, forces: demand.forces } : { c: np.balanced.c, a: np.balanced.a, forces: np.balanced.forces },
    chips: [S`${v(input.b, L)} × ${u(input.h, L)}`, S`Ast = ${u(tot.Ast, A)}`, [sec.spiral ? 'spiral' : 'tied']],
    tables: [{ title: 'Named points of the interaction diagram', head: ['Point', 'c', 'Pn', 'Mn', 'φ', 'φPn', 'φMn'], rows: [
      { cells: ['Pure compression', '–', u(ax.Po / 1e3, F), u(0, M), v(ax.phi), u(Math.min(ax.phi * ax.Po, ax.phiPnMax) / 1e3, F), u(0, M)] },
      { cells: ['Maximum axial (φPn,max)', '–', u(ax.PnMax / 1e3, F), '–', v(ax.phi), u(ax.phiPnMax / 1e3, F), '–'] },
      row('Balanced', np.balanced), row('Tension-controlled limit', np.tensionLimit), row('Pure bending', np.pureBending), row('Pure tension', np.pureTension)] }]
  };
  return env.done();
}

function ties(input, env) {
  const { ed, vals, out, rec } = env, K = ed.concrete.column;
  if (input.detail === 'spiral') {
    const S0 = K.spiral;
    if (!positive(input, ['D', 'cover', 'dsp', 'fc', 'fyt'])) return env.stop('Give the column diameter, cover, spiral bar size and strengths.');
    const { D, cover, dsp, fc } = input, fyt = Math.min(input.fyt, S0.fytMax), Dch = D - 2 * cover;
    if (!(Dch > dsp)) return env.stop('The cover is too large for this column diameter.');
    if (input.fyt > S0.fytMax) out.notes.push('fyt is limited to ' + S0.fytMax + ' MPa in this formula.');
    const Ag = Math.PI * D * D / 4, Ach = Math.PI * Dch * Dch / 4, rhoS = S0.k * (Ag / Ach - 1) * fc / fyt, Asp = barArea(1, dsp);
    const sMax = 4 * Asp * (Dch - dsp) / (Dch * Dch * rhoS), clearMax = sMax - dsp;
    rec.add('Core area', S`Dch = D − 2 · cover (to the outside of the spiral);  Ach = π Dch² / 4`, S`Dch = ${v(D, L)} − 2 · ${v(cover, L)} = ${u(Dch, L)}`, S`Ag = ${u(Ag, A)},  Ach = ${u(Ach, A)}`, 'basic.geometry');
    rec.add('Minimum spiral ratio', S`ρs = ${S0.k} (Ag / Ach − 1) f'c / fyt,  fyt ≤ ${u(S0.fytMax, ST)}`, S`ρs = ${S0.k} (${v(Ag, A)} / ${v(Ach, A)} − 1) · ${v(fc, ST)} / ${v(fyt, ST)}`, S`ρs,min = ${rhoS}`, 'col.spiralRatio');
    rec.add('Maximum pitch', S`s = 4 Asp (Dch − dsp) / (Dch² ρs)`, S`s = 4 · ${v(Asp, A)} (${v(Dch, L)} − ${v(dsp, L)}) / (${v(Dch, L)}² · ${rhoS})`, S`s,max = ${u(sMax, L)};  clear spacing = s − dsp = ${u(clearMax, L)}`, 'col.spiralRatio');
    rec.add('Clear spacing between turns', S`${u(S0.clearMin, L)} ≤ s − dsp ≤ ${u(S0.clearMax, L)}`, S`clear spacing at the maximum pitch = ${u(clearMax, L)}`,
      [clearMax < S0.clearMin ? 'Below the minimum: use a larger spiral bar.' : clearMax > S0.clearMax ? 'Above the maximum: use a pitch of at most ' + (S0.clearMax + dsp) + ' mm.' : 'Within the limits.'], 'col.spiralSpacing');
    const pitch = Math.min(sMax, S0.clearMax + dsp);
    out.checks.push(check('Spiral steel ratio', ['ρs,min', rhoS, 'ratio'], ['ρs at the pitch used', 4 * Asp * (Dch - dsp) / (Dch * Dch * pitch), 'ratio'], rhoS / (4 * Asp * (Dch - dsp) / (Dch * Dch * pitch)), 'col.spiralRatio'));
    out.checks.push(check('Clear spacing between turns', ['minimum', S0.clearMin, L], ['clear', pitch - dsp, L], S0.clearMin / (pitch - dsp), 'col.spiralSpacing'));
    out.checks.push(check('Spiral bar size', ['minimum', S0.barMin, L], ['dsp', dsp, L], S0.barMin / dsp, 'col.spiralBar'));
    Object.assign(vals, { Ag, Dch, Ach, rhoS, sMax, clear: clearMax, pitch });
    out.results = [res('Ach', Ach, A), res('ρs,min', rhoS), res('Maximum pitch', sMax, L), res('Clear spacing', clearMax, L), res('Pitch to use', pitch, L)];
    out.diagram = { kind: 'spiral', D, Dch, dsp, pitch, chips: [S`D = ${u(D, L)}`, S`${dsp} mm spiral at ${u(pitch, L)}`] };
    return env.done();
  }
  const T = K.tie;
  if (!positive(input, ['db', 'dt', 'least'])) return env.stop('Give the longitudinal bar size, the tie size and the least column dimension.');
  const { db, dt, least } = input, req = db <= T.smallMax ? T.small : T.large;
  const s1 = T.longDb * db, s2 = T.tieDb * dt, s = Math.min(s1, s2, least);
  rec.add('Minimum tie size', S`${u(T.small, L)} ties for bars up to ${u(T.smallMax, L)};  ${u(T.large, L)} for larger and bundled bars`, S`longitudinal bars ${u(db, L)}`, S`minimum tie = ${u(req, L)};  provided ${u(dt, L)}`, 'col.tieSize');
  rec.add('Maximum tie spacing', S`s = least of ${T.longDb} db, ${T.tieDb} dtie and the least column dimension`, S`least of ${T.longDb} · ${v(db, L)} = ${v(s1, L)}, ${T.tieDb} · ${v(dt, L)} = ${v(s2, L)}, ${v(least, L)}`, S`s,max = ${u(s, L)}`, 'col.tieSpacing');
  out.checks.push(check('Tie size', ['minimum', req, L], ['provided', dt, L], req / dt, 'col.tieSize'));
  if (input.sProv > 0) out.checks.push(check('Tie spacing', ['s provided', input.sProv, L], ['s,max', s, L], input.sProv / s, 'col.tieSpacing'));
  Object.assign(vals, { tieMin: req, s16: s1, s48: s2, sMax: s });
  out.results = [res('Minimum tie size', req, L), res('16 db', s1, L), res('48 dtie', s2, L), res('Maximum spacing', s, L)];
  out.diagram = { kind: 'ties', least, db, dt, s, chips: [S`${db} mm bars, ${dt} mm ties`, S`s,max = ${u(s, L)}`] };
  return env.done();
}

function slenderness(input, env) {
  const { ed, vals, out, rec } = env, C = ed.concrete, K = C.column, circ = input.shape === 'circular';
  const need = ['fc', 'lu', 'k', 'Pu', 'M2'].concat(circ ? ['D'] : ['b', 'h']);
  if (!positive(input, need) || !(input.M1 >= 0) || !(input.betaDns >= 0)) return env.stop('Every dimension, length, load and moment needs a positive number.');
  const { fc, lu, k, Pu } = input, h = circ ? input.D : input.h, b = circ ? input.D : input.b;
  let M2 = input.M2;
  const M1 = Math.min(input.M1, M2), ratio = (input.curvature === 'single' ? -1 : 1) * M1 / M2;
  const r = (circ ? K.radius.circ : K.radius.rect) * h, klr = k * lu / r;
  rec.add('Radius of gyration and slenderness', circ ? S`r = ${K.radius.circ} D;  k ℓu / r` : S`r = ${K.radius.rect} h (h in the direction of bending);  k ℓu / r`, S`r = ${u(r, L)};  ${k} · ${v(lu, L)} / ${v(r, L)}`, S`k ℓu / r = ${klr}`, 'col.radius');
  const braced = input.frame !== 'unbraced', S0 = K.slender;
  const limit = braced ? Math.min(S0.a + S0.b * ratio, S0.cap) : S0.unbraced;
  rec.add('Slenderness limit', braced ? S`braced: k ℓu / r ≤ ${S0.a} + ${S0.b} (M1 / M2) ≤ ${S0.cap};  M1/M2 negative in single curvature` : S`unbraced: k ℓu / r ≤ ${S0.unbraced}`,
    braced ? S`M1 / M2 = ${ratio};  limit = ${limit}` : null, S`${klr} ${klr <= limit ? '≤' : '>'} ${limit}: ${klr <= limit ? 'slenderness may be neglected' : 'slender'}`, 'col.slenderLimit');
  Object.assign(vals, { r, klr, limit, ratio });
  out.diagram = { kind: 'slender', lu, k, curvature: input.curvature, chips: [S`k ℓu / r = ${klr}`, [braced ? 'braced' : 'unbraced']] };
  if (klr <= limit) {
    out.notes.push('Slenderness effects may be neglected; design the column for Pu and M2.');
    out.checks.push(check('Slenderness', ['k ℓu / r', klr, 'ratio'], ['limit', limit, 'ratio'], klr / limit, 'col.slenderLimit'));
    out.results = [res('k ℓu / r', klr), res('Limit', limit), res('Mc', M2, M)];
    vals.delta = 1; vals.Mc = M2;
    out.send = [{ to: 'rc/columns', mode: 'interaction', label: 'Use Pu and M2 in the Interaction diagram', values: { Pu, Mu: M2 } }];
    return env.done();
  }
  if (!braced) return env.stop(K.sway);
  const Ec = C.Ec(fc), Ig = circ ? Math.PI * Math.pow(input.D, 4) / 64 : b * Math.pow(h, 3) / 12, EI = K.EIeff * Ec * Ig / (1 + input.betaDns);
  const Pc = Math.PI * Math.PI * EI / Math.pow(k * lu, 2) / 1e3;
  rec.add('Effective stiffness', S`Ec = ${C.EcCoef} √f'c;  (EI)eff = ${K.EIeff} Ec Ig / (1 + βdns)`, S`Ec = ${u(Ec, ST)};  Ig = ${u(Ig, 'inertia')};  βdns = ${input.betaDns}`, S`(EI)eff = ${u(EI, 'rigidity')}`, 'col.EIeff');
  rec.add('Critical buckling load', S`Pc = π² (EI)eff / (k ℓu)²`, S`Pc = π² · ${v(EI, 'rigidity')} / (${k} · ${v(lu, L)})²`, S`Pc = ${u(Pc, F)}`, 'col.Pc');
  let Cm = input.transverse ? K.Cm.transverse : K.Cm.a - K.Cm.b * ratio;
  rec.add('Moment gradient factor', input.transverse ? S`Cm = ${K.Cm.transverse} with transverse loads between supports` : S`Cm = ${K.Cm.a} − ${K.Cm.b} (M1 / M2)`, input.transverse ? null : S`Cm = ${K.Cm.a} − ${K.Cm.b} (${ratio})`, S`Cm = ${Cm}`, 'col.Cm');
  const M2min = Pu * (K.M2min.a + K.M2min.b * h) / 1e3;
  const useMin = M2min > M2;
  rec.add('Minimum moment', S`M2,min = Pu (${K.M2min.a} + ${K.M2min.b} h), h in mm`, S`M2,min = ${v(Pu, F)} (${K.M2min.a} + ${K.M2min.b} · ${v(h, L)}) / 1000`, S`M2,min = ${u(M2min, M)}${useMin ? ' > M2: use M2,min and Cm = 1.0' : ' ≤ M2'}`, 'col.M2min');
  if (useMin) { M2 = M2min; Cm = K.Cm.transverse; }
  Object.assign(vals, { Ec, Ig, EI, Pc, Cm, M2min });
  if (Pu >= K.Pc075 * Pc) return env.stop('Pu reaches ' + K.Pc075 + ' Pc, so the moment magnifier has no finite value (' + ed.clauses['col.delta'].nscp + '). Enlarge the column.');
  const delta = Math.max(1, Cm / (1 - Pu / (K.Pc075 * Pc))), Mc = delta * M2;
  rec.add('Moment magnifier', S`δ = Cm / (1 − Pu / (${K.Pc075} Pc)) ≥ 1.0`, S`δ = ${Cm} / (1 − ${v(Pu, F)} / (${K.Pc075} · ${v(Pc, F)}))`, S`δ = ${delta}`, 'col.delta');
  vals.delta = delta;
  if (delta > K.deltaMax) return env.stop(K.tooSlender);
  rec.add('Magnified moment', S`Mc = δ M2`, S`Mc = ${delta} · ${v(M2, M)}`, S`Mc = ${u(Mc, M)}`, 'col.Mc');
  vals.Mc = Mc;
  out.checks.push(check('Moment magnifier', ['δ', delta, 'ratio'], ['limit', K.deltaMax, 'ratio'], delta / K.deltaMax, 'col.deltaLimit'));
  out.results = [res('k ℓu / r', klr), res('Pc', Pc, F), res('Cm', Cm), res('δ', delta), res('Mc', Mc, M)];
  out.send = [{ to: 'rc/columns', mode: 'interaction', label: 'Use Pu and Mc in the Interaction diagram', values: { Pu, Mu: Mc } }];
  return env.done();
}
