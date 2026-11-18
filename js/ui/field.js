// Input field: label with italic symbol, number box in the mono font, unit box.
import { h } from './dom.js';
import { unitLabel, convertTyped, fromSI } from '../core/units.js';
import { fmt } from '../core/format.js';

const close = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(Math.abs(a), Math.abs(b), 1e-12);

// Validation state of a typed value: error (blocks), amber (out of the usual range) or fine.
export function fieldState(f, value, sys) {
  if (f.type === 'list') return listState(f, value);
  if (f.type === 'select' || f.type === 'bar' || f.type === 'check' || f.type === 'shape' || f.type === 'action' || f.type === 'text') return { cls: '', why: '' };
  if (value === '' || value == null) return f.optional ? { cls: '', why: '' } : { cls: 'bad', why: 'Enter a number.' };
  if (typeof value !== 'number' || !isFinite(value)) return { cls: 'bad', why: 'Enter a number.' };
  const lo = f.min != null ? fromSI(f.min, f.quantity, sys) : null, hi = f.max != null ? fromSI(f.max, f.quantity, sys) : null;
  const un = unitLabel(f.quantity, sys);
  if (lo != null && value < lo * (1 - 1e-9)) return { cls: 'amber', why: 'Below the usual minimum of ' + fmt(lo) + (un ? ' ' + un : '') + '.' };
  if (hi != null && value > hi * (1 + 1e-9)) return { cls: 'amber', why: 'Above the usual maximum of ' + fmt(hi) + (un ? ' ' + un : '') + '.' };
  return { cls: '', why: '' };
}

function labelSpan(f) {
  return h('span', null, f.symbol ? h('span', { class: 'sym' }, f.symbol) : null, f.symbol ? ' ' : null, f.label);
}

export function barLabel(size, sys) {
  return sys === 'US' ? size + ' mm (' + fmt(size / 25.4) + ' in)' : size + ' mm';
}

// onChange(key, value, structural): structural = the visible field list may change.
// A list value is an array of row objects in display units. Numeric cells must be numbers, except
// optional cells (blank allowed, stored as ''), select cells (an option value), read-only computed
// cells (not stored) and cells switched off by enabledIf(row).
const isNumCell = (x) => typeof x === 'number' && isFinite(x);
const cellOn = (c, r) => !c.enabledIf || !!c.enabledIf(r);
const editable = (c) => !c.readonly;
export function cellBad(c, r) {
  if (c.readonly || c.type === 'select' || !cellOn(c, r)) return false;
  const x = r[c.key];
  if (x === '' || x == null) return !c.optional;
  return !isNumCell(x);
}
export function listState(f, rows) {
  const min = f.minRows != null ? f.minRows : 1;
  if (!Array.isArray(rows) || rows.length < min) return { cls: 'bad', why: 'Add at least ' + min + ' row' + (min > 1 ? 's' : '') + '.' };
  const bad = rows.some((r) => f.columns.some((c) => cellBad(c, r)));
  if (!bad) return { cls: '', why: '' };
  // A lenient list leaves the message to the calculation, which names the row.
  return f.lenient ? { cls: '', why: 'A cell is empty or not a number (marked red).' } : { cls: 'bad', why: 'Every cell needs a number.' };
}

// Parse pasted rows (tab- or comma-separated, as copied from a spreadsheet) into row objects.
// Columns are the editable columns in order; a select cell takes an option value or label (or its
// leading number, e.g. "3" for "3 Uniform load").
export function parseRows(f, text) {
  const cols = f.columns.filter(editable);
  return String(text || '').split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean).map((ln) => {
    const cells = ln.split(ln.indexOf('\t') >= 0 ? '\t' : ',').map((x) => x.trim());
    if (cells.every((x) => x === '' || isNaN(Number(x))) && cells.some((x) => x)) {
      // a header line: keep it only if it holds a select label
      if (!cols.some((c, i) => c.type === 'select' && cells[i])) return null;
    }
    const row = {};
    cols.forEach((c, i) => {
      const t = cells[i] == null ? '' : cells[i];
      if (c.type === 'select') {
        const lo = t.toLowerCase();
        const o = c.options.find((x) => String(x.value).toLowerCase() === lo || String(x.label).toLowerCase() === lo)
          || c.options.find((x, k) => t !== '' && (String(k + 1) === t || String(x.label).toLowerCase().startsWith(lo + ' ')));
        row[c.key] = o ? o.value : c.options[0].value;
      } else row[c.key] = t === '' ? '' : (isNaN(Number(t)) ? '' : Number(t));
    });
    return row;
  }).filter(Boolean);
}

