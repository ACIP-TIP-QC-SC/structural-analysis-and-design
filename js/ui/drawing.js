// SVG drawing kit. Everything is drawn to scale from result.diagram by the module's draw().
import { s } from './dom.js';
export { lineChart } from './charts.js';

export function canvas(w, hgt, label, opts) {
  const cls = 'dg' + (opts && opts.show && opts.show.dim === false ? ' nodim' : '');
  const el = s('svg', { class: cls, viewBox: `0 0 ${w} ${hgt}`, role: 'img', 'aria-label': label });
  el.add = (...kids) => { kids.flat().forEach((k) => { if (k) el.appendChild(k); }); return el; };
  return el;
}

// Scale a world box (ww x wh) to fit a screen box, centred. Returns mapping functions.
export function fit(ww, wh, bx, by, bw, bh) {
  const k = Math.min(bw / Math.max(ww, 1e-9), bh / Math.max(wh, 1e-9));
  const ox = bx + (bw - ww * k) / 2, oy = by + (bh - wh * k) / 2;
  return { k, x: (v) => ox + v * k, y: (v) => oy + v * k, w: ww * k, h: wh * k, ox, oy };
}

const r1 = (v) => Math.round(v * 10) / 10;
export const g = (cls, ...kids) => s('g', { class: cls }, kids.flat());
export const rect = (x, y, w, hh, cls) => s('rect', { class: cls, x: r1(x), y: r1(y), width: r1(Math.max(w, 0)), height: r1(Math.max(hh, 0)) });
export const line = (x1, y1, x2, y2, cls = 'ax') => s('line', { class: cls, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) });
export const circle = (cx, cy, r, cls = 'bar') => s('circle', { class: cls, cx: r1(cx), cy: r1(cy), r: r1(r) });
export const poly = (pts, cls = 'poly') => s('polygon', { class: cls, points: pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ') });
export const pline = (pts, cls = 'ax') => s('polyline', { class: cls, points: pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ') });
export const path = (d, cls = 'ax') => s('path', { class: cls, d });
export function text(x, y, str, anchor, cls) {
  return s('text', { x: r1(x), y: r1(y), 'text-anchor': anchor || null, class: cls || null }, str);
}
export const cap = (x, y, str) => text(x, y, str, 'middle', 'cap');

// Horizontal dimension line with end ticks and a centred label (below the line by default).
export function dimH(x1, x2, y, label, above) {
  return g('dimg', line(x1, y, x2, y, 'dim'), line(x1, y - 4, x1, y + 4, 'dim'), line(x2, y - 4, x2, y + 4, 'dim'),
    text((x1 + x2) / 2, above ? y - 5 : y + 13, label, 'middle'));
}
// Vertical dimension line; the label sits to the left (or right) of the line.
export function dimV(x, y1, y2, label, right) {
  return g('dimg', line(x, y1, x, y2, 'dim'), line(x - 4, y1, x + 4, y1, 'dim'), line(x - 4, y2, x + 4, y2, 'dim'),
    text(right ? x + 6 : x - 6, (y1 + y2) / 2 + 4, label, right ? 'start' : 'end'));
}
// A row of bar circles between x1 and x2.
export function barRow(n, x1, x2, y, r, cls = 'bar') {
  const out = [];
  const count = Math.max(1, Math.min(Math.round(n) || 1, 40));
  for (let i = 0; i < count; i++) out.push(circle(count === 1 ? (x1 + x2) / 2 : x1 + (x2 - x1) * i / (count - 1), y, r, cls));
  return out;
}
// Diagonal hatch strokes along a ground line.
export function hatch(x1, x2, y, len = 7, gap = 9) {
  const out = [];
  for (let x = x1; x <= x2; x += gap) out.push(line(x, y, x - len, y + len, 'hatch'));
  return out;
}
export function arrow(x1, y1, x2, y2, cls = 'arrow') {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 7, wd = 0.42;
  const p1 = [x2 - L * Math.cos(a - wd), y2 - L * Math.sin(a - wd)], p2 = [x2 - L * Math.cos(a + wd), y2 - L * Math.sin(a + wd)];
  return g(null, line(x1, y1, x2, y2, cls), poly([[x2, y2], p1, p2], cls === 'markline' ? 'mark' : 'arrowhead'));
}
// Simple I-shape outline (not to exact fillets), centred at cx, top at y.
export function iShape(cx, y, d, bf, tf, tw, cls = 'steel') {
  const x0 = cx - bf / 2, x1 = cx + bf / 2, w0 = cx - tw / 2, w1 = cx + tw / 2;
  return poly([[x0, y], [x1, y], [x1, y + tf], [w1, y + tf], [w1, y + d - tf], [x1, y + d - tf], [x1, y + d], [x0, y + d], [x0, y + d - tf], [w0, y + d - tf], [w0, y + tf], [x0, y + tf]], cls);
}
