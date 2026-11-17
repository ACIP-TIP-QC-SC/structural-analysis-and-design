// "Load example or test case" select.
import { h } from './dom.js';

export function presetSelect(presets, mode, currentId, onPick) {
  const list = presets.filter((p) => p.mode === mode);
  return h('select', { class: 'sel', style: 'width:100%', 'aria-label': 'Load example or test case', onChange: (e) => { const p = list.find((x) => x.id === e.target.value); if (p) onPick(p); } },
    h('option', { value: '' }, 'Load example or test case…'),
    list.map((p) => h('option', { value: p.id, selected: p.id === currentId }, p.name + (p.method ? ' [' + p.method + ']' : ''))));
}