function renderList(f, value, ctx, onChange) {
  const rows = Array.isArray(value) ? value : [];
  const st = listState(f, rows);
  const min = f.minRows != null ? f.minRows : 1;
  // view: the columns shown in this step (the row keeps every column).
  const shown = f.view ? f.columns.filter((c) => f.view.includes(c.key)) : f.columns;
  const wrap = h('div', { class: 'field wide ' + st.cls, 'data-key': f.key });
  wrap.appendChild(h('span', null, f.symbol ? h('span', { class: 'sym' }, f.symbol) : null, f.symbol ? ' ' : null, f.label));
  const head = h('tr', null, h('th', { scope: 'col' }, f.indexLabel || '#'), shown.map((c) => {
    const un = typeof c.quantity === 'function' ? (c.unitHint ? c.unitHint(ctx.sys) : '') : unitLabel(c.quantity, ctx.sys);
    return h('th', { scope: 'col', class: c.readonly ? 'ro' : null, title: c.title || null }, c.label + (un ? ' (' + un + ')' : ''));
  }), h('th', null, h('span', { class: 'sr' }, 'Remove')));
  const body = h('tbody');
  const setCell = (i, key, val, structural) => {
    const next = rows.map((x) => Object.assign({}, x));
    next[i][key] = val;
    onChange(f.key, next, structural);
  };
  rows.forEach((r, i) => {
    const label = f.rowLabel ? f.rowLabel(r, i) : String(i + 1);
    body.appendChild(h('tr', { 'data-list': f.key, 'data-row': String(i), class: f.selectedRow === i ? 'selrow' : null }, h('td', { class: 'rn' }, label), shown.map((c) => {
      const aria = c.label + ', row ' + (i + 1);
      const focus = f.onRowFocus ? () => f.onRowFocus(i) : null;
      if (c.readonly) {
        let shown = '';
        try { const val = c.compute ? c.compute(r, rows, ctx) : r[c.key]; shown = typeof val === 'number' ? (isFinite(val) ? fmt(val) : '–') : (val == null ? '' : String(val)); } catch (e) { shown = '–'; }
        return h('td', { class: 'ro' }, h('span', { class: 'rocell', 'aria-label': aria }, shown));
      }
      const on = cellOn(c, r);
      if (c.type === 'select') {
        return h('td', null, h('select', { 'data-key': f.key + ':' + i + ':' + c.key, 'aria-label': aria, disabled: on ? null : true, onFocus: focus,
          onChange: (e) => setCell(i, c.key, c.options[e.target.selectedIndex].value, true) },
          c.options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(r[c.key]) }, o.label))));
      }
      return h('td', null, h('input', { type: 'number', step: 'any', inputmode: 'decimal', 'data-key': f.key + ':' + i + ':' + c.key, 'aria-label': aria,
        class: cellBad(c, r) ? 'bad' : null, disabled: on ? null : true, placeholder: c.optional && on ? (c.placeholder || '0') : null,
        value: isNumCell(r[c.key]) ? String(r[c.key]) : '', onFocus: focus,
        onInput: (e) => { const t = e.target.value.trim(); setCell(i, c.key, t === '' ? '' : Number(t), !!c.structural); } }));
    }),
      h('td', null, h('button', { type: 'button', class: 'btn listbtn', 'aria-label': 'Remove row ' + (i + 1), disabled: rows.length <= min ? true : null,
        onClick: () => { if (f.beforeRemove && f.beforeRemove(i, rows, onChange) === false) return; onChange(f.key, rows.filter((x, j) => j !== i), true); } }, '×'))));
  });
  wrap.appendChild(h('div', { class: 'tblwrap' + (f.scroll ? ' scrollx' : '') }, h('table', { class: 'tbl listtbl' }, h('thead', null, head), body)));
  const blank = {};
  f.columns.filter(editable).forEach((c) => { blank[c.key] = rows.length ? rows[rows.length - 1][c.key] : (c.type === 'select' ? c.options[0].value : (c.optional ? '' : 0)); });
  const newRow = () => (f.newRow ? f.newRow(rows) : blank);
  const btns = h('div', { class: 'row', style: 'gap:8px;margin-top:6px' },
    h('button', { type: 'button', class: 'btn', disabled: f.maxRows && rows.length >= f.maxRows ? true : null, onClick: () => onChange(f.key, rows.concat([newRow()]), true) }, 'Add row'));
  if (f.paste) {
    const pf = Object.assign({}, f, { columns: shown });
    const area = h('textarea', { class: 'pastebox', rows: '4', 'aria-label': 'Rows to paste for ' + f.label, placeholder: shown.filter(editable).map((c) => c.label).join('\t') });
    const repl = h('input', { type: 'checkbox' });
    const box = h('div', { class: 'pastewrap hide' }, h('span', { class: 'hint' }, 'Paste rows copied from a spreadsheet, one per line, columns in this order: ' + shown.filter(editable).map((c) => c.label).join(', ') + '.'),
      area, h('div', { class: 'row', style: 'gap:8px' },
        h('label', { class: 'opt' }, repl, ' Replace the rows in the table'),
        h('button', { type: 'button', class: 'btn', onClick: () => { const got = parseRows(pf, area.value);
          if (!got.length) return;
          let acc = repl.checked ? [] : rows;
          got.forEach((x) => { acc = acc.concat([Object.assign({}, f.newRow ? f.newRow(acc) : blank, x)]); });
          onChange(f.key, acc, true); } }, 'Add these rows')));
    btns.appendChild(h('button', { type: 'button', class: 'btn', 'aria-expanded': 'false', onClick: (e) => { box.classList.toggle('hide'); e.target.setAttribute('aria-expanded', String(!box.classList.contains('hide'))); if (!box.classList.contains('hide')) area.focus(); } }, 'Paste rows'));
    wrap.appendChild(btns);
    wrap.appendChild(box);
  } else wrap.appendChild(btns);
  btns.appendChild(h('span', { class: 'why', 'data-why': f.key }, st.why));
  if (f.hint) wrap.appendChild(h('span', { class: 'hint' }, f.hint));
  return wrap;
}

