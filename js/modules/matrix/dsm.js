// The direct stiffness engine shared by the Truss, Beams, Frames and Bars calculators
// (hand-off Section 4). Pure: no DOM, no globals, no rounding.
//
// Units: the engine works in ONE consistent set of units. In "Consistent units" mode that is
// whatever the user typed; in SI and English modes the UI converts every input to kN and m before
// calling the calc, and converts the results back for display. This is a deliberate exception to
// the site rule that values crossing the calc boundary use the displayed SI unit of their quantity:
// the same calc file then serves the Consistent mode used by the book problems and the tests.
//
// Model in: { kind: 'truss' | 'beam' | 'frame' | 'bar',
//             joints: [{ id, x, y, support, angle, FX, FY, M, settleX, settleY, settle, rotation }],
//             members: [{ id, i, j, E, A, I, release }],
//             items: { [memberId]: [{ kind, a, b, w1, w2, P, M, label }] } }   (local load components, fef.js)
// Numbers must already be numbers (the calc turns blanks into 0).
import { zeros, vec, mul, transpose, sub, subv, solve, inverse, stabilityPivot } from './linalg.js';
import { SEL, RELEASED, RELEASE_MT, kLocal, T6, condense, releasedRotations } from './elements.js';
import { fixedEnd, resultant } from './fef.js';
import { fmt } from '../../core/format.js';

export const KINDS = {
  truss: { nd: 2, U: ['Uh', 'Uv'], R: ['Fh', 'Fv'], load: ['FX', 'FY'], move: ['settleX', 'settleY'], dir: ['X', 'Y'], rot: -1 },
  beam: { nd: 2, U: ['Uv', 'D'], R: ['Fv', 'M'], load: ['FY', 'M'], move: ['settle', 'rotation'], dir: ['Y', 'the rotation'], rot: 1 },
  frame: { nd: 3, U: ['Uh', 'Uv', 'D'], R: ['Fh', 'Fv', 'M'], load: ['FX', 'FY', 'M'], move: ['settleX', 'settleY', 'rotation'], dir: ['X', 'Y', 'the rotation'], rot: 2 },
  bar: { nd: 1, U: ['U'], R: ['F'], load: ['FX'], move: ['settle'], dir: ['X'], rot: -1 }
};

// What each support type holds, per DOF of the joint ('incl' = inclined roller).
export const SUPPORTS = {
  truss: { free: [0, 0], pin: [1, 1], rollerY: [0, 1], rollerX: [1, 0], inclined: 'incl' },
  beam: { free: [0, 0], fixed: [1, 1], pin: [1, 0], guided: [0, 1] },
  frame: { free: [0, 0, 0], fixed: [1, 1, 1], hinge: [1, 1, 0], rollerY: [0, 1, 0], rollerX: [1, 0, 0], guidedX: [0, 1, 1], guidedY: [1, 0, 1], rotation: [0, 0, 1], inclined: 'incl' },
  bar: { free: [0], fixed: [1] }
};

const isNum = (x) => typeof x === 'number' && isFinite(x);
const SNAP = 1e-9, EQ = 1e-6;
const ROT_WORD = { 2: 'b', 5: 'e' };

function geometry(kind, a, b) {
  if (kind === 'beam' || kind === 'bar') { const L = b.x - a.x; return { L, c: 1, s: 0, theta: 0 }; }
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  return { L, c: dx / L, s: dy / L, theta: Math.atan2(dy, dx) * 180 / Math.PI };
}

