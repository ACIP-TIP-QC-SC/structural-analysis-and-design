// RC beam flexure: singly, doubly and flanged sections; USD analyze and design; WSD analyze.
// Pure calculation. Every factor and clause key comes from the edition object (ctx.edition).
// Units in and out: mm, mm², MPa, kN·m. Inside formulas moments are N·mm.
import { S, v, u, si, dc, Nmm, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { barArea, rhoFromRn, materialWarnings } from './common.js';

const L = 'length_mm', A = 'area', ST = 'stress', M = 'moment';
const TOO_SMALL = 'The section is too small for this moment as a singly reinforced beam. Increase b or d, or use the Doubly mode.';

// ------------------------------------------------------------------ strength functions (reusable)

// Singly reinforced rectangular section. p: { b, d, As, fc, fy }. Mn in N·mm.
export function flexuralStrengthRect(p, ed) {
  const C = ed.concrete, k = C.sb * p.fc * p.b, beta1 = C.beta1(p.fc), ety = C.ety(p.fy), E = C.Es, ecu = C.ecu;
  const a0 = p.As * p.fy / k, c0 = a0 / beta1, et0 = ecu * (p.d - c0) / c0;
  let a = a0, c = c0, et = et0, fs = p.fy;
  const yields = et0 >= ety;
  if (!yields) {
    const qa = k * beta1, qb = p.As * E * ecu;
    c = (-qb + Math.sqrt(qb * qb + 4 * qa * qb * p.d)) / (2 * qa);
    a = beta1 * c; et = ecu * (p.d - c) / c; fs = E * et;
  }
  return { beta1, ety, a0, c0, et0, yields, a, c, et, fs, phi: C.phi.flexAxial(et, p.fy), Mn: p.As * fs * (p.d - a / 2), Cc: k * a, C: k * a, T: p.As * fs, flanged: false };
}

// Flanged section. p: { bf, hf, bw, d, As, fc, fy }.
export function flexuralStrengthFlanged(p, ed) {
  const C = ed.concrete, beta1 = C.beta1(p.fc), ety = C.ety(p.fy), E = C.Es, ecu = C.ecu, s85 = C.sb * p.fc;
  const aRect = p.As * p.fy / (s85 * p.bf);
  const Cf = s85 * (p.bf - p.bw) * p.hf;
  const strain = (c) => ecu * (p.d - c) / c;
  let flanged = aRect > p.hf, a0, a, c, et, fs = p.fy, yields = true;
  if (!flanged) {
    a0 = aRect; a = a0; c = a / beta1; et = strain(c);
    if (et < ety) {
      yields = false;
      const qa = s85 * p.bf * beta1, qb = p.As * E * ecu;
      c = (-qb + Math.sqrt(qb * qb + 4 * qa * qb * p.d)) / (2 * qa);
      if (beta1 * c > p.hf) flanged = true;
    }
  }
  if (flanged) {
    a0 = (p.As * p.fy - Cf) / (s85 * p.bw);
    if (yields && strain(a0 / beta1) >= ety && a0 > 0) c = a0 / beta1;
    else {
      // Cf + sb f'c bw beta1 c = As Es ecu (d - c) / c
      yields = false;
      const qa = s85 * p.bw * beta1, qb = Cf + p.As * E * ecu, qc = p.As * E * ecu * p.d;
      c = (-qb + Math.sqrt(qb * qb + 4 * qa * qc)) / (2 * qa);
    }
  }
  a = beta1 * c; et = strain(c); fs = yields ? p.fy : E * et;
  const c0 = a0 / beta1, et0 = strain(c0);
  let Mn, Cw, Ctot;
  if (flanged) { Cw = s85 * p.bw * a; Ctot = Cf + Cw; Mn = Cf * (p.d - p.hf / 2) + Cw * (p.d - a / 2); }
  else { Cw = s85 * p.bf * a; Ctot = Cw; Mn = Cw * (p.d - a / 2); }
  return { beta1, ety, aRect, a0, c0, et0, yields, flanged, Cf: flanged ? Cf : 0, Cw, a, c, et, fs, phi: C.phi.flexAxial(et, p.fy), Mn, C: Ctot, T: p.As * fs };
}

// Doubly reinforced rectangular section. p: { b, d, dp, As, Asp, fc, fy }. The concrete displaced by A's is deducted.
export function flexuralStrengthDoubly(p, ed) {
  const C = ed.concrete, beta1 = C.beta1(p.fc), ety = C.ety(p.fy), E = C.Es, ecu = C.ecu, s85 = C.sb * p.fc, k = s85 * p.b * beta1;
  const c0 = (p.As * p.fy - p.Asp * (p.fy - s85)) / k;
  const esp0 = ecu * (c0 - p.dp) / c0;
  let c = c0, compYields = esp0 >= ety, tensYields = true;
  if (!compYields) {
    const qb = p.Asp * (E * ecu - s85) - p.As * p.fy, qc = p.Asp * E * ecu * p.dp;
    c = (-qb + Math.sqrt(qb * qb + 4 * k * qc)) / (2 * k);
  }
  const stress = (cc) => ({ fsp: Math.max(-p.fy, Math.min(p.fy, E * ecu * (cc - p.dp) / cc)), fs: Math.min(p.fy, E * ecu * (p.d - cc) / cc) });
  if (ecu * (p.d - c) / c < ety) {
    // Tension steel does not yield either: solve equilibrium with both stresses from strain.
    tensYields = false;
    let lo = 1e-6, hi = p.d;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, sx = stress(mid);
      if (k * mid + p.Asp * (sx.fsp - s85) - p.As * sx.fs > 0) hi = mid; else lo = mid;
    }
    c = (lo + hi) / 2;
    compYields = ecu * (c - p.dp) / c >= ety;
  }
  const a = beta1 * c, esp = ecu * (c - p.dp) / c, et = ecu * (p.d - c) / c;
  const fsp = compYields ? p.fy : Math.max(-p.fy, E * esp), fs = tensYields ? p.fy : E * et;
  const Cc = s85 * a * p.b, Cs = p.Asp * (fsp - s85);
  return { beta1, ety, c0, esp0, compYields, yields: tensYields, a, c, esp, et, fsp, fs, phi: C.phi.flexAxial(et, p.fy), Cc, Cs, Mn: Cc * (p.d - a / 2) + Cs * (p.d - p.dp), C: Cc + Cs, T: p.As * fs };
}

