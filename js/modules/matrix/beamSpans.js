// "By spans" input of the Beams calculator (hand-off 6.3.2, the Excel GENERATE): the beam is described
// by X positions and turned into the joint table, element table and load list. Pure: no DOM, no rounding.
// Input (calc units): { leftX, rightX, spanSupports: [{ x, support, settle, rotation }], hinges: [{ x }],
//   stretches: [{ from, to, E, I }], spanLoads: [{ type, value, w2, start, end }], addAtLoads }
// Output: { joints, members, memberLoads, errors }.
const isNum = (x) => typeof x === 'number' && isFinite(x);
const opt = (x) => (isNum(x) ? x : 0);

export function generate(I) {
  const errors = [];
  const x0 = isNum(I.leftX) ? I.leftX : 0, x1 = I.rightX;
  if (!isNum(x1) || !(x1 > x0)) return { joints: [], members: [], memberLoads: [], errors: ['The right end X must be a number greater than the left end X.'] };
  const L = x1 - x0, tol = 1e-9 * Math.max(1, Math.abs(x0), Math.abs(x1));
  const inside = (x) => isNum(x) && x >= x0 - tol && x <= x1 + tol;
  const sups = (I.spanSupports || []).filter((s) => s && (isNum(s.x) || s.x === '' || s.x == null));
  const hinges = (I.hinges || []).filter((hh) => hh && hh.x !== '' && hh.x != null);
  const stretches = I.stretches || [], loads = I.spanLoads || [];
  sups.forEach((s, k) => { if (!inside(s.x)) errors.push('Support row ' + (k + 1) + ': X must lie on the beam, from ' + x0 + ' to ' + x1 + '.'); });
  hinges.forEach((hh, k) => { if (!inside(hh.x)) errors.push('Hinge row ' + (k + 1) + ': X must lie on the beam.'); });
  // EI stretches must cover the beam with no gap or overlap
  const st = stretches.map((s, k) => ({ k, from: s.from, to: s.to, E: s.E, I: s.I }));
  st.forEach((s) => {
    if (!isNum(s.from) || !isNum(s.to) || !(s.to > s.from)) errors.push('EI stretch row ' + (s.k + 1) + ': "to X" must be greater than "from X".');
    if (!(isNum(s.E) && s.E > 0) || !(isNum(s.I) && s.I > 0)) errors.push('EI stretch row ' + (s.k + 1) + ': E and I must be numbers above zero.');
  });
  if (!st.length) errors.push('Add an EI stretch that covers the beam.');
  if (!errors.length) {
    const sorted = st.slice().sort((p, q) => p.from - q.from);
    if (Math.abs(sorted[0].from - x0) > tol) errors.push('The EI stretches leave a gap at the left end: start the first one at X = ' + x0 + '.');
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].from > sorted[k - 1].to + tol) errors.push('The EI stretches leave a gap from X = ' + sorted[k - 1].to + ' to ' + sorted[k].from + '.');
      if (sorted[k].from < sorted[k - 1].to - tol) errors.push('The EI stretches overlap from X = ' + sorted[k].from + ' to ' + sorted[k - 1].to + '.');
    }
    if (Math.abs(sorted[sorted.length - 1].to - x1) > tol) errors.push('The EI stretches must end at the right end, X = ' + x1 + '.');
  }
  loads.forEach((ld, k) => {
    const pt = ld.type === 'point' || ld.type === 'couple';
    if (!isNum(ld.value)) errors.push('Load row ' + (k + 1) + ': the value needs a number.');
    if (!inside(ld.start)) errors.push('Load row ' + (k + 1) + ': the start X must lie on the beam.');
    if (!pt && (!inside(ld.end) || !(ld.end > ld.start))) errors.push('Load row ' + (k + 1) + ': the end X must lie on the beam, after the start X.');
    if (ld.type === 'linear' && !isNum(ld.w2)) errors.push('Load row ' + (k + 1) + ': a linear load needs w2.');
  });
  if (errors.length) return { joints: [], members: [], memberLoads: [], errors };

  // joints: both ends, supports, hinges, stretch ends (and point loads and couples if asked)
  const xs = [x0, x1];
  sups.forEach((s) => xs.push(s.x));
  hinges.forEach((hh) => xs.push(hh.x));
  st.forEach((s) => xs.push(s.from, s.to));
  if (I.addAtLoads) loads.forEach((ld) => { if (ld.type === 'point' || ld.type === 'couple') xs.push(ld.start); });
  const pos = [];
  xs.sort((p, q) => p - q).forEach((x) => { if (!pos.length || x - pos[pos.length - 1] > tol) pos.push(x); });
  const at = (x) => pos.findIndex((p) => Math.abs(p - x) <= tol);
  const joints = pos.map((x, k) => ({ id: k + 1, x, support: 'free', FY: 0, M: 0, settle: 0, rotation: 0 }));
  sups.forEach((s) => {
    const j = joints[at(s.x)];
    if (s.support && s.support !== 'free') { j.support = s.support; j.settle = opt(s.settle); j.rotation = opt(s.rotation); }
  });
  const members = [];
  for (let k = 0; k + 1 < pos.length; k++) {
    const mid = (pos[k] + pos[k + 1]) / 2, s = st.find((q) => mid >= q.from - tol && mid <= q.to + tol);
    members.push({ id: k + 1, i: k + 1, j: k + 2, E: s.E, I: s.I, release: 'none' });
  }
  // hinges: "Hinge at 2nd joint" on the element to the left (at the left end: 1st joint of the first element)
  const hingeAt = new Set();
  hinges.forEach((hh) => {
    const q = at(hh.x);
    hingeAt.add(q);
    if (q > 0) { const m = members[q - 1]; m.release = m.release === 'i' ? 'both' : 'j'; }
    else { const m = members[0]; m.release = m.release === 'j' ? 'both' : 'i'; }
  });
  const holdsV = (j) => j.support === 'fixed' || j.support === 'pin';
  const holdsD = (j) => j.support === 'fixed' || j.support === 'guided';
  const memberLoads = [];
  loads.forEach((ld, k) => {
    const v = ld.value;
    if (ld.type === 'point' || ld.type === 'couple') {
      const q = at(ld.start);
      if (q >= 0) {
        const j = joints[q];
        if (ld.type === 'couple' && hingeAt.has(q)) { errors.push('Load row ' + (k + 1) + ': A couple at a hinge has no member to act on; move it off the hinge.'); return; }
        const held = ld.type === 'point' ? holdsV(j) : holdsD(j);
        if (!held) { if (ld.type === 'point') j.FY += v; else j.M += v; return; }
        // at a held joint: a load at the end of the element beside it
        if (q < members.length) memberLoads.push({ member: q + 1, type: ld.type, value: v, a: 0, src: k });
        else memberLoads.push({ member: q, type: ld.type, value: v, a: pos[q] - pos[q - 1], src: k });
        return;
      }
      const e = members.findIndex((m, kk) => ld.start > pos[kk] && ld.start < pos[kk + 1]);
      memberLoads.push({ member: e + 1, type: ld.type, value: v, a: ld.start - pos[e], src: k });
      return;
    }
    // distributed loads are cut at the joints, intensities interpolated
    const w1 = v, w2 = ld.type === 'linear' ? ld.w2 : v, a = ld.start, b = ld.end;
    const w = (x) => w1 + (w2 - w1) * (x - a) / (b - a);
    members.forEach((m, kk) => {
      const s0 = Math.max(a, pos[kk]), s1 = Math.min(b, pos[kk + 1]);
      if (!(s1 - s0 > tol)) return;
      const row = { member: m.id, type: ld.type === 'linear' ? 'linear' : 'uniform', value: w(s0), a: s0 - pos[kk], b: s1 - pos[kk], src: k };
      if (ld.type === 'linear') row.w2 = w(s1);
      memberLoads.push(row);
    });
  });
  return { joints, members, memberLoads, errors };
}
