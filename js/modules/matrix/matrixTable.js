// UI: a matrix labelled with its DOF names, with the partition colours of the Excel programs
// (hand-off 7.4): Kpp yellow, Kps red, Ksp blue, Kss green, as a tint with solid borders between blocks.
import { h } from '../../ui/dom.js';

// Matrix entries: 4 decimals; an exponent for very large or very small magnitudes.
export function fmtMx(x) {
  if (typeof x !== 'number' || !isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e7 || a < 1e-4) {
    const [m, e] = x.toExponential(4).split('e');
    return m.replace('-', '−') + 'E' + (e[0] === '-' ? '−' : '+') + e.replace(/^[+-]/, '').padStart(2, '0');
  }
  return x.toFixed(4).replace('-', '−');
}

const BLOCK = { pp: 'Kpp', ps: 'Kps', sp: 'Ksp', ss: 'Kss' };

export function partitionLegend() {
  return h('div', { class: 'mx-legend' }, [['pp', 'Kpp: free rows, free columns'], ['ps', 'Kps: free rows, supported columns'], ['sp', 'Ksp: supported rows, free columns'], ['ss', 'Kss: supported rows, supported columns']].map(([k, t]) =>
    h('span', { class: 'mx-key' }, h('span', { class: 'mx-sw mx-' + k }), t)));
}

// opts: { rows, cols, data, nFree (partition split, optional), fmt, label, colStart, colEnd }
export function matrixTable(opts) {
  const { rows, cols, data } = opts, f = opts.fmt || fmtMx, nf = opts.nFree;
  const c0 = opts.colStart || 0, c1 = opts.colEnd != null ? opts.colEnd : cols.length;
  const part = nf != null;
  const blk = (i, j) => (i < nf ? (j < nf ? 'pp' : 'ps') : (j < nf ? 'sp' : 'ss'));
  const head = h('tr', null, h('th', { class: 'mx-corner', scope: 'col' }, opts.corner || ''), cols.slice(c0, c1).map((c, jj) => {
    const j = c0 + jj;
    return h('th', { scope: 'col', class: part && j === nf ? 'mx-cut' : null }, c);
  }));
  const body = rows.map((rn, i) => h('tr', { class: part && i === nf ? 'mx-cutrow' : null }, h('th', { scope: 'row' }, rn),
    cols.slice(c0, c1).map((c, jj) => {
      const j = c0 + jj, x = Array.isArray(data[i]) || ArrayBuffer.isView(data[i]) ? data[i][j] : data[i];
      return h('td', { class: [part ? 'mx-' + blk(i, j) : '', part && j === nf ? 'mx-cut' : ''].join(' ').trim() || null, title: part ? BLOCK[blk(i, j)] + ' (' + rn + ', ' + c + ')' : null }, typeof x === 'string' ? x : f(x));
    })));
  return h('table', { class: 'mxt' + (part ? ' part' : ''), 'aria-label': opts.label || 'Matrix' }, h('thead', null, head), h('tbody', null, body));
}

// A scrolling matrix inside a card; above 24 DOF it opens collapsed behind a button.
export function matrixBlock(opts) {
  const wrap = h('div', { class: 'mx-wrap' });
  if (opts.title) wrap.appendChild(h('div', { class: 'mx-title' }, opts.title));
  if (opts.nFree != null && opts.legend !== false) wrap.appendChild(partitionLegend());
  const tbl = h('div', { class: 'tblwrap scrollx mx-scroll' }, matrixTable(opts));
  if (opts.cols.length > 24 && !opts.open) {
    tbl.classList.add('hide');
    const btn = h('button', { type: 'button', class: 'btn', onClick: () => { tbl.classList.remove('hide'); btn.remove(); } }, 'Show the full matrix (' + opts.rows.length + ' × ' + opts.cols.length + ')');
    wrap.appendChild(btn);
  }
  wrap.appendChild(tbl);
  if (opts.note) wrap.appendChild(h('p', { class: 'tblnote' }, opts.note));
  return wrap;
}

// Balanced column strips for print: 66 columns -> 17, 17, 16, 16 (at most max per strip).
export function strips(n, max = 20) {
  const k = Math.ceil(n / max), out = [];
  let start = 0;
  for (let s = 0; s < k; s++) { const w = Math.ceil((n - start) / (k - s)); out.push([start, start + w]); start += w; }
  return out;
}
export function matrixStrips(opts, max = 20) {
  return strips(opts.cols.length, max).map(([a, b]) => matrixTable(Object.assign({}, opts, { colStart: a, colEnd: b })));
}
