// Home (calculator hub) and the page shown for planned modules.
import { h } from './dom.js';
import { GROUPS, MODULES, getGroup, getModule, isBuilt, tagOf } from '../core/registry.js';
import { iconMarkup } from './icons.js';
import * as store from '../core/storage.js';

export function renderHome(outlet, app) {
  const filter = app.state.homeFilter || 'all';
  outlet.appendChild(h('div', null,
    h('h2', { class: 'h2' }, 'Reinforced concrete, steel, and foundation design'),
    h('p', { class: 'muted', style: 'margin:6px 0 0;max-width:760px' }, 'Pick a calculator. Each one walks through the inputs in steps beside a live drawing, and ends with a design checks summary and a numbered solution with the code clause on every step.')));

  const recent = (store.get('recent', []) || []).map(getModule).filter(Boolean);
  if (recent.length) {
    outlet.appendChild(h('div', { class: 'recent', 'aria-label': 'Recent calculators' }, h('span', { class: 'h3', style: 'margin:0' }, 'Recent'),
      recent.map((m) => h('a', { class: 'btn', href: '#' + m.id }, m.title))));
  }
  outlet.appendChild(h('div', { class: 'row', role: 'group', 'aria-label': 'Filter calculators' },
    [{ id: 'all', label: 'All' }].concat(GROUPS).map((g) => h('button', { type: 'button', class: 'pillbtn' + (filter === g.id ? ' on' : ''), 'aria-pressed': String(filter === g.id), onClick: () => app.set('homeFilter', g.id) }, g.label))));

  const grid = h('div', { class: 'grid4' });
  MODULES.filter((m) => filter === 'all' || m.group === filter).forEach((m) => {
    const g = getGroup(m.group), tag = tagOf(m), built = isBuilt(m.id);
    const wrap = h('div', { class: 'mcardwrap' });
    wrap.appendChild(h('a', { class: 'mcard' + (built ? '' : ' later'), href: '#' + m.id },
      h('span', { class: 'mc-top' }, h('span', { class: 'mc-ic' }, g.abbr), tag ? h('span', { class: 'tag' }, tag) : null),
      h('span', { class: 'mc-t' }, m.title),
      h('span', { class: 'mc-d' }, m.desc),
      h('span', { class: 'mc-f' }, m.modes.length ? m.modes.join(' · ') : 'To be scoped')));
    const pop = h('div', { class: 'pop hide', role: 'note', html: iconMarkup(m.thumb) });
    pop.appendChild(h('span', null, m.about));
    const btn = h('button', { type: 'button', class: 'mc-q', 'aria-label': 'About ' + m.title, 'aria-expanded': 'false', onClick: () => {
      const open = pop.classList.toggle('hide');
      btn.setAttribute('aria-expanded', String(!open));
    } }, '?');
    wrap.appendChild(btn); wrap.appendChild(pop);
    grid.appendChild(wrap);
  });
  outlet.appendChild(grid);
}

export function renderPlanned(outlet, mod) {
  const g = getGroup(mod.group), tag = tagOf(mod);
  outlet.appendChild(h('div', null, h('p', { class: 'muted small', style: 'margin:0' }, g.label),
    h('div', { class: 'row' }, h('h2', { class: 'h2' }, mod.title), h('span', { class: 'tag' }, tag || 'Planned'))));
  outlet.appendChild(h('section', { class: 'card' }, h('h3', { class: 'h3' }, 'Calculators planned inside this module'),
    mod.modes.length ? mod.modes.map((name) => h('div', { class: 'kv' }, h('span', null, name), h('span', { class: 'muted' }, 'mode tab')))
      : h('div', { class: 'kv' }, h('span', null, 'To be scoped'), h('span', { class: 'muted' }, 'later release'))));
  outlet.appendChild(h('section', { class: 'card' },
    h('p', { style: 'margin:0 0 12px' }, mod.about + ' This module is planned and is listed for navigation only. It will use the same workspace as the working calculators: a step bar, the form for each step on the left, the live drawing on the right, and a design checks summary with the numbered solution at the end.'),
    h('a', { class: 'btn pri', href: '#rc/beam-flexure' }, 'Open Beam flexure')));
}