// ---------------------------------------------------------------- validation (hand-off 4.11)
export function validate(model) {
  const K = KINDS[model.kind], sup = SUPPORTS[model.kind], errors = [], marks = { joints: [], members: [] };
  const err = (t, j, m) => { errors.push(t); if (j != null) marks.joints.push(j); if (m != null) marks.members.push(m); };
  const J = new Map();
  model.joints.forEach((j) => {
    if (J.has(j.id)) err('Joint number ' + j.id + ' is used twice in the joint table.', j.id);
    J.set(j.id, j);
    const coords = model.kind === 'beam' || model.kind === 'bar' ? ['x'] : ['x', 'y'];
    coords.forEach((c) => { if (!isNum(j[c])) err('Joint ' + j.id + ': ' + c.toUpperCase() + ' needs a number.', j.id); });
    if (!sup[j.support]) err('Joint ' + j.id + ': choose a support type from the list.', j.id);
  });
  const used = new Set(), pairs = new Map();
  const need = model.kind === 'truss' || model.kind === 'bar' ? ['E', 'A'] : model.kind === 'beam' ? ['E', 'I'] : ['E', 'A', 'I'];
  model.members.forEach((m) => {
    const lab = (model.kind === 'beam' ? 'Element ' : 'Member ') + m.id;
    need.forEach((p) => { if (!(isNum(m[p]) && m[p] > 0)) err(lab + ': ' + p + ' must be a number above zero.', null, m.id); });
    const a = J.get(m.i), b = J.get(m.j);
    if (!a) err(lab + ': joint ' + m.i + ' is not in the joint table.', null, m.id);
    if (!b) err(lab + ': joint ' + m.j + ' is not in the joint table.', null, m.id);
    if (!a || !b) return;
    if (m.i === m.j) { err(lab + ' starts and ends at joint ' + m.i + '.', m.i, m.id); return; }
    used.add(m.i); used.add(m.j);
    const key = Math.min(m.i, m.j) + '-' + Math.max(m.i, m.j);
    if (pairs.has(key) && model.kind !== 'bar') err((model.kind === 'beam' ? 'Elements ' : 'Members ') + pairs.get(key) + ' and ' + m.id + ' join the same two joints (' + m.i + ' and ' + m.j + '). Enter each member once.', null, m.id);
    else pairs.set(key, m.id);
    if ((model.kind === 'beam' || model.kind === 'bar') && isNum(a.x) && isNum(b.x) && b.x <= a.x) err(lab + ' runs right to left: swap its joints.', null, m.id);
  });
  // coincident joints and unused joints
  const list = model.joints.filter((j) => used.has(j.id));
  for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
    const a = list[p], b = list[q];
    const same = model.kind === 'beam' ? Math.abs(a.x - b.x) < 1e-9 * (Math.abs(a.x) + Math.abs(b.x) + 1)
      : model.kind === 'bar' ? false : Math.hypot(a.x - b.x, a.y - b.y) < 1e-9 * (Math.abs(a.x) + Math.abs(b.x) + Math.abs(a.y) + Math.abs(b.y) + 1);
    if (same) err('Joints ' + a.id + ' and ' + b.id + ' are at the same point.', b.id);
  }
  model.joints.forEach((j) => { if (!used.has(j.id)) err('Joint ' + j.id + ' is not connected to any member.', j.id); });
  // loads and prescribed movements against what the support holds
  model.joints.forEach((j) => {
    const flags = sup[j.support];
    if (!flags) return;
    if (flags === 'incl') {
      if (!isNum(j.angle)) err('Joint ' + j.id + ': an inclined roller needs the angle of its rolling surface.', j.id);
      if (K.move.some((k, d) => d !== K.rot && j[k])) err('An inclined roller takes no settlement (joint ' + j.id + ').', j.id);
      if (K.rot >= 0 && j[K.move[K.rot]]) err('Joint ' + j.id + ': a prescribed rotation needs a support that holds the rotation.', j.id);
      return;
    }
    flags.forEach((held, d) => {
      const ld = K.load[d], mv = K.move[d];
      if (held && j[ld]) err('Joint ' + j.id + ': ' + ld + ' is applied where the support holds ' + K.dir[d] + '; put it on a free joint or remove it.', j.id);
      if (!held && j[mv]) err('Joint ' + j.id + ': ' + (d === K.rot ? 'a prescribed rotation is given where the support does not hold the rotation' : 'a settlement in ' + K.dir[d] + ' is given where the support does not hold ' + K.dir[d]) + '; remove it or change the support.', j.id);
    });
  });
  // member loads inside their member
  if (!errors.length) {
    model.members.forEach((m) => {
      const g = geometry(model.kind, J.get(m.i), J.get(m.j));
      ((model.items || {})[m.id] || []).forEach((it) => {
        const tol = 1e-9 * g.L;
        const bad = !isNum(it.a) || it.a < -tol || it.a > g.L + tol || ((it.kind === 'wy' || it.kind === 'wx') && (!isNum(it.b) || it.b > g.L + tol || it.b <= it.a));
        if (bad) err((it.label || 'A member load') + ' lies outside its ' + (model.kind === 'beam' ? 'element' : 'member') + ' (length ' + fmt(g.L) + '): check its start and end distances.', null, m.id);
      });
    });
  }
  return { errors, marks };
}

