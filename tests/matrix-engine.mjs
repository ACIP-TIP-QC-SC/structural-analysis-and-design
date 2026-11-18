// Unit tests of the direct stiffness engine (hand-off 11.2.3): node tests/matrix-engine.mjs
// Also run by tests/run.mjs. Exports engineTests() -> [{ name, ok, detail }].
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(root, p)));

export async function engineTests() {
  const { analyse } = await imp('js/modules/matrix/dsm.js');
  const { kLocal, T6, condense } = await imp('js/modules/matrix/elements.js');
  const { mul, transpose } = await imp('js/modules/matrix/linalg.js');
  const out = [];
  const t = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail || '' });
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

  // 1. K is symmetric (frame with a release, a load and an inclined roller)
  const frame = {
    kind: 'frame',
    joints: [{ id: 1, x: 0, y: 0, support: 'fixed' }, { id: 2, x: 0, y: 4, support: 'free', FX: 10 }, { id: 3, x: 6, y: 5, support: 'free' }, { id: 4, x: 6, y: 0, support: 'inclined', angle: 30 }],
    members: [{ id: 1, i: 1, j: 2, E: 200e6, A: 0.01, I: 2e-4 }, { id: 2, i: 2, j: 3, E: 200e6, A: 0.01, I: 2e-4, release: 'j' }, { id: 3, i: 4, j: 3, E: 200e6, A: 0.01, I: 2e-4 }],
    items: { 2: [{ kind: 'wy', a: 0, b: 6.08, w1: -12, w2: -12 }] }
  };
  const r1 = analyse(frame);
  let asym = 0;
  r1.K.forEach((row, i) => row.forEach((x, j) => { asym = Math.max(asym, Math.abs(x - r1.K[j][i]) / Math.max(Math.abs(x), 1)); }));
  t('K is symmetric', r1.ok && asym < 1e-12, 'largest asymmetry ' + asym.toExponential(2));

  // 2. a rigid translation of an unsupported member gives no end force (global K of a sloping member)
  const k = kLocal(200e6, 0.02, 3e-4, 5), T = T6(0.6, 0.8), K = mul(transpose(T), mul(k, T));
  const rx = mul(K, Float64Array.from([1, 0, 0, 1, 0, 0])), ry = mul(K, Float64Array.from([0, 1, 0, 0, 1, 0]));
  const scale = Math.max(...K.flatMap((row) => Array.from(row).map(Math.abs)));
  const worst = Math.max(...rx.map(Math.abs), ...ry.map(Math.abs)) / scale;
  t('rigid translation of a member gives zero force', worst < 1e-12, 'largest ' + worst.toExponential(2));
  const tk = kLocal(200e6, 0.02, 0, 5), Tt = mul(transpose(T), mul(tk, T));
  const sums = [0, 1].map((d) => Math.max(...Tt.map((row) => Math.abs(row[d] + row[d + 3]))));
  t('truss member: each row sums to zero in each direction', Math.max(...sums) < 1e-9 * scale, sums.map((x) => x.toExponential(1)).join(', '));

  // 3. a square truss with no diagonal is a mechanism, caught at Uh4
  const sq = analyse({ kind: 'truss', joints: [{ id: 1, x: 0, y: 0, support: 'pin' }, { id: 2, x: 4, y: 0, support: 'rollerY' }, { id: 3, x: 4, y: 4, support: 'free', FX: 5 }, { id: 4, x: 0, y: 4, support: 'free' }],
    members: [{ id: 1, i: 1, j: 2, E: 1, A: 1 }, { id: 2, i: 2, j: 3, E: 1, A: 1 }, { id: 3, i: 3, j: 4, E: 1, A: 1 }, { id: 4, i: 4, j: 1, E: 1, A: 1 }] });
  t('square truss without a diagonal: mechanism at Uh4', !sq.ok && sq.unstable && sq.unstable.name === 'Uh4' && /unstable \(a mechanism\): it can move at Uh4 \(joint 4\)/.test(sq.errors[0]), sq.unstable ? sq.unstable.name : String(sq.errors));

  // 4. a rigid-body settlement of every support gives zero member forces
  const tr = analyse({ kind: 'truss', joints: [{ id: 1, x: 0, y: 0, support: 'pin', settleY: -0.02 }, { id: 2, x: 8, y: 0, support: 'rollerY', settleY: -0.02 }, { id: 3, x: 4, y: 3, support: 'free' }],
    members: [{ id: 1, i: 1, j: 2, E: 200e6, A: 0.001 }, { id: 2, i: 2, j: 3, E: 200e6, A: 0.001 }, { id: 3, i: 1, j: 3, E: 200e6, A: 0.001 }] });
  const nmax = tr.ok ? Math.max(...tr.members.map((m) => Math.abs(m.N))) : NaN;
  t('rigid-body settlement gives zero member forces', tr.ok && nmax < 1e-6 && Math.abs(tr.U[5] + 0.02) < 1e-12, 'largest |N| ' + nmax);
  const fr = analyse({ kind: 'frame', joints: [{ id: 1, x: 0, y: 0, support: 'fixed', settleX: 0.01, settleY: -0.02 }, { id: 2, x: 0, y: 3, support: 'free' }, { id: 3, x: 5, y: 3, support: 'hinge', settleX: 0.01, settleY: -0.02 }],
    members: [{ id: 1, i: 1, j: 2, E: 200e6, A: 0.01, I: 1e-4 }, { id: 2, i: 2, j: 3, E: 200e6, A: 0.01, I: 1e-4 }] });
  const qmax = fr.ok ? Math.max(...fr.members.flatMap((m) => Array.from(m.Q6).map(Math.abs))) : NaN;
  t('frame: rigid-body settlement gives zero end forces', fr.ok && qmax < 1e-6, 'largest |Q| ' + qmax);

  // 5. condensation for MT 1 gives 3EI/L³, 3EI/L², 3EI/L
  const E = 200e6, I = 4e-4, L = 6, kb = kLocal(E, 0.01, I, L);
  const c1 = condense(kb, new Float64Array(6), [2]).k;
  const ok5 = rel(c1[1][1], 3 * E * I / L ** 3) < 1e-12 && rel(c1[1][5], 3 * E * I / L ** 2) < 1e-12 && rel(c1[5][5], 3 * E * I / L) < 1e-12 && c1[2][2] === 0 && rel(c1[0][0], E * 0.01 / L) < 1e-12;
  t('condensation for MT 1: 3EI/L³, 3EI/L², 3EI/L', ok5, [c1[1][1], c1[1][5], c1[5][5]].map((x) => x.toPrecision(6)).join(', '));
  const q1 = condense(kb, Float64Array.from([0, 30, 30, 0, 30, -30]), [2]).qf;
  t('condensation for MT 1: Qf2 = Qf2 − 1.5 Qf3/L', rel(q1[1], 30 - 1.5 * 30 / L) < 1e-12 && rel(q1[5], -30 - 0.5 * 30) < 1e-12 && q1[2] === 0, Array.from(q1).map((x) => x.toPrecision(5)).join(', '));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await engineTests();
  rows.forEach((r) => console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.name + (r.detail ? '  (' + r.detail + ')' : '')));
  const bad = rows.filter((r) => !r.ok).length;
  console.log(rows.length + ' engine tests, ' + bad + ' failed.');
  process.exitCode = bad ? 1 : 0;
}
