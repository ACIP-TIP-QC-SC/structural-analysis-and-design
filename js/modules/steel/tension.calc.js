// Steel tension members: yielding, rupture with shear lag, and block shear. Pure calculation.
// Units: mm, mm², MPa, kN.
import { S, v, u, dc, recorder, check, verdictOf, blank, fail, res, positive } from '../../core/steps.js';
import { gradeOf, available } from './common.js';

const L = 'length_mm', A = 'area', ST = 'stress', F = 'force';

// Hole width used for net area: standard hole + the net area allowance.
export function holeWidth(bolt, ed) { return ed.steel.holeDia(bolt) + ed.steel.holeAdd; }
export function netArea(Ag, nHoles, hw, t, stagger) {
  const add = stagger && stagger.n > 0 ? stagger.n * stagger.s * stagger.s * t / (4 * stagger.g) : 0;
  return { deduct: nHoles * hw * t, add, An: Ag - nHoles * hw * t + add };
}
// Shear lag factor U (clause key steel.tension.shearLag). Returns { U, text }.
export function shearLagU(input, ed) {
  const D = ed.steel.shearLagData, row = ed.steel.shearLag.find((x) => x.value === input.Ucase) || ed.steel.shearLag[0];
  if (input.Ucase === 'typed') return { U: input.Utyped, text: 'typed value' };
  if (input.Ucase === 'case2') return { U: 1 - input.xbar / input.Lconn, text: 'U = 1 − x̄ / ℓ' };
  if (input.Ucase === 'case4') {
    const r = input.Lweld / input.wPlate, hit = D.case4.find((x) => r >= x.min);
    return { U: hit ? hit.U : NaN, text: 'ℓ / w = ' + r };
  }
  if (input.Ucase === 'case7f') {
    const wide = input.bf >= D.case7f.ratio * input.dsec;
    return { U: wide ? D.case7f.wide : D.case7f.narrow, text: wide ? 'bf ≥ (2/3) d' : 'bf < (2/3) d' };
  }
  return { U: row.U, text: '' };
}
// Block shear nominal strength, N.
export function blockShear(p, ed) {
  const k = ed.steel.blockShear.k, tens = p.Ubs * p.Fu * p.Ant, rupture = k * p.Fu * p.Anv + tens, yielding = k * p.Fy * p.Agv + tens;
  return { rupture, yielding, Rn: Math.min(rupture, yielding) };
}
// Areas of a rectangular bolt pattern (two or more lines along the load).
export function blockPattern(p, hw) {
  const Agv = 2 * (p.end + (p.nPerLine - 1) * p.pitch) * p.t;
  return { Agv, Anv: Agv - 2 * (p.nPerLine - 0.5) * hw * p.t, Ant: (p.lines - 1) * (p.gauge - hw) * p.t };
}

export function compute(input, ctx) { return run(input, ctx).vals; }
export function solve(input, ctx) { return run(input, ctx).result; }