// ---------------------------------------------------------------- the solve (hand-off 4.9)
export function analyse(model) {
  const kind = model.kind, K = KINDS[kind], nd = K.nd, sel = SEL[kind];
  const v0 = validate(model);
  if (v0.errors.length) return { ok: false, errors: v0.errors, marks: v0.marks };
  const J = new Map(model.joints.map((j) => [j.id, j]));
  const usedIds = new Set();
  model.members.forEach((m) => { usedIds.add(m.i); usedIds.add(m.j); });
  const ids = [...usedIds].sort((a, b) => a - b);
  // 1. DOF numbering, joint by joint
  const dofs = [], idx = new Map();
  ids.forEach((id) => { for (let d = 0; d < nd; d++) { idx.set(id + ':' + d, dofs.length); dofs.push({ joint: id, d, name: K.U[d] + id, rname: K.R[d] + id }); } });
  const n = dofs.length;
  const di = (id, d) => idx.get(id + ':' + d);

  // 2. member matrices
  const members = model.members.map((m) => {
    const a = J.get(m.i), b = J.get(m.j), g = geometry(kind, a, b);
    const rel = kind === 'beam' || kind === 'frame' ? (m.release || 'none') : 'none';
    const released = RELEASED[rel] || [];
    const kR = kLocal(m.E, kind === 'beam' ? 0 : m.A, kind === 'truss' || kind === 'bar' ? 0 : m.I, g.L);
    const items = ((model.items || {})[m.id] || []).map((it) => Object.assign({}, it, { qf: fixedEnd(g.L, it) }));
    const qfR = vec(6);
    items.forEach((it) => it.qf.forEach((x, q) => { qfR[q] += x; }));
    const { k, qf } = condense(kR, qfR, released);
    const T = T6(g.c, g.s);
    const Kg6 = mul(transpose(T), mul(k, T)), Ff6 = mul(transpose(T), qf);
    const gd = [];
    [m.i, m.j].forEach((jid) => { for (let d = 0; d < nd; d++) gd.push(di(jid, d)); });
    return {
      id: m.id, i: m.i, j: m.j, E: m.E, A: m.A, I: m.I, release: rel, MT: RELEASE_MT[rel] || 0, released,
      L: g.L, c: g.c, s: g.s, theta: g.theta, items,
      kRigid: kR, qfRigid: qfR, k6: k, qf6: qf, T6: T,
      k: sub(k, sel, sel), kRigidSel: sub(kR, sel, sel), T: sub(T, sel, sel), K: sub(Kg6, sel, sel), Qf: subv(qf, sel), QfRigid: subv(qfR, sel), Ff: subv(Ff6, sel),
      dofs: gd, names: gd.map((q) => dofs[q].name)
    };
  });

  // 3. assembly by DOF name
  const Kst = zeros(n), F = vec(n), Feq = vec(n);
  members.forEach((mm) => {
    mm.dofs.forEach((p, a) => { Feq[p] -= mm.Ff[a]; mm.dofs.forEach((q, b) => { Kst[p][q] += mm.K[a][b]; }); });
  });

  // 4. supports, loads, prescribed movements, inclined rollers and imaginary clamps
  const held = new Array(n).fill(false), Us = vec(n), incl = new Map(), clamps = [];
  ids.forEach((id) => {
    const j = J.get(id), flags = SUPPORTS[kind][j.support];
    for (let d = 0; d < nd; d++) F[di(id, d)] += j[K.load[d]] || 0;
    if (flags === 'incl') {
      const th = (j.angle || 0) * Math.PI / 180;
      incl.set(id, { angle: j.angle || 0, th, c: Math.cos(th), s: Math.sin(th) });
      held[di(id, 1)] = true;
      if (K.rot >= 0) Us[di(id, K.rot)] = 0;
      return;
    }
    flags.forEach((h, d) => { if (h) { held[di(id, d)] = true; Us[di(id, d)] = j[K.move[d]] || 0; } });
  });
  if (K.rot >= 0) {
    ids.forEach((id) => {
      const q = di(id, K.rot);
      if (held[q]) return;
      const ends = members.filter((mm) => mm.i === id || mm.j === id).map((mm) => mm.released.includes(mm.i === id ? 2 : 5));
      if (ends.length && ends.every(Boolean)) { held[q] = true; clamps.push(id); }
    });
  }
  // rotated joint axes (exact inclined roller, Kassimali 9.4)
  const names = dofs.map((x) => x.name), rnames = dofs.map((x) => x.rname);
  const hasIncl = incl.size > 0;
  let Rm = null;
  if (hasIncl) {
    Rm = zeros(n);
    for (let q = 0; q < n; q++) Rm[q][q] = 1;
    incl.forEach((r, id) => {
      const a = di(id, 0), b = di(id, 1);
      Rm[a][a] = r.c; Rm[a][b] = -r.s; Rm[b][a] = r.s; Rm[b][b] = r.c;
      names[a] = 'Ut' + id; names[b] = 'Un' + id; rnames[b] = 'Fn' + id; rnames[a] = 'Ft' + id;
    });
  }
  const Kr = hasIncl ? mul(transpose(Rm), mul(Kst, Rm)) : Kst;
  const FplusFeq = F.map((x, q) => x + Feq[q]);
  const Pr = hasIncl ? mul(transpose(Rm), FplusFeq) : FplusFeq;
  const Fr = hasIncl ? mul(transpose(Rm), F) : F, Feqr = hasIncl ? mul(transpose(Rm), Feq) : Feq;

  // partition: free, then supported, in DOF order within each group
  const free = [], supp = [];
  for (let q = 0; q < n; q++) (held[q] ? supp : free).push(q);
  const order = free.concat(supp);
  const Kpp = sub(Kr, free, free), Kps = sub(Kr, free, supp), Ksp = sub(Kr, supp, free), Kss = sub(Kr, supp, supp);
  const Usp = subv(Us, supp);

  // 5. stability test on Kpp
  const bad = stabilityPivot(Kpp);
  const base = { kind, ids, dofs, names, rnames, members, K: Kst, Kr, F, Feq, Fr, Feqr, Us, held, incl, clamps, R: Rm, free, supp, order,
    Kpart: sub(Kr, order, order), Kpp, Kps, Ksp, Kss, nFree: free.length, nSupp: supp.length };
  if (bad >= 0) {
    const q = free[bad];
    return Object.assign(base, { ok: false, unstable: { name: names[q], joint: dofs[q].joint },
      errors: ['The structure is unstable (a mechanism): it can move at ' + names[q] + ' (joint ' + dofs[q].joint + ') without resistance. Usual causes: fewer than two non-parallel members at a joint, a disconnected part, or reactions that are all parallel or all pass through one point. For a hinge, check that a support or a member without a hinge holds the rotation.'],
      marks: { joints: [dofs[q].joint], members: [] } });
  }

  // 6. solve Up = Kpp⁻¹ (Fp + Feq,p − Kps Us)
  const Pp = subv(Pr, free), KpsUs = mul(Kps, Usp);
  const rhs = Pp.map((x, a) => x - KpsUs[a]);
  const Up = free.length ? solve(Kpp, rhs) : vec(0);
  if (!Up) return Object.assign(base, { ok: false, errors: ['The structure is unstable (a mechanism): the stiffness matrix of the free DOFs cannot be solved.'], marks: { joints: [], members: [] } });
  const KppInv = free.length && free.length <= 40 ? inverse(Kpp) : null;
  const Ur = Float64Array.from(Us);
  free.forEach((q, a) => { Ur[q] = Up[a]; });
  const U = hasIncl ? mul(Rm, Ur) : Ur;

  // 7. reactions Fs = Ksp Up + Kss Us − Feq,s (− the applied joint loads along a held axis, at an inclined roller)
  const KspUp = mul(Ksp, Up), KssUs = mul(Kss, Usp);
  const Fs = supp.map((q, a) => KspUp[a] + KssUs[a] - Feqr[q] - Fr[q]);
  const KU = mul(Kst, U);
  const Rg = KU.map((x, q) => x - F[q] - Feq[q]);   // global reaction components (0 at free DOFs)

  // reactions by name
  const reactions = [];
  supp.forEach((q, a) => {
    const jid = dofs[q].joint;
    if (incl.has(jid) && dofs[q].d < 2) return;
    reactions.push({ name: rnames[q], joint: jid, d: dofs[q].d, value: Fs[a], clamp: clamps.includes(jid) && dofs[q].d === K.rot });
  });
  incl.forEach((r, id) => {
    const a = di(id, 0), b = di(id, 1);
    reactions.push({ name: 'Fh' + id, joint: id, d: 0, value: Rg[a], incl: true });
    reactions.push({ name: 'Fv' + id, joint: id, d: 1, value: Rg[b], incl: true });
    reactions.push({ name: 'Fn' + id, joint: id, d: -1, value: Rg[a] * -r.s + Rg[b] * r.c, incl: true, normal: true });
  });
  reactions.sort((x, y) => x.joint - y.joint || (x.d < 0 ? 9 : x.d) - (y.d < 0 ? 9 : y.d));
  const rMax = Math.max(0, ...reactions.map((r) => Math.abs(r.value)));
  reactions.forEach((r) => { if (Math.abs(r.value) < SNAP * rMax) r.value = 0; });
  const fsMax = Math.max(0, ...Fs.map(Math.abs));
  const FsSnap = Fs.map((x) => (Math.abs(x) < SNAP * fsMax ? 0 : x));

  // 8. member end forces
  members.forEach((mm) => {
    const v6 = vec(6);
    mm.v = subv(U, mm.dofs);
    sel.forEach((p, a) => { v6[p] = mm.v[a]; });
    const u6 = mul(mm.T6, v6);
    const Q6 = mul(mm.k6, u6).map((x, p) => x + mm.qf6[p]);
    mm.u6 = releasedRotations(mm.kRigid, mm.qfRigid, u6, mm.released);
    mm.u = subv(u6, sel);
    mm.Q6 = Q6;
  });
  const qMax = Math.max(0, ...members.flatMap((mm) => Array.from(mm.Q6).map(Math.abs)));
  members.forEach((mm) => {
    mm.Q6 = mm.Q6.map((x) => (Math.abs(x) < SNAP * qMax ? 0 : x));
    mm.Q = subv(mm.Q6, sel);
    mm.F6 = mul(transpose(mm.T6), mm.Q6);
    mm.Fg = subv(mm.F6, sel);
    mm.N = kind === 'truss' || kind === 'bar' ? mm.Q6[3] : null;
    mm.endRot = mm.released.map((p) => ({ end: ROT_WORD[p], value: mm.u6[p] }));
  });

  // 10. checks (hand-off 4.11)
  const checks = equilibrium(kind, base, J, members, reactions, F, U, Rg, clamps, K);
  return Object.assign(base, { ok: true, U, Ur, Up, Fs: FsSnap, FsRaw: Fs, Usp, Pp, rhs, KppInv, Rg, reactions, checks });
}

