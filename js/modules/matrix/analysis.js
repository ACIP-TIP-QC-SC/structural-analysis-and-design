// Shared calc layer of the Matrix Analysis calculators: input normalising, the vals the tests
// compare, and the site's result object (checks, warnings, notes, worked solution, diagram data).
// Pure: no DOM, no rounding. Numbers are in the calc's consistent units (kN and m in SI and English
// modes, the user's own units in Consistent mode; see dsm.js).
import { analyse, crossings, KINDS, SUPPORTS } from './dsm.js';
import { memberStations } from './stations.js';
import { toArrays } from './linalg.js';
import { recorder, S, v, u, check, verdictOf, blank, res } from '../../core/steps.js';
import { QUANTITIES } from '../../core/units.js';
import { fmtQ, fmt } from '../../core/format.js';

export const isNum = (x) => typeof x === 'number' && isFinite(x);
export const opt = (x) => (x === '' || x == null ? 0 : x);          // blank load or movement = 0
export const need = (x) => (x === '' || x == null ? NaN : x);       // blank required number = error
const EQ_TOL = 1e-6, MAX_ERR = 14;

export const SUPPORT_LABELS = {
  truss: { free: 'Free', pin: 'Pin', rollerY: 'Roller (vertical reaction)', rollerX: 'Roller (horizontal reaction)', inclined: 'Inclined roller' },
  beam: { free: 'Free', fixed: 'Fixed', pin: 'Pin / Roller', guided: 'Guided (no rotation, slides vertically)' },
  frame: { free: 'Free', fixed: 'Fixed', hinge: 'Hinge', rollerY: 'Roller (Y reaction)', rollerX: 'Roller (X reaction)', guidedX: 'Guided (slides in X)', guidedY: 'Guided (slides in Y)', rotation: 'Rotation fixed only', inclined: 'Inclined roller' },
  bar: { free: 'Free', fixed: 'Fixed' }
};
export const RELEASE_LABELS = {
  beam: { none: 'None', i: 'Hinge at 1st joint', j: 'Hinge at 2nd joint', both: 'Hinges at both joints' },
  frame: { none: 'None', i: 'Hinge at b', j: 'Hinge at e', both: 'Hinges at b and e' }
};

// ---------------------------------------------------------------- tokens in the calc's units
// Scalar quantities map to the site's quantities (their SI units are kN and m, their English units kip
// and ft, so each line stays in one consistent set). Matrix entries mix units by row and column; in
// English mode (units 'US', the display system) they are written in kip and ft with the unit factors.
const fF = QUANTITIES.force.f, fL = QUANTITIES.length_m.f, fM = QUANTITIES.moment.f;
const SCALAR = { F: 'force', M: 'moment', L: 'length_m', d: 'length_m', r: 'ratio', E: 'pressure', A: 'area_m2', I: 'inertia_m4', w: 'lineload', ang: 'angle_deg', n: 'ratio' };
// factor (kN-m set -> kip-ft set) of a force-type (t/r) over a displacement-type (t/r) entry
const forceFac = (t) => (t === 'r' ? 1 / fM : 1 / fF), dispFac = (t) => (t === 'r' ? 1 : 1 / fL);
export function makeTokens(units) {
  const cons = units === 'consistent';
  const tk = (x, kind) => {
    if (cons || kind === 'n' || kind === 'r') return v(x, kind === 'ang' ? 'angle_deg' : 'ratio');
    if (SCALAR[kind]) return v(x, SCALAR[kind]);
    // matrix entries: 'K' + row type + column type, or vector entries 'P' + type (force) / 'U' + type (displacement)
    let f = 1;
    if (kind[0] === 'K') f = forceFac(kind[1]) / dispFac(kind[2]);
    else if (kind[0] === 'P') f = forceFac(kind[1]);
    else if (kind[0] === 'U') f = dispFac(kind[1]);
    return v(units === 'US' ? x * f : x, 'ratio');
  };
  const tu = (x, kind) => {
    if (cons) return v(x, 'ratio');
    if (SCALAR[kind]) return u(x, SCALAR[kind]);
    return tk(x, kind);
  };
  const unitText = (si, us) => (cons ? '' : units === 'US' ? us : si);
  return { tk, tu, unitText, cons };
}
export const dofType = (name) => (/^(D|M)\d/.test(name) ? 'r' : 't');

