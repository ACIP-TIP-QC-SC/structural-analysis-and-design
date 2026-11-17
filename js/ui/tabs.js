// Mode tabs and the Analyze / Design switch.
import { h } from './dom.js';

export function modeTabs(def, modeId, tasks, task, onTask) {
  if (def.modes.length < 2 && tasks.length < 2) return null;
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Modes' });
  if (def.modes.length > 1) def.modes.forEach((m) => nav.appendChild(h('a', { class: 'tab' + (m.id === modeId ? ' on' : ''), href: '#' + def.id + '/' + m.id, 'aria-current': m.id === modeId ? 'page' : null }, m.label)));
  if (tasks.length > 1) {
    nav.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Analyze or design' },
      tasks.map((t) => h('button', { type: 'button', class: t.id === task ? 'on' : '', 'aria-pressed': String(t.id === task), onClick: () => onTask(t.id) }, t.label))));
  }
  return nav;
}
