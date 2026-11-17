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
// A list value is an array of row objects in display units. Every cell must be a number.
export function listState(f, rows) {
  if (!Array.isArray(rows) || rows.length < (f.minRows || 1)) return { cls: 'bad', why: 'Add at least ' + (f.minRows || 1) + ' row' + ((f.minRows || 1) > 1 ? 's' : '') + '.' };
  const bad = rows.some((r) => f.columns.some((c) => !(typeof r[c.key] === 'number' && isFinite(r[c.key]))));
  return bad ? { cls: 'bad', why: 'Every cell needs a number.' } : { cls: '', why: '' };
}

function renderList(f, value, ctx, onChange) {
  const rows = Array.isArray(value) ? value : [];
  const st = listState(f, rows);
  const wrap = h('div', { class: 'field wide ' + st.cls, 'data-key': f.key });
  wrap.appendChild(h('span', null, f.symbol ? h('span', { class: 'sym' }, f.symbol) : null, f.symbol ? ' ' : null, f.label));
  const head = h('tr', null, h('th', { scope: 'col' }, '#'), f.columns.map((c) => {
    const un = unitLabel(c.quantity, ctx.sys);
    return h('th', { scope: 'col' }, c.label + (un ? ' (' + un + ')' : ''));
  }), h('th', null, h('span', { class: 'sr' }, 'Remove')));
  const body = h('tbody');
  rows.forEach((r, i) => {
    body.appendChild(h('tr', null, h('td', null, String(i + 1)), f.columns.map((c) => h('td', null,
      h('input', { type: 'number', step: 'any', inputmode: 'decimal', 'data-key': f.key + ':' + i + ':' + c.key, 'aria-label': c.label + ', row ' + (i + 1),
        value: typeof r[c.key] === 'number' && isFinite(r[c.key]) ? String(r[c.key]) : '',
        onInput: (e) => {
          const t = e.target.value.trim(), next = rows.map((x) => Object.assign({}, x));
          next[i][c.key] = t === '' ? '' : Number(t);
          onChange(f.key, next, false);
        } }))),
      h('td', null, h('button', { type: 'button', class: 'btn listbtn', 'aria-label': 'Remove row ' + (i + 1), disabled: rows.length <= (f.minRows || 1) ? true : null,
        onClick: () => onChange(f.key, rows.filter((x, j) => j !== i), true) }, '×'))));
  });
  wrap.appendChild(h('div', { class: 'tblwrap' }, h('table', { class: 'tbl listtbl' }, h('thead', null, head), body)));
  const blank = {};
  f.columns.forEach((c) => { blank[c.key] = rows.length ? rows[rows.length - 1][c.key] : 0; });
  wrap.appendChild(h('div', { class: 'row', style: 'gap:8px;margin-top:6px' },
    h('button', { type: 'button', class: 'btn', disabled: f.maxRows && rows.length >= f.maxRows ? true : null, onClick: () => onChange(f.key, rows.concat([blank]), true) }, 'Add row'),
    h('span', { class: 'why', 'data-why': f.key }, st.why)));
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