function run(input, ctx) {
  const ed = ctx.edition, SE = ed.steel, method = ctx.method === 'ASD' ? 'ASD' : 'LRFD', dem = method === 'ASD' ? 'Pa' : 'Pu';
  const vals = {}, out = blank(), rec = recorder();
  const stop = (msg) => ({ vals: Object.assign(vals, { error: msg }), result: fail([msg], out.diagram) });
  const { Fy, Fu, label } = gradeOf(input, ed);
  if (!(Fy > 0) || !(Fu > 0)) return stop('Fy and Fu need positive numbers.');
  if (Fu < Fy) out.warnings.push('Fu is less than Fy. Check the material strengths.');
  const P = input.P;
  if (!(P >= 0)) return stop('The required strength needs a number.');
  const avail = (Rn, pair) => available(Rn, pair, method);
  const sym = (pair) => (method === 'ASD' ? S`Pn / Ω = Pn / ${pair.omega}` : S`φPn = ${pair.phi} · Pn`);

  if (input.mode === 'block') {
    const B = SE.blockShear;
    let Agv = input.Agv, Anv = input.Anv, Ant = input.Ant;
    if (input.bsFrom === 'pattern') {
      if (!positive(input, ['lines', 'nPerLine', 'pitch', 'end', 'gauge', 't', 'bolt']) || input.lines < 2) return stop('The bolt pattern needs at least two lines and positive dimensions.');
      const hw = holeWidth(input.bolt, ed), bp = blockPattern(input, hw);
      Agv = bp.Agv; Anv = bp.Anv; Ant = bp.Ant;
      rec.add('Hole width for net area', S`hole width = standard hole + ${u(SE.holeAdd, L)}`, S`M${input.bolt}: ${v(SE.holeDia(input.bolt), L)} + ${v(SE.holeAdd, L)}`, S`hole width = ${u(hw, L)}`, 'steel.holes');
      rec.add('Shear and tension areas', S`Agv = 2 (end + (n − 1) pitch) t;  Anv = Agv − 2 (n − 0.5) · hole · t;  Ant = (lines − 1)(gauge − hole) t`,
        S`Agv = 2 (${v(input.end, L)} + ${input.nPerLine - 1} · ${v(input.pitch, L)}) ${v(input.t, L)};  Anv = ${v(Agv, A)} − 2 · ${input.nPerLine - 0.5} · ${v(hw, L)} · ${v(input.t, L)};  Ant = ${input.lines - 1} (${v(input.gauge, L)} − ${v(hw, L)}) ${v(input.t, L)}`,
        S`Agv = ${u(Agv, A)},  Anv = ${u(Anv, A)},  Ant = ${u(Ant, A)}`, 'steel.tension.netArea');
      out.diagram = { kind: 'block', lines: input.lines, nPerLine: input.nPerLine, pitch: input.pitch, end: input.end, gauge: input.gauge, bolt: input.bolt, chips: [S`M${input.bolt} bolts, ${input.lines} lines of ${input.nPerLine}`, S`t = ${u(input.t, L)}`] };
    } else {
      out.diagram = { kind: 'block', chips: [S`Agv = ${u(Agv, A)}`, S`Anv = ${u(Anv, A)}`, S`Ant = ${u(Ant, A)}`] };
    }
    if (!(Agv > 0) || !(Anv > 0) || !(Ant >= 0) || !(input.Ubs > 0)) return stop('Agv, Anv and Ubs need positive numbers and Ant cannot be negative.');
    if (Anv > Agv) return stop('The net shear area Anv cannot exceed the gross shear area Agv.');
    const bs = blockShear({ Agv, Anv, Ant, Fy, Fu, Ubs: input.Ubs }, ed), Rn = bs.Rn / 1e3, Ra = avail(Rn, B);
    rec.add('Rupture on the shear plane', S`${B.k} · Fu · Anv + Ubs · Fu · Ant`, S`${B.k} · ${v(Fu, ST)} · ${v(Anv, A)} + ${input.Ubs} · ${v(Fu, ST)} · ${v(Ant, A)}`, S`= ${u(bs.rupture / 1e3, F)}`, 'steel.blockShear');
    rec.add('Yielding on the shear plane', S`${B.k} · Fy · Agv + Ubs · Fu · Ant`, S`${B.k} · ${v(Fy, ST)} · ${v(Agv, A)} + ${input.Ubs} · ${v(Fu, ST)} · ${v(Ant, A)}`, S`= ${u(bs.yielding / 1e3, F)}`, 'steel.blockShear');
    rec.add('Block shear strength', S`Rn = lesser of the two`, S`Rn = lesser of ${v(bs.rupture / 1e3, F)} and ${v(bs.yielding / 1e3, F)} = ${u(Rn, F)}`, method === 'ASD' ? S`Rn / Ω = ${v(Rn, F)} / ${B.omega} = ${u(Ra, F)}` : S`φRn = ${B.phi} · ${v(Rn, F)} = ${u(Ra, F)}`, 'steel.blockShear');
    Object.assign(vals, { Agv, Anv, Ant, rupturePath: bs.rupture / 1e3, yieldPath: bs.yielding / 1e3, Rn, LRFD: B.phi * Rn, ASD: Rn / B.omega, avail: Ra });
    out.checks.push(check('Block shear', [dem, P, F], [method === 'ASD' ? 'Rn/Ω' : 'φRn', Ra, F], P / Ra, 'steel.blockShear'));
    out.results = [res('Agv', Agv, A), res('Anv', Anv, A), res('Ant', Ant, A), res('Rn', Rn, F), res('Available strength', Ra, F)];
    out.steps = rec.steps; out.verdict = verdictOf(out.checks);
    return { vals, result: out };
  }

  // Yielding and rupture
  const Ag = input.Ag;
  if (!(Ag > 0)) return stop('Gross area Ag needs a positive number.');
  const bolted = input.conn !== 'welded';
  out.diagram = { kind: 'member', bolted, nHoles: bolted ? input.nHoles : 0, chips: [S`Ag = ${u(Ag, A)}`, [label + ': '].concat(S`Fy = ${v(Fy, ST)}, Fu = ${u(Fu, ST)}`)] };
  let An = Ag;
  if (bolted) {
    if (!positive(input, ['bolt', 't']) || !(input.nHoles >= 0)) return stop('Give the bolt size, the number of holes and the thickness of the element with the holes.');
    const hw = holeWidth(input.bolt, ed);
    const stag = input.nGauge > 0 ? { n: input.nGauge, s: input.sStag, g: input.gStag } : null;
    if (stag && !(stag.s > 0 && stag.g > 0)) return stop('The stagger needs a pitch s and a gauge g.');
    const na = netArea(Ag, input.nHoles, hw, input.t, stag);
    An = na.An;
    rec.add('Hole width for net area', S`hole width = standard hole + ${u(SE.holeAdd, L)}`, S`M${input.bolt}: ${v(SE.holeDia(input.bolt), L)} + ${v(SE.holeAdd, L)}`, S`hole width = ${u(hw, L)}`, 'steel.holes');
    rec.add('Net area', S`An = Ag − Σ(hole width · t) + Σ s² t / (4g)`, S`An = ${v(Ag, A)} − ${input.nHoles} · ${v(hw, L)} · ${v(input.t, L)}${stag ? S` + ${stag.n} · ${v(stag.s, L)}² · ${v(input.t, L)} / (4 · ${v(stag.g, L)})` : ''}`, S`An = ${u(An, A)}`, 'steel.tension.netArea');
    vals.holeWidth = hw;
    out.diagram.chips.push(S`M${input.bolt} bolts, ${input.nHoles} holes in the section`);
  } else rec.add('Net area', S`An = Ag for a welded connection (no holes)`, null, S`An = ${u(An, A)}`, 'steel.tension.netArea');
  if (!(An > 0)) return stop('The holes remove the whole section. Check the number of holes and the thickness.');
  const sl = shearLagU(input, ed), U = sl.U;
  if (!(U > 0) || U > 1) return stop('The shear lag factor U must be above 0 and not more than 1. Check the connection inputs.');
  const Ae = An * U;
  const row = SE.shearLag.find((x) => x.value === input.Ucase);
  rec.add('Shear lag factor and effective net area', S`Ae = An · U`, S`${row ? row.label : 'U'}${input.Ucase === 'case7f' ? ': ' + sl.text : ''};  Ae = ${v(An, A)} · ${U}`, S`U = ${U},  Ae = ${u(Ae, A)}`, 'steel.tension.shearLag',
    'Where Case 2 also applies, the larger U may be used. For bolted splice plates Ae = An ≤ ' + SE.splicePlateMax + ' Ag (' + ed.clauses['steel.splicePlate'].nscp + ').');
  const Y = SE.tension.yield, R = SE.tension.rupture, PnY = Fy * Ag / 1e3, PnR = Fu * Ae / 1e3, aY = avail(PnY, Y), aR = avail(PnR, R);
  rec.add('Tensile yielding on the gross section', S`Pn = Fy · Ag`, S`Pn = ${v(Fy, ST)} · ${v(Ag, A)}`, S`Pn = ${u(PnY, F)};  ${sym(Y)} = ${u(aY, F)}`, 'steel.tension.yield');
  rec.add('Tensile rupture on the net section', S`Pn = Fu · Ae`, S`Pn = ${v(Fu, ST)} · ${v(Ae, A)}`, S`Pn = ${u(PnR, F)};  ${sym(R)} = ${u(aR, F)}`, 'steel.tension.rupture');
  const gov = Math.min(aY, aR);
  rec.add('Available tensile strength', S`lesser of yielding and rupture`, S`lesser of ${v(aY, F)} and ${v(aR, F)}`, S`${u(gov, F)} (${aY <= aR ? 'yielding' : 'rupture'} governs)`, aY <= aR ? 'steel.tension.yield' : 'steel.tension.rupture');
  Object.assign(vals, { An, U, Ae, PnYield: PnY, PnRupture: PnR, yLRFD: Y.phi * PnY, rLRFD: R.phi * PnR, yASD: PnY / Y.omega, rASD: PnR / R.omega, availYield: aY, availRupture: aR, governing: aY <= aR ? 'yielding' : 'rupture' });
  const cap = method === 'ASD' ? 'Pn/Ω' : 'φPn';
  out.checks.push(check('Yielding', [dem, P, F], [cap, aY, F], P / aY, 'steel.tension.yield'));
  out.checks.push(check('Rupture', [dem, P, F], [cap, aR, F], P / aR, 'steel.tension.rupture'));
  if (input.Lmem > 0 && input.rmin > 0) {
    const sl2 = input.Lmem / input.rmin; vals.slenderness = sl2;
    rec.add('Slenderness (advisory)', S`L / r`, S`${v(input.Lmem, L)} / ${v(input.rmin, L)}`, S`L / r = ${sl2}`, 'steel.tension.slenderness');
    out.notes.push('There is no slenderness limit for tension members; L/r preferably should not exceed ' + SE.tension.slenderness + (sl2 > SE.tension.slenderness ? '. This member is above that value (see the last step).' : '. This member is within that value.'));
  } else out.notes.push('There is no slenderness limit for tension members; L/r preferably should not exceed ' + SE.tension.slenderness + '. Enter the length to see L/r.');
  out.results = [res('An', An, A), res('U', U), res('Ae', Ae, A), res(cap + ' yielding', aY, F), res(cap + ' rupture', aR, F), res('Available strength', gov, F)];
  out.steps = rec.steps; out.verdict = verdictOf(out.checks);
  return { vals, result: out };
}
