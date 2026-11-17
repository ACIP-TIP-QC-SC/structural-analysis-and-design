// Development lengths and splices (bars in tension and compression, standard hooks, lap splices).
// Shared by Development and splices, Dowels, Retaining walls and Pile caps. Pure: no DOM, no rounding.
// Lengths in mm, stresses in MPa.

export const devSqrtFc = (fc, ed) => Math.min(Math.sqrt(fc), ed.concrete.dev.sqrtFcMax);
const small = (db, ed) => db <= ed.concrete.dev.smallBarMax;

// Modification factors for straight bars in tension. p: { db, top, coating: 'none'|'epoxy'|'epoxyClose' }
export function tensionFactors(p, ed) {
  const D = ed.concrete.dev, psiT = p.top ? D.psiT.top : D.psiT.other, psiE = D.psiE[p.coating || 'none'];
  return { psiT, psiE, psiTE: Math.min(psiT * psiE, D.psiTEMax), psiS: small(p.db, ed) ? D.psiS.small : D.psiS.large };
}

// Simplified method. p: { db, fy, fc, lambda, top, coating, favourable }. Returns ld before the 300 mm minimum.
export function ldSimplified(p, ed) {
  const D = ed.concrete.dev, f = tensionFactors(p, ed);
  const X = (p.favourable ? D.simple.good : D.simple.other)[small(p.db, ed) ? 'small' : 'large'];
  return Object.assign({ X, rt: devSqrtFc(p.fc, ed), ld: p.fy * f.psiTE / (X * p.lambda * devSqrtFc(p.fc, ed)) * p.db }, f);
}

// General equation. p adds { cb, Atr, s, n } (Ktr = 0 when Atr is 0 or missing).
export function ldGeneral(p, ed) {
  const D = ed.concrete.dev, f = tensionFactors(p, ed);
  const Ktr = p.Atr > 0 && p.s > 0 && p.n > 0 ? D.general.ktr * p.Atr / (p.s * p.n) : 0;
  const confRaw = (p.cb + Ktr) / p.db, conf = Math.min(confRaw, D.general.confMax);
  const ld = (p.fy / (D.general.k * p.lambda * devSqrtFc(p.fc, ed))) * (f.psiTE * f.psiS / conf) * p.db;
  return Object.assign({ Ktr, confRaw, conf, ld, rt: devSqrtFc(p.fc, ed) }, f);
}

// Development length in tension with the minimum and the optional excess reinforcement factor.
export function ldTension(raw, ratio, ed) {
  const r = ratio > 0 && ratio < 1 ? ratio : 1;
  return { reduced: raw * r, ld: Math.max(raw * r, ed.concrete.dev.ldMin), factor: r };
}

// Standard hook in tension. p: { db, fy, fc, lambda, epoxy, psiC, psiR }
export function ldHook(p, ed) {
  const H = ed.concrete.dev.hook, rt = devSqrtFc(p.fc, ed);
  const psiE = p.epoxy ? H.psiE : 1, psiC = p.psiC && p.db <= H.maxBar ? H.psiC : 1, psiR = p.psiR && p.db <= H.maxBar ? H.psiR : 1;
  const basic = H.k * p.fy * psiE * psiC * psiR / (p.lambda * rt) * p.db;
  return { psiE, psiC, psiR, rt, basic, minDb: H.minDb * p.db, min: H.min, ldh: Math.max(basic, H.minDb * p.db, H.min) };
}

// Standard hook geometry (clause key dev.hook.geometry), shown as a note.
export function hookGeometry(db, ed) {
  const G = ed.concrete.dev.hookGeometry, row = G.bend.find((r) => db <= r.max);
  return { ext90: G.ext90 * db, ext180: Math.max(G.ext180Db * db, G.ext180Min), bendDia: row.db * db, bendDb: row.db };
}

// Development in compression. p: { db, fy, fc, lambda, confined }
export function ldCompression(p, ed) {
  const K = ed.concrete.dev.comp, psiR = p.confined ? K.psiR : 1, rt = devSqrtFc(p.fc, ed);
  const a = K.k * p.fy * psiR / (p.lambda * rt) * p.db, b = K.k2 * p.fy * psiR * p.db;
  return { psiR, rt, a, b, ldc: Math.max(a, b, K.min) };
}

// Tension lap splice from ld computed without the 300 mm minimum and without the excess factor.
export function lapTension(ldRaw, classB, ed) {
  const T = ed.concrete.dev.lapT, k = classB ? T.B : T.A;
  return { k, lap: Math.max(k * ldRaw, T.min), cls: classB ? 'B' : 'A' };
}

// Compression lap splice of one bar size.
export function lapCompression(p, ed) {
  const K = ed.concrete.dev.lapC;
  const base = p.fy <= K.fyBreak ? K.a * p.fy * p.db : (K.b * p.fy - K.c) * p.db;
  const low = p.fc < K.fcLow;
  const lap = Math.max(base, K.min) * (low ? K.lowFactor : 1);
  return { base, low, lap, highFy: p.fy > K.fyBreak };
}

// Compression lap between bars of different sizes: greater of ldc of the larger bar and the lap of the smaller.
export function lapCompressionMixed(p, ed) {
  const big = Math.max(p.db1, p.db2), little = Math.min(p.db1, p.db2);
  const ldc = ldCompression({ db: big, fy: p.fy, fc: p.fc, lambda: p.lambda, confined: p.confined }, ed);
  const lap = lapCompression({ db: little, fy: p.fy, fc: p.fc }, ed);
  return { big, little, ldcBig: ldc.ldc, lapSmall: lap.lap, lap: Math.max(ldc.ldc, lap.lap) };
}
