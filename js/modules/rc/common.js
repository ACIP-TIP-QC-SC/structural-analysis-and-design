// Helpers shared by the reinforced concrete calc files. Pure: no DOM, no rounding.
export const barArea = (n, db) => n * Math.PI * db * db / 4;

// Steel ratio for a required strength coefficient Rn (MPa). Returns NaN when the section is too small.
export function rhoFromRn(Rn, fc, fy, sb) {
  const t = 1 - 2 * Rn / (sb * fc);
  return t < 0 ? NaN : (sb * fc / fy) * (1 - Math.sqrt(t));
}

// Warnings for material strengths outside the usual range.
export function materialWarnings(fc, fy, ed, fyName = 'fy') {
  const out = [], C = ed.concrete;
  if (fc < C.fcRange[0] || fc > C.fcRange[1]) out.push("f'c = " + fc + ' MPa is outside the usual range of ' + C.fcRange[0] + ' to ' + C.fcRange[1] + ' MPa.');
  if (fy != null && (fy < C.fyRange[0] || fy > C.fyRange[1])) out.push(fyName + ' = ' + fy + ' MPa is outside the usual range of ' + C.fyRange[0] + ' to ' + C.fyRange[1] + ' MPa.');
  return out;
}

// Round a spacing down to the practical multiple.
export const roundDown = (x, step) => Math.floor(x / step + 1e-9) * step;
// Round up to a multiple (plan dimensions).
export const roundUp = (x, step) => Math.ceil(x / step - 1e-9) * step;
