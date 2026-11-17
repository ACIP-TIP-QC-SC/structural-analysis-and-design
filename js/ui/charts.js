// Generic line chart: series, axes and markers. Kept free of any module knowledge.
// Axes may run negative (interaction diagrams, shear and moment diagrams).
import { s } from './dom.js';
import { fmt } from '../core/format.js';

function niceRange(lo, hi) {
  if (!(hi > lo)) { const p = Math.abs(hi) || 1; return [lo - p, hi + p]; }
  return [lo, hi];
}

// opts: { x, y, w, h, series: [{ pts: [[x, y]], cls, closed, fill }], xLabel, yLabel,
//         vlines: [{ x, label }], hlines: [{ y, label }], markers: [{ x, y, label }],
//         ray: { x, y } (line from the origin through and past the point),
//         xMin, xMax, yMin, yMax, fx, fy, pad }
// A series with fill: true is drawn as a filled diagram against y = 0 (shear and moment diagrams).
export function lineChart(opts) {
  const g = s('g', { class: 'chart' });
  const all = opts.series.flatMap((se) => se.pts).concat((opts.markers || []).map((m) => [m.x, m.y]));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const pad = opts.pad == null ? 0.08 : opts.pad;
  let x0 = opts.xMin != null ? opts.xMin : Math.min(0, ...xs), x1 = opts.xMax != null ? opts.xMax : Math.max(...xs, 1e-9);
  let y0 = opts.yMin != null ? opts.yMin : Math.min(0, ...ys), y1 = opts.yMax != null ? opts.yMax : Math.max(...ys, 1e-9);
  [x0, x1] = niceRange(x0, x1); [y0, y1] = niceRange(y0, y1);
  const span = y1 - y0;
  if (opts.yMax == null) y1 += pad * span;
  if (opts.yMin == null && y0 < 0) y0 -= pad * span;
  const X = (v) => opts.x + (v - x0) / (x1 - x0) * opts.w;
  const Y = (v) => opts.y + opts.h - (v - y0) / (y1 - y0) * opts.h;
  const fx = opts.fx || fmt, fy = opts.fy || fmt;
  const xAxisY = Y(Math.min(Math.max(0, y0), y1)), yAxisX = X(Math.min(Math.max(0, x0), x1));
  g.appendChild(s('path', { class: 'ax', d: `M${opts.x},${opts.y + opts.h} H${opts.x + opts.w}` }));
  g.appendChild(s('path', { class: 'ax', d: `M${opts.x},${opts.y} V${opts.y + opts.h}` }));
  if (y0 < 0 && y1 > 0) g.appendChild(s('line', { class: 'thin', x1: opts.x, y1: xAxisY, x2: opts.x + opts.w, y2: xAxisY }));
  if (x0 < 0 && x1 > 0) g.appendChild(s('line', { class: 'thin', x1: yAxisX, y1: opts.y, x2: yAxisX, y2: opts.y + opts.h }));
  const ticks = (lo, hi) => {
    const raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag, out = [];
    for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9 * step; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return out;
  };
  ticks(x0, x1).forEach((xv) => {
    g.appendChild(s('line', { class: 'thin', x1: X(xv), y1: opts.y + opts.h, x2: X(xv), y2: opts.y + opts.h + 4 }));
    g.appendChild(s('text', { x: X(xv), y: opts.y + opts.h + 15, 'text-anchor': 'middle' }, fx(xv)));
  });
  ticks(y0, y1).forEach((yv) => {
    g.appendChild(s('line', { class: 'thin', x1: opts.x - 4, y1: Y(yv), x2: opts.x, y2: Y(yv) }));
    g.appendChild(s('text', { x: opts.x - 6, y: Y(yv) + 4, 'text-anchor': 'end' }, fy(yv)));
  });
  (opts.vlines || []).forEach((vl) => {
    if (!(vl.x >= x0 && vl.x <= x1)) return;
    g.appendChild(s('line', { class: 'dash', x1: X(vl.x), y1: opts.y, x2: X(vl.x), y2: opts.y + opts.h }));
    if (vl.label) g.appendChild(s('text', { x: X(vl.x) + 3, y: opts.y + 10 }, vl.label));
  });
  (opts.hlines || []).forEach((hl) => {
    if (!(hl.y >= y0 && hl.y <= y1)) return;
    g.appendChild(s('line', { class: 'dash', x1: opts.x, y1: Y(hl.y), x2: opts.x + opts.w, y2: Y(hl.y) }));
    if (hl.label) g.appendChild(s('text', { x: opts.x + opts.w - 3, y: Y(hl.y) - 4, 'text-anchor': 'end' }, hl.label));
  });
  opts.series.forEach((se) => {
    if (!se.pts.length) return;
    const d = se.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ');
    if (se.fill) {
      const base = Y(Math.min(Math.max(0, y0), y1));
      const first = se.pts[0], last = se.pts[se.pts.length - 1];
      g.appendChild(s('path', { class: 'poly', d: `M${X(first[0]).toFixed(1)},${base.toFixed(1)} ` + d.replace(/^M/, 'L') + ` L${X(last[0]).toFixed(1)},${base.toFixed(1)} Z` }));
    } else g.appendChild(s('path', { class: se.cls || 'line', d: se.closed ? d + ' Z' : d }));
  });
  if (opts.ray && (opts.ray.x !== 0 || opts.ray.y !== 0)) {
    // From the origin through the point, extended to the frame.
    const k = Math.min(...[x1 / opts.ray.x, x0 / opts.ray.x, y1 / opts.ray.y, y0 / opts.ray.y].filter((t) => t > 0 && isFinite(t)));
    if (isFinite(k)) g.appendChild(s('line', { class: 'markline', x1: X(0), y1: Y(0), x2: X(opts.ray.x * k), y2: Y(opts.ray.y * k) }));
  }
  (opts.markers || []).forEach((mk) => {
    if (!(mk.x >= x0 && mk.x <= x1 && mk.y >= y0 && mk.y <= y1)) return;
    g.appendChild(s('circle', { class: 'mark', cx: X(mk.x), cy: Y(mk.y), r: 4.5 }));
    if (mk.label) g.appendChild(s('text', { x: X(mk.x) + 8, y: Y(mk.y) - 6 }, mk.label));
  });
  if (opts.xLabel) g.appendChild(s('text', { class: 'cap', x: opts.x + opts.w / 2, y: opts.y + opts.h + 32, 'text-anchor': 'middle' }, opts.xLabel));
  if (opts.yLabel) g.appendChild(s('text', { class: 'cap', x: opts.x - 4, y: opts.y - 8, 'text-anchor': 'start' }, opts.yLabel));
  return g;
}
