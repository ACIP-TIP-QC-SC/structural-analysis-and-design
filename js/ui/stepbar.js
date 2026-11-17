// Dark bar of numbered steps, clickable in any order.
import { h } from './dom.js';

export function stepBar(steps, current, onPick) {
  return h('nav', { class: 'steps', 'aria-label': 'Steps' },
    steps.map((label, i) => h('button', { type: 'button', class: 'stepb' + (i === current ? ' on' : ''), 'aria-current': i === current ? 'step' : null, onClick: () => onPick(i) },
      h('span', { class: 'sn' }, String(i + 1)), h('span', null, label))));
}
