// Helpers shared by the footing calc files. Pure.
import { sqrtFc } from '../rc/shear-torsion.calc.js';
import { rhoFromRn } from '../rc/common.js';

// Net allowable soil pressure, kPa. h in mm, Df in m.
export function netAllowable(p) {
  if (p.qaNet) return { qe: p.qa, wc: 0, ws: 0 };
  const hm = p.h / 1000, wc = p.gammaC * hm, ws = p.gammaS * (p.Df - hm);
  return { qe: p.qa - wc - ws, wc, ws };
}
// Two-way shear stress of concrete, MPa (clause key found.twoWayVc). Returns the three values and the least.
export function twoWayVc(fc, betaCol, alphaS, d, bo, lambda, ed) {
  const T = ed.concrete.twoWay, rt = lambda * sqrtFc(fc, ed);
  const a = T.a * rt, b = T.b * (1 + 2 / betaCol) * rt, c = T.c * (2 + alphaS * d / bo) * rt, vc = Math.min(a, b, c);
  return { a, b, c, vc, governs: vc === a ? 'a' : vc === b ? 'b' : 'c' };
}
// Flexural steel of a footing strip. Mu in kN·m, width, d, h in mm. Returns areas in mm².
export function footingSteel(Mu, width, d, h, fc, fy, ed) {
  const C = ed.concrete, phi = C.designAssume.phi, Rn = Mu * 1e6 / (phi * width * d * d), rho = rhoFromRn(Rn, fc, fy, C.sb);
  const ratio = C.AsMinSlabRatio(fy), AsMin = ratio * width * h, As = rho * width * d;
  return { phi, Rn, rho, ratio, As, AsMin, AsUse: Math.max(As, AsMin), ok: isFinite(rho) };
}
