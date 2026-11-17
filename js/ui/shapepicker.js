// Steel shape picker: searchable select grouped by type, plus "Custom section".
import { h, clear } from './dom.js';
import { shapeValue } from '../core/shapes.js';

let cache = null, pending = null;
export function loadShapes() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('data/steel-shapes.json').then((r) => (r.ok ? r.json() : [])).then((rows) => { cache = Array.isArray(rows) ? rows : []; return cache; }).catch(() => { cache = []; return cache; });
  }
  return pending;
}
export const shapesNow = () => cache;
export const findShape = (name) => (cache || []).find((x) => x.designation === name) || null;

const TYPE_NAMES = { W: 'W shapes', S: 'S shapes', C: 'C shapes (channels)', L: 'L shapes (angles)' };

// Values a module needs from a shape, in mm-based SI. Returns { values, missing }.
export function shapeProps(shape, props) {
  const values = {}, missing = [], absent = [];
  props.forEach((p) => {
    const val = typeof p.from === 'function' ? p.from(shape, shapeValue) : shapeValue(shape, p.col);
    if (val == null || (typeof val === 'number' && !isFinite(val))) (p.optional ? absent : missing).push(p.key); else values[p.key] = val;
  });
  return { values, missing, absent };
}

export function shapePicker(f, value, onPick) {
  const wrap = h('div', { class: 'field wide', 'data-key': f.key });
  const id = 'f-' + f.key;
  const search = h('input', { type: 'search', placeholder: 'Search, for example W250', 'aria-label': 'Search shapes', 'data-key': f.key + ':search' });
  const sel = h('select', { id, 'data-key': f.key, onChange: () => onPick(sel.value) });
  function fill(filter) {
    clear(sel);
    const rows = cache || [];
    const q = (filter || '').trim().toLowerCase();
    sel.appendChild(h('option', { value: 'custom', selected: value === 'custom' }, 'Custom section'));
    f.types.forEach((t) => {
      const list = rows.filter((x) => x.type === t && (!q || x.designation.toLowerCase().includes(q) || String(x.us_name || '').toLowerCase().includes(q) || x.designation === value));
      if (!list.length) return;
      sel.appendChild(h('optgroup', { label: TYPE_NAMES[t] || t }, list.map((x) => h('option', { value: x.designation, selected: x.designation === value }, x.designation + (x.us_name ? '  (' + x.us_name + ')' : '')))));
    });
    if (value !== 'custom' && !rows.some((x) => x.designation === value)) sel.appendChild(h('option', { value, selected: true }, value + (cache ? ' (not in the shape list)' : ' (loading shapes…)')));
  }
  search.addEventListener('input', () => fill(search.value));
  fill('');
  if (!cache) loadShapes().then(() => fill(search.value));
  wrap.appendChild(h('label', { for: id }, f.label));
  wrap.appendChild(h('span', { class: 'inwrap' }, search));
  wrap.appendChild(h('span', { class: 'inwrap' }, sel));
  return wrap;
}