// Equilibrium residuals: global, per joint (truss, bar) or per member (beam, frame), hinges.
function equilibrium(kind, base, J, members, reactions, F, U, Rg, clamps, K) {
  const out = {};
  // global: joint loads + member loads + reactions
  let fx = 0, fy = 0, mz = 0, fScale = 0, mScale = 0;
  const addF = (x, y, px, py) => { fx += x; fy += y; mz += px * y - py * x; fScale = Math.max(fScale, Math.abs(x), Math.abs(y)); mScale = Math.max(mScale, Math.abs(px * y - py * x)); };
  const addM = (m) => { mz += m; mScale = Math.max(mScale, Math.abs(m)); };
  base.ids.forEach((id) => {
    const j = J.get(id), px = j.x || 0, py = j.y || 0;
    const loads = K.load.map((k) => j[k] || 0);
    if (kind === 'truss' || kind === 'frame') { addF(loads[0], loads[1], px, py); if (kind === 'frame') addM(loads[2]); }
    else if (kind === 'beam') { addF(0, loads[0], px, 0); addM(loads[1]); }
    else addF(loads[0], 0, px, 0);
  });
  reactions.forEach((r) => {
    if (r.normal) return;
    const j = J.get(r.joint), px = j.x || 0, py = j.y || 0;
    const comp = K.R[r.d];
    if (comp === 'Fh') addF(r.value, 0, px, py);
    else if (comp === 'Fv') addF(0, r.value, px, kind === 'beam' ? 0 : py);
    else if (comp === 'F') addF(r.value, 0, px, 0);
    else addM(r.value);
  });
  members.forEach((mm) => {
    const a = J.get(mm.i), xb = a.x || 0, yb = kind === 'beam' || kind === 'bar' ? 0 : (a.y || 0);
    mm.items.forEach((it) => {
      const r = resultant(it), c = mm.c, s = mm.s;
      const gx = r.fx * c - r.fy * s, gy = r.fx * s + r.fy * c;
      // moment about the origin = moment of the resultant through b + its moment about b
      fx += gx; fy += gy; mz += xb * gy - yb * gx + r.m;
      fScale = Math.max(fScale, Math.abs(gx), Math.abs(gy)); mScale = Math.max(mScale, Math.abs(xb * gy - yb * gx), Math.abs(r.m));
    });
  });
  const lever = Math.max(1e-30, ...base.ids.map((id) => Math.hypot(J.get(id).x || 0, J.get(id).y || 0)));
  mScale = Math.max(mScale, fScale * lever);
  out.global = { fx, fy, mz, rel: Math.max(fScale ? Math.abs(fx) / fScale : 0, fScale ? Math.abs(fy) / fScale : 0, mScale ? Math.abs(mz) / mScale : 0) };
  if (kind === 'truss' || kind === 'bar') {
    // joint equilibrium: member end forces on the joint + loads + reactions
    const res = vec(base.dofs.length);
    members.forEach((mm) => mm.dofs.forEach((q, a) => { res[q] -= mm.Fg[a]; }));
    F.forEach((x, q) => { res[q] += x + Rg[q]; });
    let worst = 0, at = null;
    res.forEach((x, q) => { if (Math.abs(x) > worst) { worst = Math.abs(x); at = base.dofs[q].joint; } });
    out.joint = { rel: fScale ? worst / fScale : 0, joint: at };
  } else {
    let worst = 0, at = null;
    members.forEach((mm) => {
      const Q = mm.Q6;
      let sx = Q[0] + Q[3], sy = Q[1] + Q[4], sm = Q[2] + Q[5] + Q[4] * mm.L;
      let fs = Math.max(Math.abs(Q[0]), Math.abs(Q[1]), Math.abs(Q[3]), Math.abs(Q[4])), ms = Math.max(Math.abs(Q[2]), Math.abs(Q[5]), Math.abs(Q[4] * mm.L));
      mm.items.forEach((it) => { const r = resultant(it); sx += r.fx; sy += r.fy; sm += r.m; fs = Math.max(fs, Math.abs(r.fx), Math.abs(r.fy)); ms = Math.max(ms, Math.abs(r.m)); });
      ms = Math.max(ms, fs * mm.L);
      const rel = Math.max(fs ? Math.abs(sx) / fs : 0, fs ? Math.abs(sy) / fs : 0, ms ? Math.abs(sm) / ms : 0);
      if (at == null || rel > worst) { worst = rel; at = mm.id; }
    });
    out.member = { rel: worst, member: at };
    // hinges: M = 0 at every released end and every imaginary clamp moment = 0
    const mMax = Math.max(1e-300, ...members.flatMap((mm) => [Math.abs(mm.Q6[2]), Math.abs(mm.Q6[5])]));
    let hw = 0;
    members.forEach((mm) => mm.released.forEach((p) => { hw = Math.max(hw, Math.abs(mm.Q6[p]) / mMax); }));
    reactions.forEach((r) => { if (r.clamp) hw = Math.max(hw, Math.abs(r.value) / mMax); });
    const hasHinge = members.some((mm) => mm.released.length) || clamps.length;
    out.hinge = hasHinge ? { rel: hw } : null;
  }
  out.tol = EQ;
  return out;
}

// Crossing members (truss, frame): segments that cross away from shared joints. A note, not an error.
export function crossings(model) {
  if (model.kind === 'beam' || model.kind === 'bar') return [];
  const J = new Map(model.joints.map((j) => [j.id, j])), out = [];
  const seg = model.members.map((m) => ({ id: m.id, i: m.i, j: m.j, a: J.get(m.i), b: J.get(m.j) })).filter((x) => x.a && x.b);
  for (let p = 0; p < seg.length; p++) for (let q = p + 1; q < seg.length; q++) {
    const A = seg[p], B = seg[q];
    if (A.i === B.i || A.i === B.j || A.j === B.i || A.j === B.j) continue;
    const d1x = A.b.x - A.a.x, d1y = A.b.y - A.a.y, d2x = B.b.x - B.a.x, d2y = B.b.y - B.a.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12 * (Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y))) continue;
    const t = ((B.a.x - A.a.x) * d2y - (B.a.y - A.a.y) * d2x) / den, u = ((B.a.x - A.a.x) * d1y - (B.a.y - A.a.y) * d1x) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) out.push([A.id, B.id]);
  }
  return out;
}