// A vector written out with its names: "Uh2 = 0.1234, Uv2 = …"
export function vecTokens(names, vals, kindOf, tk) {
  const out = [];
  names.forEach((nm, a) => { if (a) out.push(', '); out.push(nm + ' = '); out.push(tk(vals[a], kindOf(nm))); });
  return out;
}
// A matrix written out row by row: "[a b c; d e f]"
export function matTokens(M, rowNames, colNames, tk) {
  const out = ['['];
  M.forEach((row, i) => {
    if (i) out.push('; ');
    Array.from(row).forEach((x, j) => { if (j) out.push('  '); out.push(tk(x, 'K' + dofType(rowNames[i]) + dofType(colNames[j]))); });
  });
  out.push(']');
  return out;
}

// ---------------------------------------------------------------- normalising the inputs
export function normalise(input, kind) {
  const joints = (input.joints || []).map((r, k) => {
    const j = { id: isNum(r.id) ? r.id : k + 1, x: need(r.x), y: kind === 'beam' || kind === 'bar' ? 0 : need(r.y), support: r.support || 'free' };
    j.angle = r.angle === '' || r.angle == null ? (j.support === 'inclined' ? NaN : 0) : r.angle;
    ['FX', 'FY', 'M', 'settleX', 'settleY', 'settle', 'rotation'].forEach((key) => { j[key] = opt(r[key]); });
    return j;
  });
  const members = (input.members || []).map((r, k) => ({
    id: isNum(r.id) ? r.id : k + 1, i: need(r.i), j: need(r.j), E: need(r.E),
    A: kind === 'beam' ? 0 : need(r.A), I: kind === 'truss' || kind === 'bar' ? 0 : need(r.I), release: r.release || 'none'
  }));
  return { joints, members };
}

// Cells that are not numbers (blank required cells): one message per row.
export function cellErrors(input, kind) {
  const out = [];
  const jt = kind === 'beam' || kind === 'bar' ? ['x'] : ['x', 'y'];
  (input.joints || []).forEach((r, k) => {
    const id = isNum(r.id) ? r.id : k + 1;
    if (r.id !== undefined && !isNum(r.id)) out.push('Joint table, row ' + (k + 1) + ': the joint number is missing.');
    const miss = jt.filter((c) => !isNum(r[c]));
    if (miss.length) out.push('Joint ' + id + ': ' + miss.map((c) => c.toUpperCase()).join(' and ') + ' need' + (miss.length > 1 ? '' : 's') + ' a number.');
    ['FX', 'FY', 'M', 'settleX', 'settleY', 'settle', 'rotation', 'angle'].forEach((c) => { if (r[c] !== '' && r[c] != null && !isNum(r[c])) out.push('Joint ' + id + ': ' + c + ' is not a number.'); });
  });
  const props = kind === 'truss' || kind === 'bar' ? ['i', 'j', 'E', 'A'] : kind === 'beam' ? ['i', 'j', 'E', 'I'] : ['i', 'j', 'E', 'A', 'I'];
  const word = kind === 'beam' ? 'Element ' : 'Member ';
  (input.members || []).forEach((r, k) => {
    const miss = props.filter((c) => !isNum(r[c]));
    if (miss.length) out.push(word + (isNum(r.id) ? r.id : k + 1) + ': ' + miss.join(', ') + (miss.length > 1 ? ' need numbers.' : ' needs a number.'));
  });
  return out;
}

