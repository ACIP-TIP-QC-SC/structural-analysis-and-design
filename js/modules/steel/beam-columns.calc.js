// Steel beam-columns: interaction of axial force and flexure, and B1 and B2 amplification. Pure calculation.
// Units: mm, mm², MPa, kN, kN·m.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { gradeOf, available } from './common.js';
import { compressiveStrength, compressionLocal } from './compression.calc.js';
import { flexuralStrengthI, flexuralStrengthMinor, flexureLocal, WEB_OUT } from './beams.calc.js';

const L = 'length_mm', ST = 'stress', F = 'force', M = 'moment', I = 'inertia';

// Interaction value (clause keys bc.eqA and bc.eqB).
export function interactionValue(Pr, Pc, Mrx, Mcx, Mry, Mcy, ed) {
  const K = ed.steel.interaction, r = Pr / Pc, m = Mrx / Mcx + (Mcy > 0 ? Mry / Mcy : 0);
  return r >= K.break ? { eq: 'a', ratio: r, value: r + K.k * m } : { eq: 'b', ratio: r, value: r / K.half + m };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, SE = ed.steel, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD', asd = method === 'ASD';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const done = () => { out.steps = rec.steps; out.verdict = verdictOf(out.checks); return { vals, result: out }; };
  const A = SE.amplification, alpha = A.alpha[method], E = SE.E;

  if (input.mode === 'amplify') {
    const Ib = input.axis === 'minor' ? input.Iy : input.Ix;
    if (!(Ib > 0) || !positive(input, ['K1L']) || !(input.Pnt >= 0) || !(input.Plt >= 0)) return stop('Give I about the axis of bending, K1 L and the axial loads.');
    const Pr = input.Pnt + input.Plt, Pe1 = Math.PI * Math.PI * E * Ib / Math.pow(input.K1L, 2) / 1e3;
    rec.add('Elastic buckling strength without sway', S`Pe1 = π² E I / (K1 L)²,  I about the ${input.axis === 'minor' ? 'minor' : 'major'} axis`, S`Pe1 = π² · ${v(E, ST)} · ${v(Ib, I)} / (${v(input.K1L, L)})²`, S`Pe1 = ${u(Pe1, F)}`, 'bc.Pe1', 'K1 = 1.0 unless analysis shows a smaller value.');
    let B1, Cm = null;
    if (input.b1From === 'typed') {
      B1 = input.B1;
      if (!(B1 >= 1)) return stop('A typed B1 must be at least 1.0.');
      rec.add('Amplifier B1 (typed)', null, null, S`B1 = ${B1}`, 'bc.B1');
    } else {
      if (input.cmFrom === 'transverse') Cm = A.Cm.transverse;
      else if (input.cmFrom === 'typed') Cm = input.Cm;
      else {
        if (!(input.M2 > 0) || !(input.M1 >= 0)) return stop('Give the end moments M1 and M2 for Cm.');
        const ratio = (input.curvature === 'reverse' ? 1 : -1) * Math.min(input.M1, input.M2) / input.M2;
        Cm = A.Cm.a - A.Cm.b * ratio;
        rec.add('Equivalent uniform moment factor', S`Cm = ${A.Cm.a} − ${A.Cm.b} (M1 / M2),  M1/M2 positive in reverse curvature`, S`M1 / M2 = ${ratio}`, S`Cm = ${Cm}`, 'bc.Cm');
      }
      if (!(Cm > 0)) return stop('Give Cm.');
      if (input.cmFrom !== 'moments') rec.add('Equivalent uniform moment factor', input.cmFrom === 'transverse' ? S`Cm = ${A.Cm.transverse} with transverse loading (conservative)` : S`Cm typed`, null, S`Cm = ${Cm}`, 'bc.Cm');
      if (alpha * Pr >= Pe1) return stop('α Pr reaches Pe1: the member buckles without sway. Enlarge the section.');
      B1 = Math.max(1, Cm / (1 - alpha * Pr / Pe1));
      rec.add('Amplifier B1', S`B1 = Cm / (1 − α Pr / Pe1) ≥ 1.0,  α = ${alpha} (${method}),  Pr = Pnt + Plt`, S`B1 = ${Cm} / (1 − ${alpha} · ${v(Pr, F)} / ${v(Pe1, F)})`, S`B1 = ${B1}`, 'bc.B1');
    }
    let B2 = 1, Pe2 = null;
    if (input.sway) {
      if (input.pe2From === 'typed') {
        Pe2 = input.SPe2;
        if (!(Pe2 > 0)) return stop('Give ΣPe2.');
        rec.add('Elastic storey buckling strength (typed)', S`ΣPe2 = Σ π² E I / (K2 L)²`, null, S`ΣPe2 = ${u(Pe2, F)}`, 'bc.Pe2');
      } else {
        if (!positive(input, ['SH', 'dH', 'Lst'])) return stop('Give ΣH, ΔH and the storey height for ΣPe2.');
        const RM = input.frame === 'braced' ? A.RM.braced : A.RM.moment;
        Pe2 = RM * input.SH * input.Lst / input.dH;
        rec.add('Elastic storey buckling strength', S`ΣPe2 = RM ΣH L / ΔH,  RM = ${A.RM.braced} braced frames, ${A.RM.moment} moment frames`, S`ΣPe2 = ${RM} · ${v(input.SH, F)} · ${v(input.Lst, L)} / ${v(input.dH, L)}`, S`ΣPe2 = ${u(Pe2, F)}`, 'bc.Pe2');
      }
      if (!(input.SPnt > 0)) return stop('Give ΣPnt, the total gravity load on the storey.');
      if (alpha * input.SPnt >= Pe2) return stop('α ΣPnt reaches ΣPe2: the storey is unstable. Stiffen the frame.');
      B2 = Math.max(1, 1 / (1 - alpha * input.SPnt / Pe2));
      rec.add('Amplifier B2', S`B2 = 1 / (1 − α ΣPnt / ΣPe2) ≥ 1.0`, S`B2 = 1 / (1 − ${alpha} · ${v(input.SPnt, F)} / ${v(Pe2, F)})`, S`B2 = ${B2}`, 'bc.B2');
    }
    const Mnt = input.Mnt > 0 ? input.Mnt : 0, Mlt = input.Mlt > 0 ? input.Mlt : 0, Mr = B1 * Mnt + B2 * Mlt, PrOut = input.Pnt + B2 * input.Plt;
    rec.add('Required strengths', S`Mr = B1 Mnt + B2 Mlt;  Pr = Pnt + B2 Plt`, S`Mr = ${B1} · ${v(Mnt, M)} + ${B2} · ${v(Mlt, M)};  Pr = ${v(input.Pnt, F)} + ${B2} · ${v(input.Plt, F)}`, S`Mr = ${u(Mr, M)},  Pr = ${u(PrOut, F)}`, 'bc.Mr');
    Object.assign(vals, { Pe1, Cm, B1, SPe2: Pe2, B2, Mr, Pr: PrOut });
    out.results = [res('Pe1', Pe1, F), res('B1', B1), res('B2', B2), res('Mr', Mr, M), res('Pr', PrOut, F)];
    if (Cm != null) out.results.splice(1, 0, res('Cm', Cm));
    out.send = [{ to: 'steel/beam-columns', mode: 'interaction', label: 'Use Pr and Mr in the Interaction mode', values: { Pr: PrOut, Mrx: Mr } }];
    out.diagram = { kind: 'amplify', B1, B2, sway: !!input.sway, chips: [[method], S`B1 = ${B1}, B2 = ${B2}`] };
    return done();
  }

  const { Fy, label } = gradeOf(input, ed);
  const need = ['Ag', 'rx', 'ry', 'bf2tf', 'htw', 'Zx', 'Sx', 'J', 'rts', 'ho', 'Zy', 'Sy', 'Kx', 'Lx', 'Ky', 'Ly', 'Lb', 'Cb'];
  if (!(Fy > 0) || !positive(input, need) || !(input.Pr >= 0) || !(input.Mrx >= 0) || !(input.Mry >= 0)) return stop('Every section property, length and required strength needs a number (moments may be 0).');
  out.diagram = { kind: 'section', dsec: input.dsec, bf: input.bf, tf: input.tf, tw: input.tw, chips: [[label + ': '].concat(S`Fy = ${u(Fy, ST)}`), S`KLx = ${u(input.Kx * input.Lx, L)}, KLy = ${u(input.Ky * input.Ly, L)}, Lb = ${u(input.Lb, L)}`] };
  const cl = compressionLocal({ Fy, bf2tf: input.bf2tf, htw: input.htw }, ed);
  if (cl.slender) return stop(SE.compression.slenderMessage);
  const fl = flexureLocal({ Fy, bf2tf: input.bf2tf, htw: input.htw }, ed);
  if (fl.web !== 'compact') return stop(WEB_OUT);
  if (fl.flange === 'slender') return stop('Sections with slender flanges are outside this calculator.');
  const cs = compressiveStrength({ Ag: input.Ag, rx: input.rx, ry: input.ry, Fy, Kx: input.Kx, Lx: input.Lx, Ky: input.Ky, Ly: input.Ly }, ed);
  const Pn = cs.Pn / 1e3, Pc = available(Pn, SE.compression, method);
  rec.add('Available axial strength', S`KL/r = ${cs.klr} (${cs.axis} axis);  Fe = π² E / (KL/r)²;  Fcr ${cs.inelastic ? S`= ${SE.compression.inelastic}^(Fy/Fe) Fy` : S`= ${SE.compression.elastic} Fe`};  Pn = Fcr Ag`,
    S`Fe = ${u(cs.Fe, ST)},  Fcr = ${u(cs.Fcr, ST)},  Pn = ${u(Pn, F)}`, asd ? S`Pc = Pn / ${SE.compression.omega} = ${u(Pc, F)}` : S`Pc = ${SE.compression.phi} Pn = ${u(Pc, F)}`, 'steel.comp.Fcr');
  const fx = flexuralStrengthI({ Zx: input.Zx, Sx: input.Sx, ry: input.ry, J: input.J, rts: input.rts, ho: input.ho, bf2tf: input.bf2tf, htw: input.htw, Fy, Lb: input.Lb, Cb: input.Cb }, ed);
  const Mnx = fx.Mn / 1e6, Mcx = available(Mnx, SE.flexure, method);
  rec.add('Available flexural strength, major axis', S`Mp = Fy Zx = ${u(fx.Mp / 1e6, M)};  Lp = ${u(fx.Lp, L)},  Lr = ${u(fx.Lr, L)};  flange ${fl.flange}`,
    S`lateral-torsional buckling: ${fx.zone === 'yielding' ? 'yielding' : fx.zone + ' LTB'}, Mn = ${u(fx.MnLtb / 1e6, M)}${fx.MnFlb != null ? S`;  flange local buckling: Mn = ${u(fx.MnFlb / 1e6, M)}` : ''}`,
    asd ? S`Mnx = ${u(Mnx, M)};  Mcx = Mnx / ${SE.flexure.omega} = ${u(Mcx, M)}` : S`Mnx = ${u(Mnx, M)};  Mcx = ${SE.flexure.phi} Mnx = ${u(Mcx, M)}`, 'steel.flex.ltb');
  const Mny = flexuralStrengthMinor({ Fy, Zy: input.Zy, Sy: input.Sy }, ed) / 1e6, Mcy = available(Mny, SE.flexure, method);
  rec.add('Available flexural strength, minor axis', S`Mny = lesser of Fy Zy and ${SE.flexure.minorCap} Fy Sy`, S`Mny = ${u(Mny, M)}`, asd ? S`Mcy = Mny / ${SE.flexure.omega} = ${u(Mcy, M)}` : S`Mcy = ${SE.flexure.phi} Mny = ${u(Mcy, M)}`, 'steel.flex.minor');
  const iv = interactionValue(input.Pr, Pc, input.Mrx, Mcx, input.Mry, Mcy, ed), K = SE.interaction;
  rec.add('Interaction', iv.eq === 'a' ? S`Pr / Pc ≥ ${K.break}: Pr / Pc + (8/9)(Mrx / Mcx + Mry / Mcy) ≤ 1.0` : S`Pr / Pc < ${K.break}: Pr / (2 Pc) + (Mrx / Mcx + Mry / Mcy) ≤ 1.0`,
    S`Pr / Pc = ${v(input.Pr, F)} / ${v(Pc, F)} = ${iv.ratio};  Mrx / Mcx = ${v(input.Mrx, M)} / ${v(Mcx, M)};  Mry / Mcy = ${v(input.Mry, M)} / ${v(Mcy, M)}`,
    S`interaction = ${dc(iv.value)}`, iv.eq === 'a' ? 'bc.eqA' : 'bc.eqB', 'Pr, Mrx and Mry must already include second-order effects (use the B1 and B2 mode).');
  out.checks.push(check('Combined axial and flexure', ['interaction', iv.value, 'ratio'], ['limit', 1, 'ratio'], iv.value, iv.eq === 'a' ? 'bc.eqA' : 'bc.eqB', { note: iv.eq === 'a' ? 'Pr/Pc ≥ ' + ed.steel.interaction.break + ': ' + ed.clauses['bc.eqA'].nscp : 'Pr/Pc < ' + ed.steel.interaction.break + ': ' + ed.clauses['bc.eqB'].nscp }));
  Object.assign(vals, { klr: cs.klr, Fe: cs.Fe, Fcr: cs.Fcr, Pn, Lp: fx.Lp, Lr: fx.Lr, Mp: fx.Mp / 1e6, Mnx, Pc, Mcx, Mny, Mcy, ratio: iv.ratio, eq: iv.eq, interaction: iv.value, flange: fl.flange });
  out.results = [res('Pc', Pc, F), res('Mcx', Mcx, M), res('Mcy', Mcy, M), res('Pr / Pc', iv.ratio), res('Interaction', iv.value)];
  return done();
}