// Required steel of a singly reinforced rectangular section. p: { b, d, fc, fy, Mu (N·mm) }.
export function requiredSteelRect(p, ed) {
  const C = ed.concrete;
  let phi = C.designAssume.phi, out = null, first = null;
  for (let i = 0; i < 20; i++) {
    const Rn = p.Mu / (phi * p.b * p.d * p.d), rho = rhoFromRn(Rn, p.fc, p.fy, C.sb);
    if (!isFinite(rho)) return { ok: false, first };
    const As = rho * p.b * p.d, s = flexuralStrengthRect({ b: p.b, d: p.d, As, fc: p.fc, fy: p.fy }, ed);
    out = { ok: true, Rn, rho, As, a: s.a, c: s.c, et: s.et, phi, phiNew: s.phi, iterations: i + 1 };
    if (!first) first = { Rn, rho, As, a: s.a, c: s.c, et: s.et };
    if (Math.abs(s.phi - phi) < 1e-10) break;
    phi = s.phi;
  }
  out.first = first;
  if (out.et < C.etMinBeam || Math.abs(out.phiNew - out.phi) > 1e-4) out.ok = false;
  return out;
}

// Effective flange width (clause key flexure.flangeWidth). type: 'T' or 'L'.
export function effectiveFlangeWidth(p, ed) {
  const F = ed.concrete.flange[p.type === 'L' ? 'L' : 'T'];
  const opts = [F.timesH * p.hf, p.sw / F.swDiv, p.ln / F.lnDiv];
  const over = Math.min(...opts);
  return { F, opts, over, bf: p.bw + F.sides * over };
}

// Cracked transformed section by the straight-line theory of the alternate design method.
// p: { b (flange or beam width), bw, hf, d, dp, As, Asp, n }.
export function crackedSection(p, ed) {
  const nAs = p.n * p.As, m = p.Asp ? (ed.wsd.compSteel * p.n - 1) * p.Asp : 0, dp = p.dp || 0;
  const solveRect = (b) => { const qb = nAs + m, qc = nAs * p.d + m * dp; return (-qb + Math.sqrt(qb * qb + 2 * b * qc)) / b; };
  let x = solveRect(p.b), flanged = false;
  if (p.hf && p.bw && x > p.hf) {
    flanged = true;
    const fl = (p.b - p.bw) * p.hf, qb = fl + nAs + m, qc = fl * p.hf / 2 + nAs * p.d + m * dp;
    x = (-qb + Math.sqrt(qb * qb + 2 * p.bw * qc)) / p.bw;
  }
  let Icr = p.b * Math.pow(x, 3) / 3 + nAs * Math.pow(p.d - x, 2) + m * Math.pow(x - dp, 2);
  if (flanged) Icr -= (p.b - p.bw) * Math.pow(x - p.hf, 3) / 3;
  return { x, Icr, flanged, m };
}

// ------------------------------------------------------------------ module entry points

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function zoneText(s, C) {
  if (s.et >= C.etTension) return 'Tension-controlled section.';
  return s.et > s.ety ? 'Transition zone between tension and compression control.' : 'Compression-controlled section.';
}