// ---------------------------------------------------------------- the result
// spec: { kind, units, input, model: { joints, members, items }, loadRows (for the drawing), loadSteps(mm, tk) }
export function run(spec) {
  const { kind, units } = spec;
  const K = KINDS[kind];
  const r = blank();
  const model = { kind, joints: spec.model.joints, members: spec.model.members, items: spec.model.items || {} };
  const diagram = { kind, units, joints: model.joints, members: model.members.map((m) => Object.assign({}, m)), loads: spec.loadRows || [], marks: { joints: [], members: [] } };
  r.diagram = diagram;
  const pre = (spec.preErrors || []).slice();
  if (!model.members.length) pre.push('Add at least one ' + (kind === 'beam' ? 'element' : 'member') + '.');
  if (pre.length) { r.ok = false; r.errors = pre.slice(0, MAX_ERR); return { r, vals: null }; }
  const sol = analyse(model);
  if (!sol.ok) {
    r.ok = false; r.errors = sol.errors.slice(0, MAX_ERR);
    if (sol.errors.length > MAX_ERR) r.errors.push('… and ' + (sol.errors.length - MAX_ERR) + ' more.');
    diagram.marks = sol.marks || diagram.marks;
    if (sol.unstable) diagram.unstable = sol.unstable;
    return { r, vals: null };
  }
  const tok = makeTokens(units);
  const sys = units === 'US' ? 'US' : 'SI';
  const cons = units === 'consistent';
  const J = new Map(model.joints.map((j) => [j.id, j]));

  // stations and extremes
  sol.members.forEach((mm) => { mm.st = memberStations(kind, mm); });

  // ---- vals (hand-off 5.3)
  const vals = { U: {}, R: {}, N: {}, Q: {}, nFree: sol.nFree, nSupp: sol.nSupp, order: sol.order.map((q) => sol.names[q]), extremes: {} };
  sol.dofs.forEach((d, q) => { vals.U[d.name] = sol.U[q]; });
  sol.reactions.forEach((x) => { vals.R[x.name] = x.value; });
  sol.incl.forEach((ri, id) => { for (let d = 0; d < K.nd; d++) { const nm = K.R[d] + id; if (!(nm in vals.R)) vals.R[nm] = sol.Rg[sol.dofs.findIndex((x) => x.joint === id && x.d === d)]; } });
  sol.members.forEach((mm) => {
    if (kind === 'truss' || kind === 'bar') vals.N[mm.id] = mm.N;
    if (kind === 'beam' || kind === 'frame') { vals.Q[mm.id] = {}; Array.from(mm.Q).forEach((x, a) => { vals.Q[mm.id][a + 1] = x; }); }
    vals.extremes[mm.id] = mm.st.ext;
  });

  // ---- checks (hand-off 4.11)
  const ch = sol.checks, checks = [];
  const row = (name, rel, clause, note) => check(name, ['Largest residual, relative', rel, 'ratio'], ['Allowed', EQ_TOL, 'ratio'], rel / EQ_TOL, clause, note ? { note } : null);
  checks.push(row('Global equilibrium (ΣFX, ΣFY, ΣM)', ch.global.rel, 'theory.matrix.statics'));
  if (ch.joint) checks.push(row(kind === 'bar' ? 'Node equilibrium (every node)' : 'Joint equilibrium (every joint)', ch.joint.rel, 'theory.matrix.statics'));
  if (ch.member) checks.push(row('Member equilibrium (every member with its loads)', ch.member.rel, 'theory.matrix.statics'));
  if (ch.hinge) checks.push(row('Hinges: M = 0 at released ends and imaginary clamps', ch.hinge.rel, 'theory.matrix.release'));
  r.checks = checks;
  const vd = verdictOf(checks);
  const nJ = sol.ids.length, nM = sol.members.length;
  vd.word = ['SOLVED', 'CHECK FAILED'];
  const words = kind === 'bar' ? [' nodes, ', ' elements; '] : [' joints, ', ' members; '];
  vd.line = vd.pass ? 'Solved: ' + nJ + words[0] + nM + words[1] + 'equilibrium checks passed'
    : 'Solved: ' + nJ + words[0] + nM + words[1] + checks.filter((c) => c.status === 'NG').map((c) => c.name).join(', ') + ' failed. The diagrams are not drawn.';
  r.verdict = vd;

  // ---- sanity warnings (hand-off 4.11) and notes
  const Lmax = Math.max(...sol.members.map((mm) => mm.L));
  const longest = sol.members.find((mm) => mm.L === Lmax);
  const unitStiff = cons && (kind === 'truss' || kind === 'bar' ? model.members.every((m) => m.E * m.A === 1)
    : kind === 'beam' ? model.members.every((m) => m.E * m.I === 1) : model.members.every((m) => m.E === 1 && m.A === 1 && m.I === 1));
  let mv = { d: 0, where: '' };
  if (kind === 'truss') {
    sol.ids.forEach((id) => { const a = sol.dofs.findIndex((x) => x.joint === id); const d = Math.hypot(sol.U[a], sol.U[a + 1]); if (d > mv.d) mv = { d, where: 'at joint ' + id }; });
  } else {
    sol.members.forEach((mm) => mm.st.dx.forEach((dx, k) => {
      const d = Math.hypot(dx, mm.st.dy[k]), x = mm.st.x[k];
      const jw = kind === 'bar' ? 'at node ' : 'at joint ';
      if (d > mv.d * (1 + 1e-12)) mv = { d, where: x < 1e-9 * mm.L ? jw + mm.i : x > mm.L * (1 - 1e-9) ? jw + mm.j : 'in ' + (kind === 'beam' || kind === 'bar' ? 'element ' : 'member ') + mm.id };
    }));
  }
  const q = (x, quantity) => (cons ? fmt(x) : fmtQ(x, quantity, sys));
  if (!unitStiff && mv.d > Lmax / 50) r.warnings.push('Largest movement ' + q(mv.d, 'length_m') + ' ' + mv.where + ' is more than L/50 = ' + q(Lmax / 50, 'length_m') + ' (longest ' + (kind === 'beam' || kind === 'bar' ? 'element ' : 'member ') + longest.id + ', ' + q(Lmax, 'length_m') + '). Check the units of E, A and I.');
  model.joints.forEach((j) => {
    if (!sol.ids.includes(j.id)) return;
    K.move.forEach((key, d) => {
      if (d === K.rot || !j[key]) return;
      if (Math.abs(j[key]) > Lmax / 100) r.warnings.push('Joint ' + j.id + ': the settlement ' + q(j[key], 'length_m') + ' is more than L/100 = ' + q(Lmax / 100, 'length_m') + ' (longest member). Check its units.');
    });
  });
  if (!cons) {
    const gpa = (E) => E / 1e6;     // kPa -> GPa
    const odd = model.members.filter((m) => gpa(m.E) < 0.5 || gpa(m.E) > 500);
    if (odd.length) r.warnings.push((kind === 'beam' ? 'Element' : 'Member') + (odd.length > 1 ? 's ' : ' ') + odd.map((m) => m.id).join(', ') + ': E = ' + q(odd[0].E, 'pressure') + ' is outside the usual 0.5 to 500 GPa. Check the units of E.');
  }
  if (nJ > 60) r.warnings.push('The model has ' + nJ + ' joints; large models solve more slowly in the browser.');
  sol.clamps.forEach((id) => r.notes.push('Joint ' + id + ': every member end is hinged, so its rotation is held by an imaginary clamp; its rotation is not a result.'));
  sol.incl.forEach((ri, id) => r.notes.push('Inclined roller at joint ' + id + ': axes rotated ' + fmt(ri.angle) + '° (exact method).'));
  crossings(model).forEach(([a, b]) => r.notes.push('Members ' + a + ' and ' + b + ' cross without a joint. They are analysed as separate members.'));

  // ---- key results (numbers; the UI writes them with fixed decimals and direction marks)
  const QF = cons ? 'ratio' : 'force', QM = cons ? 'ratio' : 'moment';
  sol.reactions.forEach((x) => r.results.push(res(x.name + (x.clamp ? ' (imaginary clamp at the hinge), must be 0' : x.normal ? ' (normal to the incline)' : ''), x.value, /^M/.test(x.name) ? QM : QF, x.name)));
  if (kind === 'bar') {
    // largest tension, largest compression and largest stress along the elements (Excel DIAGRAM VALUES)
    let t = { v: 0 }, c = { v: 0 }, sg = { v: 0 };
    sol.members.forEach((mm) => mm.st.N.forEach((x, k) => {
      if (x > t.v) t = { v: x, m: mm.id }; if (x < c.v) c = { v: x, m: mm.id };
      if (Math.abs(x / mm.A) > Math.abs(sg.v)) sg = { v: x / mm.A, m: mm.id };
    }));
    r.results.push(res('Largest tension' + (t.m ? ', element ' + t.m : ''), t.v, QF, 'Nmax'));
    r.results.push(res('Largest compression' + (c.m ? ', element ' + c.m : ''), c.v, QF, 'Nmax'));
    r.results.push(res('Largest |σ|' + (sg.m ? ', element ' + sg.m : ''), sg.v, cons ? 'ratio' : 'pressure', 'Smax'));
  } else if (kind === 'truss') {
    const big = sol.members.reduce((a, b) => (Math.abs(b.N) > Math.abs(a.N) ? b : a));
    r.results.push(res('Largest |N|, member ' + big.id + (big.N > 0 ? ' (T)' : big.N < 0 ? ' (C)' : ''), big.N, QF, 'Nmax'));
  } else {
    let vb = { v: 0 }, mb = { v: 0 };
    sol.members.forEach((mm) => {
      mm.st.V.forEach((x, k) => { if (Math.abs(x) > Math.abs(vb.v)) vb = { v: x, m: mm.id, x: mm.st.x[k] }; });
      [mm.st.ext.Mmax, mm.st.ext.Mmin].forEach((e) => { if (Math.abs(e.v) > Math.abs(mb.v)) mb = { v: e.v, m: mm.id, x: e.x }; });
    });
    if (kind === 'frame') {
      let nb = { v: 0 };
      sol.members.forEach((mm) => mm.st.N.forEach((x) => { if (Math.abs(x) > Math.abs(nb.v)) nb = { v: x, m: mm.id }; }));
      r.results.push(res('Largest |N|, member ' + nb.m, nb.v, QF, 'Nmax'));
    }
    r.results.push(res('Largest |V|, ' + (kind === 'beam' ? 'element ' : 'member ') + vb.m, vb.v, QF, 'Vmax'));
    r.results.push(res('Largest |M|, ' + (kind === 'beam' ? 'element ' : 'member ') + mb.m, mb.v, QM, 'Mmax'));
  }
  r.results.push(res('Largest movement, ' + (mv.where || 'none'), mv.d, cons ? 'ratio' : 'length_m', 'Dmax'));
  r.results.push(res('Longest ' + (kind === 'beam' || kind === 'bar' ? 'element' : 'member') + ', ' + longest.id, Lmax, cons ? 'ratio' : 'length_m', 'Lmax'));

  // ---- worked solution (hand-off 7.5)
  r.steps = workedSolution(kind, sol, model, tok, spec, J);

  // ---- diagram data for the drawing, the tables, the matrices and the report
  const plain = (a) => (a && a.length != null ? Array.from(a) : a);
  Object.assign(diagram, {
    ids: sol.ids, dofNames: sol.dofs.map((d) => d.name), dofJoint: sol.dofs.map((d) => d.joint), names: sol.names, rnames: sol.rnames,
    order: sol.order.map((qq) => sol.names[qq]), orderIdx: sol.order, nFree: sol.nFree, nSupp: sol.nSupp,
    held: sol.held, clamps: sol.clamps, incl: [...sol.incl.entries()].map(([id, x]) => ({ id, angle: x.angle })),
    K: toArrays(sol.K), Kpart: toArrays(sol.Kpart), KppInv: sol.KppInv ? toArrays(sol.KppInv) : null, rotated: sol.incl.size > 0,
    F: plain(sol.F), Feq: plain(sol.Feq), Us: plain(sol.Us), U: plain(sol.U), Ur: plain(sol.Ur), Up: plain(sol.Up), Fs: plain(sol.Fs), Rg: plain(sol.Rg),
    Pp: plain(sol.Pp), rhs: plain(sol.rhs), Usp: plain(sol.Usp), Fr: plain(sol.Fr), Feqr: plain(sol.Feqr),
    reactions: sol.reactions,
    res: sol.members.map((mm) => ({
      id: mm.id, i: mm.i, j: mm.j, L: mm.L, c: mm.c, s: mm.s, theta: mm.theta, E: mm.E, A: mm.A, I: mm.I, release: mm.release, MT: mm.MT,
      names: mm.names, k: toArrays(mm.k), kRigid: toArrays(mm.kRigidSel), T: toArrays(mm.T), K: toArrays(mm.K), Qf: plain(mm.Qf), QfRigid: plain(mm.QfRigid), Ff: plain(mm.Ff),
      items: mm.items.map((it) => Object.assign({}, it, { qf: plain(it.qf) })),
      v: plain(mm.v), u: plain(mm.u), u6: plain(mm.u6), Q: plain(mm.Q), Q6: plain(mm.Q6), Fg: plain(mm.Fg), N: mm.N, endRot: mm.endRot,
      st: mm.st
    })),
    checkSums: ch.global,
    pass: vd.pass,
    chips: [cons ? 'Consistent units' : 'Calc units: ' + (sys === 'US' ? 'kip, ft' : 'kN, m'), sol.nFree + ' free, ' + sol.nSupp + ' supported DOFs']
  });
  return { r, vals };
}

