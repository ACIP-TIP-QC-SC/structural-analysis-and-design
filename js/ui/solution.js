// Worked solution: numbered steps with formula, substitution, result, note and clause chip.
import { h } from './dom.js';
import { renderTokens } from '../core/format.js';
import { chip } from './checkrow.js';

export function solutionCard(result, ctx, onClauseDisplay) {
  const card = h('section', { class: 'card', 'aria-label': 'Worked solution' });
  card.appendChild(h('div', { class: 'row sb' },
    h('h3', { class: 'h3', style: 'margin-bottom:4px' }, 'Worked solution'),
    h('label', { class: 'ctrl', style: 'flex-direction:row;align-items:center;gap:8px' }, 'Clause references',
      h('select', { class: 'sel', onChange: (e) => onClauseDisplay(e.target.value) },
        [['both', 'NSCP and source code'], ['nscp', 'NSCP only'], ['source', 'Source code only']].map((o) => h('option', { value: o[0], selected: ctx.clauseDisplay === o[0] }, o[1]))))));
  if (result.steps.length > 10) {
    card.appendChild(h('details', { class: 'jump' }, h('summary', null, 'Jump to step'),
      h('ol', null, result.steps.map((st, i) => h('li', null, h('a', { href: '#', onClick: (e) => { e.preventDefault(); const t = card.querySelector('#step-' + (i + 1)); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, st.title))))));
  }
  result.steps.forEach((st, i) => {
    card.appendChild(h('div', { class: 'step', id: 'step-' + (i + 1) },
      h('div', { class: 'n' }, String(i + 1)),
      h('div', { class: 'b' },
        h('div', { class: 't' }, st.title),
        st.formula ? h('div', { class: 'f' }, renderTokens(st.formula, ctx.sys)) : null,
        st.substitution ? h('div', { class: 's' }, renderTokens(st.substitution, ctx.sys)) : null,
        st.result ? h('div', { class: 'r' }, renderTokens(st.result, ctx.sys)) : null,
        st.note ? h('div', { class: 'note' }, st.note) : null,
        chip(ctx, st.clause))));
  });
  return card;
}
