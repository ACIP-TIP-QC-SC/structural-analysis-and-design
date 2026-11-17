// Number formatting. Round only for display, never for reuse.
import { fromSI, unitLabel } from './units.js';

const DASH = '–';
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

// 4 significant figures; 1000 and above as a whole number with thousands separators.
// Very large or very small magnitudes are shown as a power of ten so they stay readable.
export function fmt(x) {
  if (typeof x !== 'number' || !isFinite(x)) return DASH;
  if (x === 0 || Math.abs(x) < 1e-9) return '0';
  const a = Math.abs(x);
  if (a >= 1e7 || a < 1e-5) {
    const e = Math.floor(Math.log10(a));
    let m = Number((x / Math.pow(10, e)).toPrecision(4)), ee = e;
    if (Math.abs(m) >= 10) { m /= 10; ee += 1; }
    return m + ' × 10' + String(ee).split('').map((ch) => SUP[ch]).join('');
  }
  if (a >= 1000) return Math.round(x).toLocaleString('en-US');
  return String(Number(x.toPrecision(4)));
}

// Demand over capacity: always 3 decimals; above 10 prints "> 10".
export function fmtDC(x) {
  if (typeof x !== 'number' || isNaN(x)) return DASH;
  if (x > 10) return '> 10';
  return x.toFixed(3);
}

// A raw SI value with its quantity, in the chosen unit system.
export function fmtQ(v, q, sys, withUnit = true) {
  if (typeof v === 'string') return v;
  const s = fmt(fromSI(v, q, sys));
  const u = withUnit ? unitLabel(q, sys) : '';
  if (!u) return s;
  return u === '°' ? s + u : s + ' ' + u;
}

// Render a token array (strings and {v, q, u, si} objects) as one line of text.
// u: show the unit. si: keep the value in SI with its unit (used where an empirical
// formula carries coefficients that only hold in SI units).
export function renderTokens(tokens, sys) {
  if (tokens == null) return '';
  if (!Array.isArray(tokens)) {
    if (typeof tokens === 'object' && (tokens.SI || tokens.US)) return renderTokens(tokens[sys] || tokens.SI, sys);
    return String(tokens);
  }
  return tokens.map((t) => {
    if (t == null) return '';
    if (typeof t === 'string') return t;
    if (typeof t === 'number') return fmt(t);
    if (t.dc) return fmtDC(t.v);
    if (t.si) return fmtQ(t.v, t.q, 'SI', sys === 'US' || !!t.u);
    return fmtQ(t.v, t.q, sys, !!t.u);
  }).join('');
}