// ---------------------------------------------------------------- worked solution
function workedSolution(kind, sol, model, tok, spec, J) {
  const { tk, tu, unitText } = tok, K = KINDS[kind];
  const rec = recorder();
  const kindOf = (nm) => (/^(D)\d/.test(nm) ? 'r' : /^(M)\d/.test(nm) ? 'M' : /^(F|Ft|Fn|Fh|Fv)\d/.test(nm) ? 'F' : 'd');
  const fKind = (nm) => (dofType(nm) === 'r' ? 'M' : 'F');
  const dKind = (nm) => (dofType(nm) === 'r' ? 'r' : 'd');
  const memWord = kind === 'beam' || kind === 'bar' ? 'Element ' : 'Member ';
  const clauseMember = 'theory.matrix.' + kind;

  // 1. DOF numbering
  const desig = sol.ids.map((id) => id + ' → ' + sol.dofs.filter((d) => d.joint === id).map((d) => d.name).join(', ')).join('; ');
  rec.add('Degrees of freedom: joint → DOF names', S`${desig}`, sol.incl.size ? S`Inclined rollers: ${[...sol.incl.keys()].map((id) => 'joint ' + id + ' uses Ut' + id + ' (along the incline) and Un' + id + ' (normal to it)').join('; ')}` : null,
    S`${sol.dofs.length} DOFs: ${sol.nFree} free, ${sol.nSupp} supported (held by supports${sol.clamps.length ? ' and imaginary clamps' : ''})`, 'theory.matrix.dof',
    'DOFs are numbered joint by joint in increasing joint number: ' + K.U.map((x) => x + '#').join(', ') + '.');

  // 2. member matrices
  sol.members.forEach((mm) => {
    const Lname = kind === 'beam' || kind === 'bar' ? S`L = X${mm.j} − X${mm.i} = ${tu(mm.L, 'L')}` : S`L = √(ΔX² + ΔY²) = ${tu(mm.L, 'L')}; cos θ = ${tk(mm.c, 'n')}; sin θ = ${tk(mm.s, 'n')}; θ = ${tk(mm.theta, 'ang')}`;
    const kU = unitText('kN, m', 'kip, ft');
    let formula, sub;
    if (kind === 'truss' || kind === 'bar') {
      formula = kind === 'truss' ? S`k = EA/L; K = Tᵀ k T = EA/L × [c² cs −c² −cs; cs s² −cs −s²; −c² −cs c² cs; −cs −s² cs s²]` : S`K = EA/L × [1 −1; −1 1]`;
      sub = S`${Lname}; EA/L = ${tk(mm.E, 'E')} × ${tk(mm.A, 'A')} / ${tk(mm.L, 'L')} = ${tk(mm.E * mm.A / mm.L, 'Ktt')}`;
    } else {
      formula = kind === 'beam' ? S`k = EI/L³ × [12 6L −12 6L; 6L 4L² −6L 2L²; −12 −6L 12 −6L; 6L 2L² −6L 4L²] (Uv, D at each end)`
        : S`k = Kassimali Eq. 6.6 (EA/L, 12EI/L³, 6EI/L², 4EI/L, 2EI/L); T = [c s 0; −s c 0; 0 0 1] at each end; K = Tᵀ k T`;
      sub = kind === 'beam' ? S`${Lname}; EI = ${tk(mm.E, 'E')} × ${tk(mm.I, 'I')}; 12EI/L³ = ${tk(12 * mm.E * mm.I / mm.L ** 3, 'Ktt')}, 6EI/L² = ${tk(6 * mm.E * mm.I / mm.L ** 2, 'Ktr')}, 4EI/L = ${tk(4 * mm.E * mm.I / mm.L, 'Krr')}, 2EI/L = ${tk(2 * mm.E * mm.I / mm.L, 'Krr')}`
        : S`${Lname}; EA/L = ${tk(mm.E * mm.A / mm.L, 'Ktt')}; 12EI/L³ = ${tk(12 * mm.E * mm.I / mm.L ** 3, 'Ktt')}; 6EI/L² = ${tk(6 * mm.E * mm.I / mm.L ** 2, 'Ktr')}; 4EI/L = ${tk(4 * mm.E * mm.I / mm.L, 'Krr')}; 2EI/L = ${tk(2 * mm.E * mm.I / mm.L, 'Krr')}`;
    }
    const lab = (mm.release !== 'none' ? 'Modified for ' + (RELEASE_LABELS[kind] ? RELEASE_LABELS[kind][mm.release].toLowerCase() : 'the release') + ' (MT = ' + mm.MT + '). ' : '');
    rec.add(memWord + mm.id + ' (joints ' + mm.i + ' → ' + mm.j + '): member stiffness matrix', formula, sub,
      S`K${mm.id} on ${mm.names.join(', ')} = ${matTokens(mm.K, mm.names, mm.names, tk)}${kU ? [' (', kU, ')'] : ''}`,
      mm.release !== 'none' ? 'theory.matrix.release' : clauseMember, lab + (kind === 'frame' ? 'The local k, T and K of each member are also in the Matrices card.' : ''));
    if (mm.items.length) {
      const parts = [];
      mm.items.forEach((it, a) => { if (a) parts.push('; '); parts.push((it.label || 'load ' + (a + 1)) + ': Qf = '); parts.push(...qfTokens(it.qf, kind, tk)); });
      rec.add(memWord + mm.id + ': fixed-end forces of its loads', S`Qf = −f, f = ∫ w N(x) dx (Hermite shape functions; exact for partial uniform and linear loads)`, parts,
        S`Qf = ${qfTokens(mm.qf6, kind, tk)}; Ff = Tᵀ Qf on ${mm.names.join(', ')} = ${vecTokens(mm.names, mm.Ff, fKind, tk)}`, mm.release !== 'none' ? 'theory.matrix.release' : clauseMember,
        mm.release !== 'none' ? 'Qf modified for the release by static condensation.' : '');
    }
  });

  // 3. loads
  const free = sol.free, supp = sol.supp;
  const allNames = sol.dofs.map((d) => d.name);
  const anyFeq = Array.from(sol.Feq).some((x) => x !== 0);
  rec.add('Joint loads F' + (anyFeq ? ' and equivalent joint loads Feq = −Σ Ff' : ''), S`F at each DOF from the joint table${anyFeq ? '; Feq = −(sum of the members\' Ff at that DOF)' : ''}`,
    S`F: ${vecTokens(allNames, sol.F, fKind, tk)}`, anyFeq ? S`Feq: ${vecTokens(allNames, sol.Feq, fKind, tk)}` : null, 'theory.matrix.assembly');

  // 4. assembly
  rec.add('Structure stiffness matrix K (assembled by DOF name)', S`K(i, j) = Σ over members of K_member(i, j) where the member has both DOF names`,
    S`K is ${sol.dofs.length} × ${sol.dofs.length}, symmetric. Diagonal: ${vecTokens(allNames, sol.K.map((rw, a) => rw[a]), (nm) => 'K' + dofType(nm) + dofType(nm), tk)}`, null, 'theory.matrix.assembly',
    'The full K is shown in the Matrices card.');

  // 5. partition
  const fn = free.map((qq) => sol.names[qq]), sn = supp.map((qq) => sol.names[qq]);
  rec.add('Partition order: free DOFs, then supported DOFs', S`free (p): ${fn.join(', ') || 'none'}; supported (s): ${sn.join(', ')}`,
    sol.incl.size ? S`K′ = Rᵀ K R and P′ = Rᵀ (F + Feq): the inclined roller joints use axes along and normal to the incline` : null,
    S`Kpp ${fn.length} × ${fn.length}, Kps ${fn.length} × ${sn.length}, Ksp ${sn.length} × ${fn.length}, Kss ${sn.length} × ${sn.length}`, sol.incl.size ? 'theory.matrix.incline' : 'theory.matrix.solve',
    'The partitioned K (Kpp yellow, Kps red, Ksp blue, Kss green) is shown in the Matrices card.');

  // 6. Up
  const anyUs = Array.from(sol.Usp).some((x) => x !== 0);
  rec.add('Free joint displacements Up', S`Up = Kpp⁻¹ (Fp + Feq,p − Kps Us)`,
    S`Fp + Feq,p − Kps Us = ${vecTokens(fn, sol.rhs, fKind, tk)}${anyUs ? ['; Us = ', ...vecTokens(sn, sol.Usp, dKind, tk)] : ''}`,
    S`${vecTokens(fn, sol.Up, dKind, tk)}`, anyUs ? 'theory.matrix.support' : sol.incl.size ? 'theory.matrix.incline' : 'theory.matrix.solve',
    sol.KppInv ? 'Kpp⁻¹ is shown in the Matrices card.' : 'Solved by Gaussian elimination (Kpp⁻¹ is not printed above 40 free DOFs).');

  // 7. Fs
  const rn = supp.map((qq) => sol.rnames[qq]);
  rec.add('Support reactions Fs', S`Fs = Ksp Up + Kss Us − Feq,s`, null, S`${vecTokens(rn, sol.Fs, (nm) => (/^M/.test(nm) ? 'M' : 'F'), tk)}`, 'theory.matrix.solve',
    (sol.incl.size ? 'At an inclined roller, Fn is the normal reaction; Fh = −Fn sin θ and Fv = Fn cos θ. ' : '') + (sol.clamps.length ? 'An imaginary clamp moment must come out 0.' : ''));

  // 8. member end forces
  sol.members.forEach((mm) => {
    const loc = kind === 'beam' ? ['V1', 'M1', 'V2', 'M2'] : kind === 'truss' ? ['Q1', 'Q2', 'Q3', 'Q4'] : kind === 'bar' ? ['Q1', 'Q2'] : ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
    const qk = (nm, a) => (kind === 'beam' ? (a % 2 ? 'M' : 'F') : kind === 'frame' ? (a % 3 === 2 ? 'M' : 'F') : 'F');
    const vk = (nm, a) => (kind === 'beam' ? (a % 2 ? 'r' : 'd') : kind === 'frame' ? (a % 3 === 2 ? 'r' : 'd') : 'd');
    const vv = [], uu = [], qq = [];
    mm.names.forEach((nm, a) => { if (a) vv.push(', '); vv.push(tk(mm.v[a], vk(nm, a))); });
    Array.from(mm.u).forEach((x, a) => { if (a) uu.push(', '); uu.push(tk(x, vk('', a))); });
    Array.from(mm.Q).forEach((x, a) => { if (a) qq.push(', '); qq.push(loc[a] + ' = '); qq.push(tk(x, qk('', a))); });
    let tail = [];
    if (kind === 'truss' || kind === 'bar') tail = ['; N = ', kind === 'truss' ? 'Q3 = −Q1' : 'Q2', ' = ', tu(mm.N, 'F'), mm.N > 0 ? ' (T)' : mm.N < 0 ? ' (C)' : ' (zero)'];
    else {
      const e = mm.st, n = e.x.length - 1;
      tail = ['; at b: N = ', tu(e.N[0], 'F'), ', V = ', tu(e.V[0], 'F'), ', M = ', tu(e.M[0], 'M'), '; at e: N = ', tu(e.N[n], 'F'), ', V = ', tu(e.V[n], 'F'), ', M = ', tu(e.M[n], 'M')];
      if (kind === 'beam') tail = ['; V left = ', tu(e.V[0], 'F'), ', V right = ', tu(e.V[n], 'F'), ', M left = ', tu(e.M[0], 'M'), ', M right = ', tu(e.M[n], 'M')];
    }
    const rot = mm.endRot.length ? ' Released end rotation' + (mm.endRot.length > 1 ? 's' : '') + ': ' + mm.endRot.map((x) => 'θ at ' + (kind === 'beam' ? (x.end === 'b' ? 'the 1st joint' : 'the 2nd joint') : x.end) + ' = ' + fmt(x.value) + ' rad').join(', ') + '.' : '';
    rec.add(memWord + mm.id + ': end displacements and end forces', kind === 'beam' || kind === 'bar' ? S`v = joint displacements of ${mm.names.join(', ')}; Q = k v + Qf` : S`v = joint displacements of ${mm.names.join(', ')}; u = T v; Q = k u + Qf; F = Tᵀ Q`,
      kind === 'beam' || kind === 'bar' ? S`v = [${vv}]` : S`v = [${vv}]; u = [${uu}]`, S`${qq}${tail}`, clauseMember,
      (kind === 'beam' ? 'Beam convention: V left = V1, V right = −V2, M left = −M1, M right = M2 (sagging +).' : kind === 'frame' ? 'N = −Q1 at b and Q4 at e (tension +); V = Q2 at b; M sagging +.' : '') + rot);
  });

  // 9. checks
  const g = sol.checks.global;
  rec.add('Equilibrium checks', S`ΣFX, ΣFY and ΣM about the origin of the joint loads, member loads and reactions must vanish`,
    S`ΣFX = ${tk(g.fx, 'F')}; ΣFY = ${tk(g.fy, 'F')}; ΣM = ${tk(g.mz, 'M')}`, S`largest residual = ${tk(g.rel, 'n')} of the forces involved (allowed ${tk(EQ_TOL, 'n')})`, 'theory.matrix.statics');
  return rec.steps;
}

function qfTokens(q, kind, tk) {
  const arr = Array.from(q), out = ['['];
  const kindAt = (a) => (arr.length === 6 ? (a % 3 === 2 ? 'M' : 'F') : kind === 'beam' ? (a % 2 ? 'M' : 'F') : 'F');
  arr.forEach((x, a) => { if (a) out.push(', '); out.push(tk(x, kindAt(a))); });
  out.push(']');
  return out;
}

export { SUPPORTS };