function run(input, ctx) {
  const ed = ctx.edition, C = ed.concrete, mode = input.mode || 'singly', wsd = ctx.method === 'WSD';
  const task = wsd ? 'analyze' : (input.task || 'analyze');
  const vals = {}, rec = recorder(), out = blank();
  const flangedMode = mode === 'flanged', doubly = mode === 'doubly';
  const stop = (msg, diagram) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], diagram || {}) });

  // ---- geometry
  let { h, d, fc, fy } = input;
  let b = flangedMode ? input.bw : input.b, bf = b, hf = 0;
  const need = [flangedMode ? 'bw' : 'b', 'h', 'd', 'fc', 'fy', wsd ? 'Ms' : 'Mu'];
  if (doubly) need.push('dp');
  if (flangedMode) need.push('hf');
  if (!positive(input, need)) return stop('Every dimension, strength and moment needs a positive number.');
  if (d >= h) return stop('Effective depth d must be less than the total depth h.');
  out.warnings.push(...materialWarnings(fc, fy, ed));
  const Mdem = wsd ? input.Ms : input.Mu;
  const Mu = Mdem * 1e6;

  if (flangedMode) {
    hf = input.hf;
    if (hf >= d) return stop('Flange thickness hf must be less than the effective depth d.');
    if (input.bfFrom === 'table') {
      if (!positive(input, ['sw', 'ln'])) return stop('The flange width helper needs the clear distance to the next web and the clear span.');
      const fw = effectiveFlangeWidth({ type: input.flangeType, hf, sw: input.sw, ln: input.ln, bw: b }, ed);
      bf = fw.bf; vals.bf = bf; vals.overhang = fw.over;
      rec.add('Effective flange width', S`overhang = least of ${fw.F.timesH} hf, sw / ${fw.F.swDiv}, ℓn / ${fw.F.lnDiv}${fw.F.sides === 2 ? ' on each side of the web' : ' on one side (L beam)'}`,
        S`overhang = least of ${v(fw.opts[0], L)}, ${v(fw.opts[1], L)}, ${v(fw.opts[2], L)} = ${u(fw.over, L)}`,
        S`bf = bw + ${fw.F.sides} × overhang = ${u(bf, L)}`, 'flexure.flangeWidth');
    } else {
      bf = input.bf;
      if (!(bf > 0)) return stop('Flange width bf needs a positive number.');
    }
    if (bf < b) return stop('Flange width bf must not be less than the web width bw.');
  }
  const dp = doubly ? input.dp : 0;
  if (doubly && dp >= d) return stop("Compression steel depth d' must be less than the effective depth d.");

  // ---- bars
  const useBars = task === 'analyze' || doubly || flangedMode;
  let As = 0, Asp = 0, nb = input.n, db = input.db, nbp = input.np, dbp = input.dbp;
  if (task === 'analyze') {
    if (!positive(input, ['n', 'db'])) return stop('Give the number and size of the tension bars.');
    As = barArea(nb, db);
    if (doubly) { if (!positive(input, ['np', 'dbp'])) return stop('Give the number and size of the compression bars.'); Asp = barArea(nbp, dbp); }
  }
  const dia = { kind: wsd ? 'wsd' : 'usd', b, h, d, bf, hf, flangedMode, dp: doubly ? dp : 0, n: nb, db, np: doubly ? nbp : 0, dbp: doubly ? dbp : 0, chips: [] };
  dia.chips.push(flangedMode ? S`bf = ${u(bf, L)}, bw × h = ${v(b, L)} × ${u(h, L)}` : S`b × h = ${v(b, L)} × ${u(h, L)}`);
  out.diagram = dia;
  const finish = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const barStep = (title, sym, n, dbar, area) => rec.add(title, S`${sym} = n · π · db² / 4`, S`${sym} = ${n} · π · (${v(dbar, L)})² / 4`, S`${sym} = ${u(area, A)}`, 'basic.barArea');
  const asMinStep = (AsMin, r1, r2, width) => rec.add('Minimum flexural steel',
    { SI: S`As,min = max(${C.asMinBeam.a}√f'c / fy, ${C.asMinBeam.b} / fy) · ${flangedMode ? 'bw' : 'b'} · d`, US: S`As,min = max(${C.asMinBeam.aUS}√f'c / fy, ${C.asMinBeam.bUS} / fy) · ${flangedMode ? 'bw' : 'b'} · d  (psi)` },
    S`As,min = max(${r1}, ${r2}) · ${v(width, L)} · ${v(d, L)}`, S`As,min = ${u(AsMin, A)}`, 'flexure.minSteel');
  const r1 = C.asMinBeam.a * Math.sqrt(fc) / fy, r2 = C.asMinBeam.b / fy, AsMin = C.AsMinBeam(fc, fy, b, d);
  vals.AsMin = AsMin;

  // ================================================================ WSD (alternate design method), analyze
  if (wsd) {
    const W = ed.wsd, Ec = C.Ec(fc), nExact = C.Es / Ec, n = Math.max(W.nMin, input.exactN ? nExact : Math.round(nExact));
    dia.chips.push(S`${nb} - ${db} mm bars`);
    barStep('Steel area', 'As', nb, db, As);
    if (doubly) barStep('Compression steel area', "A's", nbp, dbp, Asp);
    rec.add('Modulus of elasticity of concrete', { SI: S`Ec = ${C.EcCoef}√f'c`, US: S`Ec = ${C.EcCoefUS}√f'c  (psi)` }, S`f'c = ${u(fc, ST)}`, S`Ec = ${u(Ec, ST)}`, 'mat.Ec');
    rec.add('Modular ratio', S`n = Es / Ec`, S`n = ${v(C.Es, ST)} / ${v(Ec, ST)} = ${nExact}`, S`n = ${n}`, 'wsd.n',
      input.exactN ? 'The exact value is used (setting "Use exact n"), not less than ' + W.nMin + '.' : 'Taken as the nearest whole number, not less than ' + W.nMin + '.');
    const cs = crackedSection({ b: bf, bw: flangedMode ? b : 0, hf, d, dp, As, Asp: doubly ? Asp : 0, n }, ed);
    const x = cs.x, Icr = cs.Icr, m2 = W.compSteel * n - 1;
    if (flangedMode && !cs.flanged) rec.add('Neutral axis of the cracked transformed section', S`bf · kd² / 2 = n · As · (d − kd)`, S`${v(bf, L)} · kd² / 2 = (${n})(${v(As, A)})(${v(d, L)} − kd)`, S`kd = ${u(x, L)}`, 'wsd.theory', 'kd ≤ hf, so the section acts as a rectangle of width bf.');
    else if (flangedMode) rec.add('Neutral axis of the cracked transformed section', S`bf · hf · (kd − hf / 2) + bw · (kd − hf)² / 2 = n · As · (d − kd)`, S`${v(bf, L)} · ${v(hf, L)} · (kd − ${v(hf / 2, L)}) + ${v(b, L)} · (kd − ${v(hf, L)})² / 2 = (${n})(${v(As, A)})(${v(d, L)} − kd)`, S`kd = ${u(x, L)}`, 'wsd.theory', 'kd > hf, so the flange-and-web transformed section is used.');
    else if (doubly) rec.add('Neutral axis of the cracked transformed section', S`b · kd² / 2 + (${W.compSteel}n − 1) · A's · (kd − d') = n · As · (d − kd)`, S`${v(b, L)} · kd² / 2 + (${m2})(${v(Asp, A)})(kd − ${v(dp, L)}) = (${n})(${v(As, A)})(${v(d, L)} − kd)`, S`kd = ${u(x, L)}`, 'wsd.compSteel', 'Compression steel is transformed with ' + W.compSteel + ' Es/Ec, less the concrete it displaces.');
    else rec.add('Neutral axis of the cracked transformed section', S`b · kd² / 2 = n · As · (d − kd)`, S`${v(b, L)} · kd² / 2 = (${n})(${v(As, A)})(${v(d, L)} − kd)`, S`kd = ${u(x, L)}`, 'wsd.theory');
    rec.add('Cracked moment of inertia',
      cs.flanged ? S`Icr = bf · kd³ / 3 − (bf − bw)(kd − hf)³ / 3 + n · As · (d − kd)²` : doubly ? S`Icr = b · kd³ / 3 + (${W.compSteel}n − 1) · A's · (kd − d')² + n · As · (d − kd)²` : S`Icr = b · kd³ / 3 + n · As · (d − kd)²`,
      S`kd = ${u(x, L)}, d − kd = ${u(d - x, L)}`, S`Icr = ${u(Icr, 'inertia')}`, 'wsd.theory');
    const fcS = Mu * x / Icr, fsS = n * Mu * (d - x) / Icr, fcA = W.fcAllow * fc, fsA = W.fsAllow(fy);
    rec.add('Concrete compressive stress', S`fc = M · kd / Icr`, S`fc = (${Nmm(Mdem)})(${v(x, L)}) / ${v(Icr, 'inertia')}`, S`fc = ${u(fcS, ST)}  (allowable ${W.fcAllow} f'c = ${u(fcA, ST)})`, 'wsd.concrete');
    rec.add('Steel tensile stress', S`fs = n · M · (d − kd) / Icr`, S`fs = ${n} (${Nmm(Mdem)})(${v(d - x, L)}) / ${v(Icr, 'inertia')}`, S`fs = ${u(fsS, ST)}  (allowable ${u(fsA, ST)})`, 'wsd.steel',
      'Allowable steel stress is ' + W.fsLow + ' MPa for Grade 280 and ' + W.fsHigh + ' MPa for Grade ' + W.fsBreak + ' or greater.');
    let Mall = Math.min(fcA * Icr / x, fsA * Icr / (n * (d - x)));
    out.checks.push(check('Concrete stress', ['fc', fcS, ST], ['allowable', fcA, ST], fcS / fcA, 'wsd.concrete'));
    out.checks.push(check('Steel stress', ['fs', fsS, ST], ['allowable', fsA, ST], fsS / fsA, 'wsd.steel'));
    Object.assign(vals, { As, Asp, Ec, nExact, n, kd: x, Icr, fc: fcS, fs: fsS, fcAllow: fcA, fsAllow: fsA, dcConc: fcS / fcA, dcSteel: fsS / fsA });
    if (doubly) {
      const fsp = W.compSteel * n * fcS * (x - dp) / x;
      rec.add('Compression steel stress', S`f's = ${W.compSteel} · n · fc · (kd − d') / kd`, S`f's = ${W.compSteel} · ${n} · ${v(fcS, ST)} · (${v(x, L)} − ${v(dp, L)}) / ${v(x, L)}`, S`f's = ${u(fsp, ST)}  (not more than ${u(fsA, ST)})`, 'wsd.compSteel');
      if (fsp > 0) { out.checks.push(check('Compression steel stress', ["f's", fsp, ST], ['allowable', fsA, ST], fsp / fsA, 'wsd.compSteel')); Mall = Math.min(Mall, Mdem * 1e6 * fsA / fsp); }
      else out.notes.push('The compression steel lies below the neutral axis, so it is not in compression.');
      vals.fsp = fsp;
    }
    rec.add('Allowable moment', S`M allowable = lesser of ${W.fcAllow} f'c · Icr / kd and fs,allow · Icr / (n (d − kd))`,
      S`M allowable = lesser of ${v(fcA * Icr / x / 1e6, M)} and ${v(fsA * Icr / (n * (d - x)) / 1e6, M)}`, S`M allowable = ${u(Mall / 1e6, M)}`, 'wsd.general',
      'Load factors and φ are taken as ' + W.loadFactor + ' in the alternate design method.');
    vals.Mallow = Mall / 1e6;
    out.results = [res('n', n), res('kd', x, L), res('Icr', Icr, 'inertia'), res('fc', fcS, ST), res('fs', fsS, ST), res('M allowable', Mall / 1e6, M)];
    Object.assign(dia, { c: x, a: x, fcS, fsS, n });
    return finish();
  }

  // ================================================================ USD helpers
  const analyze = (AsT, AspT) => (flangedMode ? flexuralStrengthFlanged({ bf, hf, bw: b, d, As: AsT, fc, fy }, ed)
    : doubly ? flexuralStrengthDoubly({ b, d, dp, As: AsT, Asp: AspT, fc, fy }, ed) : flexuralStrengthRect({ b, d, As: AsT, fc, fy }, ed));

  // Required tension steel for Mu (used by Design and by the minimum steel waiver).
  function required() {
    if (flangedMode) {
      const r = requiredSteelRect({ b: bf, d, fc, fy, Mu }, ed);
      if (r.ok && r.a <= hf) return Object.assign(r, { caseT: 'rect' });
      const Cf = C.sb * fc * (bf - b) * hf, Asf = Cf / fy, Mnf = Cf * (d - hf / 2);
      let phi = C.designAssume.phi, o = null;
      for (let i = 0; i < 20; i++) {
        const Mw = Mu / phi - Mnf, Rn = Mw / (b * d * d), rho = rhoFromRn(Rn, fc, fy, C.sb);
        if (!isFinite(rho) || Mw <= 0) return { ok: false };
        const Asw = rho * b * d, s = flexuralStrengthFlanged({ bf, hf, bw: b, d, As: Asf + Asw, fc, fy }, ed);
        o = { ok: true, caseT: 'flanged', Cf, Asf, Mnf, Mw, Rn, rho, Asw, As: Asf + Asw, a: s.a, c: s.c, et: s.et, phi, phiNew: s.phi };
        if (Math.abs(s.phi - phi) < 1e-10) break;
        phi = s.phi;
      }
      if (o.et < C.etMinBeam || Math.abs(o.phiNew - o.phi) > 1e-4) o.ok = false;
      return o;
    }
    return requiredSteelRect({ b, d, fc, fy, Mu }, ed);
  }

  // One row of the bar options table.
  function barOptions(AsUse, AspFixed) {
    const cover = C.designAssume.cover, stir = C.designAssume.stirrup;
    const rows = C.bars.map((size) => {
      const ab = barArea(1, size), n = Math.max(2, Math.ceil(AsUse / ab - 1e-9)), area = n * ab;
      const clear = (b - 2 * cover - 2 * stir - n * size) / (n - 1);
      const s = analyze(area, AspFixed), pMn = s.phi * s.Mn;
      return { size, n, area, clear, fits: clear >= Math.max(C.barClearMin, size), fitsSource: clear >= Math.max(C.barClearMinSource, size), phiMn: pMn / 1e6, dc: Mu / pMn, et: s.et };
    });
    const ok = rows.filter((r) => r.fits && r.dc <= 1 && r.et >= C.etMinBeam);
    const best = ok.length ? ok.reduce((m, r) => (r.area < m.area ? r : m)) : null;
    return { rows, best };
  }
  const optionTable = (opt) => ({
    title: 'Bar options (one layer, ' + C.designAssume.cover + ' mm cover, ' + C.designAssume.stirrup + ' mm stirrup)',
    head: ['Bars', 'As', 'Clear spacing', 'Fits one layer', 'φMn', 'D/C', ''],
    rows: opt.rows.map((r) => ({ hl: r === opt.best, cells: [r.n + ' - ' + r.size + ' mm', u(r.area, A), u(r.clear, L),
      r.fits ? 'Yes' : r.fitsSource ? 'fits ' + ed.sources.concrete + ' (' + C.barClearMinSource + ' mm) only' : 'No', u(r.phiMn, M), dc(r.dc), r === opt.best ? 'Suggested' : (r.et < C.etMinBeam ? 'εt below ' + C.etMinBeam : '')] })),
    note: 'Clear spacing must be at least the greatest of ' + C.barClearMin + ' mm and the bar diameter (the (4/3) × aggregate size rule is not checked here). The suggested option is the lightest one that fits in one layer.'
  });

  // Steps and checks of an analysis, shared by Analyze and by the confirmation run of Design.
  function report(s, AsT, AspT, label) {
    const k85 = C.sb;
    rec.add('Stress block factor', S`β1 = ${C.beta1Data.max} for f'c ≤ ${si(C.beta1Data.fcLow, ST)}, less ${C.beta1Data.drop} per ${si(C.beta1Data.per, ST)} above, not below ${C.beta1Data.min}`, S`f'c = ${u(fc, ST)}`, S`β1 = ${s.beta1}`, 'flexure.beta1');
    if (doubly) {
      rec.add('Neutral axis, assuming both steels yield', S`c = [As · fy − A's (fy − ${k85} f'c)] / (${k85} · f'c · b · β1)`,
        S`c = [(${v(AsT, A)})(${v(fy, ST)}) − (${v(AspT, A)})(${v(fy, ST)} − ${k85} · ${v(fc, ST)})] / (${k85} · ${v(fc, ST)} · ${v(b, L)} · ${s.beta1})`, S`c = ${u(s.c0, L)}`, 'flexure.stressBlock', 'The concrete displaced by the compression steel is deducted.');
      rec.add('Compression steel strain', S`ε's = ${C.ecu} (c − d') / c`, S`ε's = ${C.ecu} (${v(s.c0, L)} − ${v(dp, L)}) / ${v(s.c0, L)} = ${s.esp0}`,
        s.compYields && s.yields ? S`ε's ≥ εty = ${s.ety}, so f's = fy = ${u(fy, ST)}` : S`c = ${u(s.c, L)}, ε's = ${s.esp}, f's = ${u(s.fsp, ST)}`, 'flexure.strain',
        s.compYields && s.yields ? 'Compression steel yields.' : !s.yields ? 'The tension steel does not yield, so c was solved from equilibrium with both steel stresses taken from strain.'
          : "Compression steel does not yield, so c was re-solved from " + k85 + " f'c b β1 c² + [A's (Es · " + C.ecu + " − " + k85 + " f'c) − As fy] c − A's Es · " + C.ecu + " · d' = 0, with f's = Es ε's.");
      if (s.c <= dp) out.notes.push('The neutral axis is at or above the compression steel (c ≤ d\'), so that steel is in tension or ineffective. Its stress is taken from strain.');
      rec.add('Depth of stress block', S`a = β1 · c`, S`a = ${s.beta1} · ${v(s.c, L)}`, S`a = ${u(s.a, L)}`, 'flexure.stressBlock');
    } else if (flangedMode) {
      rec.add('Depth of stress block, flange width', S`a = As · fy / (${k85} · f'c · bf)`, S`a = (${v(AsT, A)})(${v(fy, ST)}) / (${k85} · ${v(fc, ST)} · ${v(bf, L)})`, S`a = ${u(s.aRect, L)}`, 'flexure.stressBlock',
        s.aRect <= hf ? 'a ≤ hf: rectangular behavior with width bf.' + (s.flanged ? ' After the strain check the block extends into the web.' : '') : 'a > hf: the stress block extends into the web, so the flange and web are treated separately.');
      if (s.flanged) {
        rec.add('Flange and web compression', S`Cf = ${k85} · f'c · (bf − bw) · hf;  a = (As · fy − Cf) / (${k85} · f'c · bw)`,
          S`Cf = ${k85} · ${v(fc, ST)} · (${v(bf, L)} − ${v(b, L)}) · ${v(hf, L)} = ${u(s.Cf / 1e3, 'force')}`, S`a = ${u(s.a0, L)} (assuming the steel yields)`, 'flexure.stressBlock');
      }
      rec.add('Neutral axis depth', S`c = a / β1`, S`c = ${v(s.a0, L)} / ${s.beta1}`, S`c = ${u(s.c0, L)}`, 'flexure.stressBlock');
    } else {
      rec.add('Depth of stress block', S`a = As · fy / (${k85} · f'c · b)`, S`a = (${v(AsT, A)})(${v(fy, ST)}) / (${k85} · ${v(fc, ST)} · ${v(b, L)})`, S`a = ${u(s.a0, L)}`, 'flexure.stressBlock', 'Assumes the steel yields. The strain check confirms it.');
      rec.add('Neutral axis depth', S`c = a / β1`, S`c = ${v(s.a0, L)} / ${s.beta1}`, S`c = ${u(s.c0, L)}`, 'flexure.stressBlock');
    }
    const zone = zoneText(s, C);
    const cShown = doubly ? s.c : s.c0;
    rec.add('Net tensile strain', S`εt = ${C.ecu} (d − c) / c`, S`εt = ${C.ecu} (${v(d, L)} − ${v(cShown, L)}) / ${v(cShown, L)}${doubly ? '' : S` = ${s.et0}`}`,
      s.yields || doubly ? S`εt = ${s.et}` : S`εt = ${s.et}  (re-solved: c = ${u(s.c, L)}, a = ${u(s.a, L)}, fs = Es · εt = ${u(s.fs, ST)})`, 'flexure.strain',
      s.yields ? zone + ' Steel yields, fs = fy.' : 'The strain is below εty = fy / Es, so the tension steel does not yield and c was re-solved from equilibrium with fs = Es · εt. ' + zone);
    rec.add('Strength reduction factor', S`φ = ${C.phi.tied} + ${C.phi.tension - C.phi.tied} (εt − εty) / (${C.etTension} − εty), between ${C.phi.tied} and ${C.phi.tension}`, S`εty = fy / Es = ${s.ety}`, S`φ = ${s.phi}`, 'flexure.phi');
    const MnK = s.Mn / 1e6, pMn = s.phi * MnK;
    if (doubly) rec.add('Nominal moment strength', S`Cc = ${k85} · f'c · a · b;  Cs = A's (f's − ${k85} · f'c);  Mn = Cc (d − a / 2) + Cs (d − d')`,
      S`Cc = ${u(s.Cc / 1e3, 'force')}, Cs = ${u(s.Cs / 1e3, 'force')};  Mn = ${v(s.Cc / 1e3, 'force')} (${v(d, L)} − ${v(s.a, L)} / 2) + ${v(s.Cs / 1e3, 'force')} (${v(d, L)} − ${v(dp, L)})`, S`Mn = ${u(MnK, M)}`, 'flexure.Mn');
    else if (s.flanged) rec.add('Nominal moment strength', S`Mn = Cf (d − hf / 2) + ${k85} · f'c · bw · a · (d − a / 2)`,
      S`Mn = ${v(s.Cf / 1e3, 'force')} (${v(d, L)} − ${v(hf, L)} / 2) + ${v(s.Cw / 1e3, 'force')} (${v(d, L)} − ${v(s.a, L)} / 2)`, S`Mn = ${u(MnK, M)}  (total compression ${u(s.C / 1e3, 'force')} = As · fs)`, 'flexure.Mn');
    else rec.add('Nominal moment strength', S`Mn = As · fs · (d − a / 2)`, S`Mn = (${v(AsT, A)})(${v(s.fs, ST)})(${v(d, L)} − ${v(s.a, L)} / 2)`, S`Mn = ${u(MnK, M)}`, 'flexure.Mn');
    rec.add('Design strength against demand', S`φMn ≥ Mu`, S`φMn = ${s.phi} · ${v(MnK, M)} = ${u(pMn, M)}`, S`Mu / φMn = ${v(Mdem, M)} / ${v(pMn, M)} = ${dc(Mdem / pMn)}`, 'flexure.strength');
    out.checks.push(check('Flexural strength' + (label || ''), ['Mu', Mdem, M], ['φMn', pMn, M], Mdem / pMn, 'flexure.strength'));
    out.checks.push(check('Ductility, εt ≥ ' + C.etMinBeam, ['limit', C.etMinBeam, 'strain'], ['εt', s.et, 'strain'], C.etMinBeam / s.et, 'flexure.ductility'));
    Object.assign(vals, { beta1: s.beta1, a0: s.a0, c0: s.c0, et0: s.et0, a: s.a, c: s.c, et: s.et, fs: s.fs, yields: s.yields, phi: s.phi, Mn: MnK, phiMn: pMn, dcFlex: Mdem / pMn, dcDuct: C.etMinBeam / s.et,
      Ctotal: s.C / 1e3, Ttotal: s.T / 1e3, flanged: !!s.flanged });
    if (doubly) Object.assign(vals, { esp: s.esp, fsp: s.fsp, compYields: s.compYields, Cc: s.Cc / 1e3, Cs: s.Cs / 1e3 });
    if (flangedMode) Object.assign(vals, { aRect: s.aRect, Cf: s.Cf / 1e3 });
    Object.assign(dia, { c: s.c, a: s.a, et: s.et, fs: s.fs, esp: doubly ? s.esp : null, flanged: !!s.flanged });
    return pMn;
  }

  // ================================================================ USD analyze
  if (task === 'analyze') {
    dia.chips.push(S`${nb} - ${db} mm bars${doubly ? ', ' + nbp + ' - ' + dbp + ' mm top' : ''}`);
    barStep('Steel area', 'As', nb, db, As);
    if (doubly) barStep('Compression steel area', "A's", nbp, dbp, Asp);
    vals.As = As; vals.Asp = Asp;
    const s = analyze(As, Asp);
    const pMn = report(s, As, Asp);
    asMinStep(AsMin, r1, r2, b);
    const rq = required();
    const AsReq = rq && rq.ok ? rq.As : NaN;
    vals.AsReq = AsReq;
    const waived = As < AsMin && isFinite(AsReq) && As >= C.asMinBeam.waiver * AsReq;
    if (waived) {
      rec.add('Minimum steel waiver', S`As,min need not be met if As ≥ (4/3) As required`, S`(4/3) As required = (4/3)(${v(AsReq, A)}) = ${u(C.asMinBeam.waiver * AsReq, A)}`, S`As = ${u(As, A)} ≥ ${u(C.asMinBeam.waiver * AsReq, A)}`, 'flexure.minSteelWaiver');
      out.checks.splice(1, 0, check('Minimum steel', ['(4/3) As,req', C.asMinBeam.waiver * AsReq, A], ['As', As, A], C.asMinBeam.waiver * AsReq / As, 'flexure.minSteelWaiver', { note: 'waived by ' + ed.clauses['flexure.minSteelWaiver'].nscp }));
    } else out.checks.splice(1, 0, check('Minimum steel', ['As,min', AsMin, A], ['As', As, A], AsMin / As, 'flexure.minSteel'));
    vals.dcMin = AsMin / As; vals.waived = waived;
    out.results = [res('As', As, A), res('a', s.a, L), res('c', s.c, L), res('εt', s.et, 'strain'), res('φ', s.phi), res('φMn', pMn, M)];
    if (doubly) out.results.splice(1, 0, res("f's", s.fsp, ST));
    return finish();
  }

  // ================================================================ USD design
  const phi0 = C.designAssume.phi;
  if (doubly) {
    // Largest singly reinforced strength at the tension-controlled limit.
    const beta1 = C.beta1(fc), rhoMax = C.sb * beta1 * (fc / fy) * (C.ecu / (C.ecu + C.etTension));
    const As1 = rhoMax * b * d, a1 = As1 * fy / (C.sb * fc * b), Mn1 = As1 * fy * (d - a1 / 2);
    rec.add('Largest singly reinforced steel at εt = ' + C.etTension, S`ρmax = ${C.sb} · β1 · (f'c / fy) · ${C.ecu} / (${C.ecu} + ${C.etTension});  As1 = ρmax · b · d`,
      S`ρmax = ${C.sb} · ${beta1} · (${v(fc, ST)} / ${v(fy, ST)}) · ${C.ecu / (C.ecu + C.etTension)} = ${rhoMax}`, S`As1 = ${u(As1, A)}`, 'flexure.strain');
    rec.add('Strength of the singly reinforced part', S`a1 = As1 · fy / (${C.sb} · f'c · b);  Mn1 = As1 · fy · (d − a1 / 2)`, S`a1 = ${u(a1, L)}`, S`Mn1 = ${u(Mn1 / 1e6, M)},  φMn1 = ${phi0} · ${v(Mn1 / 1e6, M)} = ${u(phi0 * Mn1 / 1e6, M)}`, 'flexure.Mn');
    Object.assign(vals, { rhoMax, As1, a1, Mn1: Mn1 / 1e6 });
    if (!positive(input, ['db', 'dbp'])) return stop('Choose the bar sizes for the tension and compression steel.');
    if (Mu <= phi0 * Mn1) {
      out.notes.push('Compression steel is not needed: Mu does not exceed φMn1 of the singly reinforced section. The singly reinforced design is shown.');
      const r = requiredSteelRect({ b, d, fc, fy, Mu }, ed);
      if (!r.ok) return stop(TOO_SMALL, dia);
      rec.add('Required steel, singly reinforced', S`Rn = Mu / (φ · b · d²);  ρ = (${C.sb} f'c / fy) [1 − √(1 − 2 Rn / (${C.sb} f'c))]`, S`Rn = ${u(r.Rn, ST)}, ρ = ${r.rho}`, S`As = ρ · b · d = ${u(r.As, A)}`, 'flexure.stressBlock');
      As = Math.max(r.As, Math.min(AsMin, r.As < AsMin ? C.asMinBeam.waiver * r.As : AsMin)); Asp = 0;
      Object.assign(vals, { AsReq: r.As, AspReq: 0, needsComp: false });
      asMinStep(AsMin, r1, r2, b);
    } else {
      const Mn2 = Mu / phi0 - Mn1, c = a1 / beta1, fsp = Math.min(fy, C.Es * C.ecu * (c - dp) / c);
      if (fsp - C.sb * fc <= 0) return stop("The compression steel is too close to the neutral axis to be effective. Reduce d' or enlarge the section.", dia);
      const AspReq = Mn2 / ((fsp - C.sb * fc) * (d - dp)), AsReq = As1 + AspReq * (fsp - C.sb * fc) / fy;
      rec.add('Moment for the compression steel couple', S`Mn2 = Mu / φ − Mn1`, S`Mn2 = ${v(Mdem, M)} / ${phi0} − ${v(Mn1 / 1e6, M)}`, S`Mn2 = ${u(Mn2 / 1e6, M)}`, 'flexure.Mn');
      rec.add('Compression steel stress', S`c = a1 / β1;  f's = lesser of fy and Es · ${C.ecu} (c − d') / c`, S`c = ${u(c, L)};  f's = lesser of ${v(fy, ST)} and ${v(C.Es * C.ecu * (c - dp) / c, ST)}`, S`f's = ${u(fsp, ST)}`, 'flexure.strain');
      rec.add('Required steel areas', S`A's = Mn2 / [(f's − ${C.sb} f'c)(d − d')];  As = As1 + A's (f's − ${C.sb} f'c) / fy`,
        S`A's = (${Nmm(Mn2 / 1e6)}) / [(${v(fsp, ST)} − ${C.sb} · ${v(fc, ST)})(${v(d, L)} − ${v(dp, L)})]`, S`A's = ${u(AspReq, A)},  As = ${u(AsReq, A)}`, 'flexure.Mn');
      As = AsReq; Asp = AspReq;
      Object.assign(vals, { Mn2: Mn2 / 1e6, cDesign: c, fspDesign: fsp, AsReq, AspReq, needsComp: true });
    }
    nb = Math.max(2, Math.ceil(As / barArea(1, db) - 1e-9));
    nbp = Asp > 0 ? Math.max(2, Math.ceil(Asp / barArea(1, dbp) - 1e-9)) : 2;
    const AsT = barArea(nb, db), AspT = barArea(nbp, dbp);
    rec.add('Chosen bars', S`n = As required / Ab, rounded up (at least 2 bars)`, S`tension: ${v(As, A)} / ${v(barArea(1, db), A)};  compression: ${v(Asp, A)} / ${v(barArea(1, dbp), A)}`,
      S`${nb} - ${db} mm (${u(AsT, A)}) and ${nbp} - ${dbp} mm (${u(AspT, A)})`, 'basic.barArea', 'The section is now analyzed with these bars to confirm the design.');
    Object.assign(dia, { n: nb, db, np: nbp, dbp });
    dia.chips.push(S`${nb} - ${db} mm bars, ${nbp} - ${dbp} mm top`);
    Object.assign(vals, { n: nb, np: nbp, As: AsT, Asp: AspT });
    const s = analyze(AsT, AspT), pMn = report(s, AsT, AspT, ' (chosen bars)');
    out.results = [res('As required', As, A), res("A's required", Asp, A), res('Tension bars', nb + ' - ' + db + ' mm', 'text'), res('Compression bars', nbp + ' - ' + dbp + ' mm', 'text'), res('εt', s.et, 'strain'), res('φMn', pMn, M)];
    return finish();
  }

  // Singly and flanged design
  const rq = required();
  if (!rq || !rq.ok) return stop(flangedMode ? 'The section is too small for this moment. Increase the web width or the depth.' : TOO_SMALL, dia);
  if (rq.caseT === 'flanged') {
    rec.add('Flange part', S`Cf = ${C.sb} · f'c · (bf − bw) · hf;  Asf = Cf / fy;  Mnf = Cf (d − hf / 2)`, S`Cf = ${u(rq.Cf / 1e3, 'force')}`, S`Asf = ${u(rq.Asf, A)},  Mnf = ${u(rq.Mnf / 1e6, M)}`, 'flexure.stressBlock', 'With the full flange width the stress block would be deeper than hf, so the web is designed for the rest of the moment.');
    rec.add('Web part', S`Rn = (Mu / φ − Mnf) / (bw · d²);  ρw = (${C.sb} f'c / fy) [1 − √(1 − 2 Rn / (${C.sb} f'c))]`, S`Rn = (${Nmm(rq.Mw / 1e6)}) / (${v(b, L)} · ${v(d, L)}²) = ${u(rq.Rn, ST)}`, S`ρw = ${rq.rho},  Asw = ρw · bw · d = ${u(rq.Asw, A)}`, 'flexure.stressBlock');
    rec.add('Required steel area', S`As = Asf + Asw`, S`As = ${v(rq.Asf, A)} + ${v(rq.Asw, A)}`, S`As = ${u(rq.As, A)}`, 'flexure.Mn');
  } else {
    const width = flangedMode ? bf : b, f = rq.first || rq;
    rec.add('Required strength coefficient', S`Rn = Mu / (φ · ${flangedMode ? 'bf' : 'b'} · d²)`, S`Rn = (${Nmm(Mdem)}) / (${phi0} · ${v(width, L)} · ${v(d, L)}²)`, S`Rn = ${u(f.Rn, ST)}`, 'flexure.strength', 'φ = ' + phi0 + ' is assumed and confirmed below.');
    rec.add('Required steel ratio', S`ρ = (${C.sb} f'c / fy) [1 − √(1 − 2 Rn / (${C.sb} f'c))]`, S`ρ = (${C.sb} · ${v(fc, ST)} / ${v(fy, ST)}) [1 − √(1 − 2 · ${v(f.Rn, ST)} / (${C.sb} · ${v(fc, ST)}))]`, S`ρ = ${f.rho}`, 'flexure.stressBlock');
    rec.add('Required steel area', S`As = ρ · ${flangedMode ? 'bf' : 'b'} · d`, S`As = ${f.rho} · ${v(width, L)} · ${v(d, L)}`, S`As = ${u(f.As, A)}`, 'flexure.stressBlock');
    rec.add('Strain check for the required steel', S`a = As · fy / (${C.sb} · f'c · ${flangedMode ? 'bf' : 'b'});  c = a / β1;  εt = ${C.ecu} (d − c) / c`, S`a = ${u(f.a, L)}, c = ${u(f.c, L)}`,
      f.et >= C.etTension ? S`εt = ${f.et}` : S`εt = ${f.et};  iterated: As = ${u(rq.As, A)}, εt = ${rq.et}, φ = ${rq.phi}`, 'flexure.strain',
      f.et >= C.etTension ? 'εt is not less than the tension-controlled limit, so the assumed φ holds.' + (flangedMode ? ' a ≤ hf, so the section acts as a rectangle of width bf.' : '')
        : 'εt is below the tension-controlled limit, so φ is less than assumed. As was iterated until φMn = Mu.');
  }
  asMinStep(AsMin, r1, r2, b);
  let AsUse = rq.As, useNote = 'As required governs.';
  if (rq.As < AsMin) {
    const w43 = C.asMinBeam.waiver * rq.As;
    AsUse = Math.min(AsMin, w43);
    useNote = w43 < AsMin ? 'The 4/3 waiver governs: (4/3) As required is less than As,min.' : 'As,min governs.';
  }
  rec.add('Steel area to use', S`As to use = greater of As required and As,min, but (4/3) As required is enough`, S`As required = ${u(rq.As, A)}, As,min = ${u(AsMin, A)}, (4/3) As required = ${u(C.asMinBeam.waiver * rq.As, A)}`, S`As to use = ${u(AsUse, A)}`, rq.As < AsMin && AsUse < AsMin ? 'flexure.minSteelWaiver' : 'flexure.minSteel', useNote);
  const opt = barOptions(AsUse, 0);
  dia.tables = [optionTable(opt)];
  rec.add('Bar options', S`For each bar size: smallest n with n · Ab ≥ As to use (at least 2 bars); clear spacing = (b − 2 · cover − 2 · stirrup − n · db) / (n − 1)`,
    S`cover = ${u(C.designAssume.cover, L)}, stirrup = ${u(C.designAssume.stirrup, L)}, minimum clear spacing = greatest of ${u(C.barClearMin, L)} and db`,
    opt.best ? S`Suggested: ${opt.best.n} - ${opt.best.size} mm, As = ${u(opt.best.area, A)}, clear spacing ${u(opt.best.clear, L)}` : S`No bar size fits in one layer.`, 'detail.barSpacing');
  Object.assign(vals, { Rn: (rq.first || rq).Rn, rho: (rq.first || rq).rho, AsReq: rq.As, a: rq.a, c: rq.c, et: rq.et, phi: rq.phi, AsUse, options: opt.rows, suggested: opt.best ? opt.best.n + '-' + opt.best.size : null });
  if (rq.first) Object.assign(vals, { Rn0: rq.first.Rn, rho0: rq.first.rho, AsReq0: rq.first.As });
  out.results = [res('Rn', (rq.first || rq).Rn, ST), res('ρ', (rq.first || rq).rho), res('As required', rq.As, A), res('As,min', AsMin, A), res('As to use', AsUse, A), res('Suggested bars', opt.best ? opt.best.n + ' - ' + opt.best.size + ' mm' : 'none fits in one layer', 'text')];
  if (opt.best) {
    Object.assign(dia, { n: opt.best.n, db: opt.best.size });
    dia.chips.push(S`${opt.best.n} - ${opt.best.size} mm bars (suggested)`);
    const s = analyze(opt.best.area, 0);
    Object.assign(dia, { c: s.c, a: s.a, et: s.et, fs: s.fs, flanged: !!s.flanged });
    out.checks.push(check('Flexural strength (suggested bars)', ['Mu', Mdem, M], ['φMn', opt.best.phiMn, M], opt.best.dc, 'flexure.strength'));
    out.checks.push(check('Minimum steel', ['As to use', AsUse, A], ['As', opt.best.area, A], AsUse / opt.best.area, AsUse < AsMin ? 'flexure.minSteelWaiver' : 'flexure.minSteel'));
    out.checks.push(check('Ductility, εt ≥ ' + C.etMinBeam, ['limit', C.etMinBeam, 'strain'], ['εt', s.et, 'strain'], C.etMinBeam / s.et, 'flexure.ductility'));
    out.checks.push(check('Clear bar spacing', ['minimum', Math.max(C.barClearMin, opt.best.size), L], ['clear spacing', opt.best.clear, L], Math.max(C.barClearMin, opt.best.size) / opt.best.clear, 'detail.barSpacing'));
  } else {
    Object.assign(dia, { n: 0, c: rq.c, a: rq.a, et: rq.et, fs: fy });
    out.warnings.push('No bar size fits in one layer at ' + C.barClearMin + ' mm clear spacing. Widen the beam or place the bars in two layers and reduce d.');
    out.checks.push(check('Ductility, εt ≥ ' + C.etMinBeam, ['limit', C.etMinBeam, 'strain'], ['εt', rq.et, 'strain'], C.etMinBeam / rq.et, 'flexure.ductility'));
  }
  return finish();
}
