// Elastic analysis of a bolt group or a weld group under an eccentric in-plane load ("Theory").
// Coordinates in mm; loads in kN; moments in kN·mm; weld results per mm of weld (unit throat).
// The load (Px, Py) acts at (ex, ey) measured from the centroid of the group. Counterclockwise moments are positive.

export function boltGroup(points, load) {
  const n = points.length, cx = points.reduce((t, p) => t + p.x, 0) / n, cy = points.reduce((t, p) => t + p.y, 0) / n;
  const rel = points.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const J = rel.reduce((t, p) => t + p.x * p.x + p.y * p.y, 0);
  const M = load.ex * load.Py - load.ey * load.Px;
  const forces = rel.map((p, i) => {
    const tx = J > 0 ? -M * p.y / J : 0, ty = J > 0 ? M * p.x / J : 0;
    const fx = load.Px / n + tx, fy = load.Py / n + ty;
    return { i, x: points[i].x, y: points[i].y, rx: p.x, ry: p.y, tx, ty, dx: load.Px / n, dy: load.Py / n, fx, fy, R: Math.hypot(fx, fy) };
  });
  const crit = forces.reduce((m, f) => (f.R > m.R + 1e-9 ? f : m), forces[0]);
  return { n, cx, cy, J, M, forces, crit };
}

// Rectangular bolt pattern: rows along y at the pitch, columns along x at the gauge.
export function boltPattern(rows, cols, pitch, gauge) {
  const pts = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push({ x: c * gauge, y: r * pitch });
  return pts;
}

// Line segments of unit throat: { x1, y1, x2, y2 }.
export function weldGroup(segments, load) {
  const segs = segments.map((s) => ({ s, L: Math.hypot(s.x2 - s.x1, s.y2 - s.y1), xc: (s.x1 + s.x2) / 2, yc: (s.y1 + s.y2) / 2 })).filter((g) => g.L > 0);
  const L = segs.reduce((t, g) => t + g.L, 0), cx = segs.reduce((t, g) => t + g.L * g.xc, 0) / L, cy = segs.reduce((t, g) => t + g.L * g.yc, 0) / L;
  let Ix = 0, Iy = 0;
  segs.forEach((g) => {
    const y1 = g.s.y1 - cy, y2 = g.s.y2 - cy, x1 = g.s.x1 - cx, x2 = g.s.x2 - cx;
    Ix += g.L * (y1 * y1 + y1 * y2 + y2 * y2) / 3;
    Iy += g.L * (x1 * x1 + x1 * x2 + x2 * x2) / 3;
  });
  const Ip = Ix + Iy, M = load.ex * load.Py - load.ey * load.Px, dx = load.Px / L, dy = load.Py / L;
  const pts = [];
  segs.forEach((g) => [[g.s.x1, g.s.y1], [g.s.x2, g.s.y2]].forEach(([x, y]) => {
    const rx = x - cx, ry = y - cy, tx = -M * ry / Ip, ty = M * rx / Ip, fx = dx + tx, fy = dy + ty;
    pts.push({ x, y, rx, ry, tx, ty, fx, fy, fr: Math.hypot(fx, fy) });
  }));
  const crit = pts.reduce((m, p) => (p.fr > m.fr + 1e-12 ? p : m), pts[0]);
  return { L, cx, cy, Ix, Iy, Ip, M, dx, dy, points: pts, crit };
}

// Helpers for common weld shapes. Coordinates start at the origin of the vertical weld.
export function weldShape(kind, a, b) {
  if (kind === 'parallel') return [{ x1: 0, y1: 0, x2: 0, y2: a }, { x1: b, y1: 0, x2: b, y2: a }];
  if (kind === 'box') return [{ x1: 0, y1: 0, x2: b, y2: 0 }, { x1: b, y1: 0, x2: b, y2: a }, { x1: b, y1: a, x2: 0, y2: a }, { x1: 0, y1: a, x2: 0, y2: 0 }];
  // C shape: vertical weld of length a, two horizontal legs of length b at its ends.
  return [{ x1: 0, y1: -a / 2, x2: 0, y2: a / 2 }, { x1: 0, y1: a / 2, x2: b, y2: a / 2 }, { x1: 0, y1: -a / 2, x2: b, y2: -a / 2 }];
}
