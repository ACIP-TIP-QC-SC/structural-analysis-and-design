// One row of the design checks summary, and the clause chip.
import { h } from './dom.js';
import { fmtDC, fmtQ } from '../core/format.js';
import { clauseText } from '../codes/index.js';
import { pill, STATUS } from './verdict.js';

export function chip(ctx, key) {
  if (!key) return null;
  return h('span', { class: 'chip' }, clauseText(ctx.edition, key, ctx.clauseDisplay));
}

export const sideText = (side, sys) => (side.label ? side.label + ' = ' : '') + fmtQ(side.value, side.q, sys);

export function checkRow(c, ctx, governing) {
  const cls = STATUS[c.status].cls;
  const pct = Math.min(Math.max(c.dc, 0) / 1.25, 1) * 100;
  return h('div', { class: 'check' },
    h('div', { class: 'nm' }, h('div', { style: 'font-weight:500' }, c.name, governing ? h('span', { class: 'gov' }, '◆ governing') : null), chip(ctx, c.clause)),
    h('div', { class: 'dv mono' }, h('div', null, sideText(c.demand, ctx.sys)), h('div', { class: 'muted' }, sideText(c.capacity, ctx.sys))),
    h('div', { class: 'bar' },
      h('div', { class: 'track' }, h('div', { class: 'fill ' + cls, style: 'width:' + (isFinite(pct) ? pct : 100) + '%' }), h('div', { class: 'tick' })),
      h('div', { class: 'mono', style: 'font-size:12px;margin-top:5px' }, 'D/C = ' + fmtDC(c.dc))),
    pill(c.status),
    c.note ? h('div', { class: 'cnote' }, c.note) : null);
}

export function checksSummary(result, ctx) {
  const box = h('div', { class: 'o-checks' });
  if (!result.ok) { box.appendChild(h('p', { class: 'muted', style: 'margin:0' }, 'No checks yet. Fix the inputs first.')); return box; }
  if (!result.checks.length) { box.appendChild(h('p', { class: 'muted', style: 'margin:0' }, 'This calculation has no pass or fail check. The key results and the worked solution are shown beside and below.')); return box; }
  result.checks.forEach((c) => box.appendChild(checkRow(c, ctx, result.checks.length > 1 && result.verdict && c.name === result.verdict.governing)));
  return box;
}
