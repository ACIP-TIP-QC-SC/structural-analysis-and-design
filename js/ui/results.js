// Key results grid, messages, result tables and "Send to" links.
import { h } from './dom.js';
import { fmtQ, renderTokens } from '../core/format.js';

export function keyResults(result, ctx) {
  if (!result.ok || !result.results.length) return null;
  return h('section', { class: 'card o-res', 'aria-label': 'Key results' }, h('h3', { class: 'h3' }, 'Key results'),
    h('div', { class: 'resgrid' }, result.results.map((r) => h('div', null, h('div', { class: 'lb' }, r.label), h('div', { class: 'vl' }, fmtQ(r.value, r.q, ctx.sys))))));
}

export function messages(result) {
  const items = [];
  if (result.ok) result.warnings.forEach((w) => items.push(h('div', { class: 'msg warn' }, h('b', null, 'Warning: '), w)));
  result.notes.forEach((n) => items.push(h('div', { class: 'msg' }, h('b', null, 'Note: '), n)));
  return items.length ? h('div', { class: 'card msgs o-res' }, items) : null;
}

export const cellText = (cell, sys) => (Array.isArray(cell) || (cell && typeof cell === 'object') ? renderTokens(Array.isArray(cell) ? cell : [cell], sys) : String(cell == null ? '' : cell));

// Tables carried in result.diagram.tables: { title, head: [], rows: [{ cells: [], hl }], note }.
export function tables(result, ctx) {
  const list = (result.diagram && result.diagram.tables) || [];
  if (!list.length) return null;
  return h('div', { class: 'o-extra', style: 'display:flex;flex-direction:column;gap:20px' }, list.map((t) =>
    h('section', { class: 'card', 'aria-label': t.title }, h('h3', { class: 'h3' }, t.title),
      h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, t.head.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, t.rows.map((r) => h('tr', { class: r.hl ? 'hl' : null }, r.cells.map((c) => h('td', null, cellText(c, ctx.sys)))))))),
      t.note ? h('p', { class: 'tblnote' }, t.note) : null)));
}

export function sendLinks(result, onSend) {
  if (!result.ok || !result.send || !result.send.length) return null;
  return h('section', { class: 'card o-extra', 'aria-label': 'Send to another calculator' }, h('h3', { class: 'h3' }, 'Send to next module'),
    h('div', { class: 'sendrow' }, result.send.map((sd) => h('button', { type: 'button', class: 'btn', onClick: () => onSend(sd) }, sd.label + ' →'))));
}
