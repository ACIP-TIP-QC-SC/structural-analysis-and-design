// Dense matrices as arrays of Float64Array rows. Pure functions: no DOM, no rounding.

export function zeros(n, m = n) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = new Float64Array(m);
  return a;
}
export function vec(n) { return new Float64Array(n); }
export function copy(a) { return a.map((r) => Float64Array.from(r)); }
export function identity(n) { const a = zeros(n); for (let i = 0; i < n; i++) a[i][i] = 1; return a; }

export function transpose(a) {
  const n = a.length, m = n ? a[0].length : 0, t = zeros(m, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) t[j][i] = a[i][j];
  return t;
}

// Matrix times matrix, or matrix times vector (a Float64Array or plain array).
export function mul(a, b) {
  const n = a.length, isVec = b instanceof Float64Array || typeof b[0] === 'number' || !b.length;
  if (!n) return isVec ? vec(0) : [];
  const inner = a[0].length;
  if (isVec) {
    const out = vec(n);
    for (let i = 0; i < n; i++) { let s = 0; const r = a[i]; for (let k = 0; k < inner; k++) s += r[k] * b[k]; out[i] = s; }
    return out;
  }
  const m = b.length ? b[0].length : 0, out = zeros(n, m);
  for (let i = 0; i < n; i++) {
    const r = a[i], o = out[i];
    for (let k = 0; k < inner; k++) { const x = r[k]; if (x === 0) continue; const bk = b[k]; for (let j = 0; j < m; j++) o[j] += x * bk[j]; }
  }
  return out;
}

// Rows and columns picked by index lists.
export function sub(a, rows, cols) {
  const out = zeros(rows.length, cols.length);
  rows.forEach((r, i) => cols.forEach((c, j) => { out[i][j] = a[r][c]; }));
  return out;
}
export function subv(v, idx) { const out = vec(idx.length); idx.forEach((k, i) => { out[i] = v[k]; }); return out; }

// Solve A x = b by Gaussian elimination with partial pivoting. Returns null if A is singular.
export function solve(A, b) {
  const n = A.length, a = copy(A), x = Float64Array.from(b);
  let scale = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(a[i][j]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (!(Math.abs(a[p][c]) > 1e-14 * scale)) return null;
    if (p !== c) { const t = a[p]; a[p] = a[c]; a[c] = t; const tb = x[p]; x[p] = x[c]; x[c] = tb; }
    const piv = a[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / piv;
      if (f === 0) continue;
      const ar = a[r], ac = a[c];
      for (let k = c; k < n; k++) ar[k] -= f * ac[k];
      x[r] -= f * x[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

// Inverse (for display only), column by column.
export function inverse(A) {
  const n = A.length, inv = zeros(n);
  for (let j = 0; j < n; j++) {
    const e = vec(n); e[j] = 1;
    const col = solve(A, e);
    if (!col) return null;
    for (let i = 0; i < n; i++) inv[i][j] = col[i];
  }
  return inv;
}

// Stability test (hand-off 4.8): elimination without pivoting, in DOF order.
// Returns the index of the first DOF where the pivot falls to tol of its own original
// diagonal (or the diagonal is not positive), or -1 when the matrix is stable.
export function stabilityPivot(A, tol = 1e-9) {
  const n = A.length, a = copy(A), d0 = A.map((r, i) => r[i]);
  for (let j = 0; j < n; j++) {
    if (!(d0[j] > 0)) return j;
    if (!(a[j][j] / d0[j] > tol)) return j;
    for (let i = j + 1; i < n; i++) {
      if (a[i][j] === 0) continue;
      const f = a[i][j] / a[j][j], ai = a[i], aj = a[j];
      for (let c = j; c < n; c++) ai[c] -= f * aj[c];
    }
  }
  return -1;
}

export const toArrays = (a) => a.map((r) => Array.from(r));