export function renderField(f, value, ctx, onChange) {
  const sys = ctx.sys, id = 'f-' + f.key;
  if (f.type === 'list') return renderList(f, value, ctx, onChange);
  if (f.type === 'check') {
    return h('label', { class: 'field wide checkf', 'data-key': f.key },
      h('input', { type: 'checkbox', id, 'data-key': f.key, checked: !!value, onChange: (e) => onChange(f.key, e.target.checked, true) }),
      h('span', null, f.label));
  }
  if (f.type === 'action') {
    return h('div', { class: 'field wide' }, h('button', { type: 'button', class: 'btn', 'data-key': f.key, onClick: () => ctx.runAction(f) }, f.label),
      f.hint ? h('span', { class: 'hint' }, f.hint) : null);
  }
  if (f.type === 'select' || f.type === 'bar') {
    const options = f.type === 'bar'
      ? (f.sizes || ctx.edition.concrete.bars).map((b) => ({ value: b, label: barLabel(b, sys) }))
      : f.options;
    const sel = h('select', { id, 'data-key': f.key, onChange: (e) => {
      const o = options[e.target.selectedIndex];
      onChange(f.key, o.value, f.type !== 'bar' || !!f.structural);
    } }, options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
    return h('label', { class: 'field' + (f.wide ? ' wide' : ''), 'data-key': f.key, for: id }, labelSpan(f),
      h('span', { class: 'inwrap' }, sel), f.hint ? h('span', { class: 'hint' }, f.hint) : null);
  }
  const un = unitLabel(f.quantity, sys);
  const st = fieldState(f, value, sys);
  const input = h('input', { type: 'number', step: 'any', inputmode: 'decimal', id, 'data-key': f.key, value: typeof value === 'number' && isFinite(value) ? String(value) : '',
    'aria-invalid': st.cls === 'bad' ? 'true' : null, readonly: f.readonly ? true : null,
    onInput: (e) => { const t = e.target.value.trim(); onChange(f.key, t === '' ? '' : Number(t), false); } });
  const why = h('span', { class: 'why', 'data-why': f.key }, st.why);
  if (f.choices) {
    // Preset values (stored in SI) plus Custom.
    const opts = f.choices.map((c) => (typeof c === 'object' ? c : { value: c, label: null }));
    const disp = opts.map((o) => convertTyped(o.value, f.quantity, 'SI', sys));
    let idx = disp.findIndex((d) => typeof value === 'number' && close(d, value));
    if (ctx.customKeys && ctx.customKeys[f.key]) idx = -1;
    const sel = h('select', { 'data-key': f.key + ':choice', 'aria-label': f.label + ' preset', onChange: (e) => {
      const i = e.target.selectedIndex;
      if (i < opts.length) { if (ctx.customKeys) delete ctx.customKeys[f.key]; onChange(f.key, disp[i], true); }
      else { if (ctx.customKeys) ctx.customKeys[f.key] = true; onChange(f.key, value, true); }
    } },
      opts.map((o, i) => h('option', { selected: i === idx }, (o.label ? o.label + ' · ' : '') + fmt(disp[i]) + (un ? ' ' + un : ''))),
      h('option', { selected: idx < 0 }, 'Custom'));
    return h('div', { class: 'field ' + st.cls, 'data-key': f.key },
      h('label', { for: idx < 0 ? id : null }, labelSpan(f)),
      h('span', { class: 'inwrap' }, sel),
      idx < 0 ? h('span', { class: 'inwrap' }, input, un ? h('span', { class: 'u' }, un) : null) : null, why);
  }
  return h('label', { class: 'field ' + st.cls + (f.wide ? ' wide' : ''), 'data-key': f.key, for: id }, labelSpan(f),
    h('span', { class: 'inwrap' }, input, un ? h('span', { class: 'u' }, un) : null), why,
    f.hint ? h('span', { class: 'hint' }, f.hint) : null);
}

// Refresh the error and amber states of the fields already on screen.
export function refreshStates(root, fields, vals, sys) {
  fields.forEach((f) => {
    const el = root.querySelector('.field[data-key="' + f.key + '"]');
    if (!el || f.type === 'check' || f.type === 'select' || f.type === 'bar' || f.type === 'action' || f.type === 'shape') return;
    const st = fieldState(f, vals[f.key], sys);
    el.classList.toggle('bad', st.cls === 'bad');
    el.classList.toggle('amber', st.cls === 'amber');
    const why = el.querySelector('[data-why]');
    if (why) why.textContent = st.why;
  });
}
