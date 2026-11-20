// Boot, hash router, global state and theme.
import { h, clear } from './ui/dom.js';
import { GROUPS, MODULES, getGroup, getModule, isBuilt, loadModule, tagOf } from './core/registry.js';
import { editions, getEdition, setPreview, selectable } from './codes/index.js';
import * as store from './core/storage.js';
import { renderHome, renderPlanned } from './ui/home.js';
import { createWorkspace } from './ui/workspace.js';

const DEFAULTS = { edition: 'nscp2015', rcMethod: 'USD', steelMethod: 'LRFD', units: 'SI', theme: 'light', clauseDisplay: 'both', sidebarRail: false };
const ALLOWED = { rcMethod: ['USD', 'WSD'], steelMethod: ['LRFD', 'ASD'], units: ['SI', 'US'], theme: ['light', 'dark', 'system'], clauseDisplay: ['both', 'nscp', 'source'] };
const state = { homeFilter: 'all', navOpen: false };
// ?edition-preview=1 makes draft editions selectable for this visit (read once, never stored).
setPreview(new URLSearchParams(location.search).get('edition-preview') === '1');
Object.keys(DEFAULTS).forEach((k) => {
  const val = store.get(k, DEFAULTS[k]);
  state[k] = ALLOWED[k] ? (ALLOWED[k].includes(val) ? val : DEFAULTS[k]) : (typeof val === typeof DEFAULTS[k] ? val : DEFAULTS[k]);
});

let view = null, route = { id: '', mode: '', query: {} }, token = 0;
const $ = (id) => document.getElementById(id);
const dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme() {
  const t = state.theme === 'system' ? (dark && dark.matches ? 'dark' : 'light') : state.theme;
  document.documentElement.setAttribute('data-theme', t);
}
if (dark && dark.addEventListener) dark.addEventListener('change', applyTheme);

const app = {
  state,
  edition: () => getEdition(state.edition),
  set(key, value, quiet) {
    if (state[key] === value) return;
    const prev = state[key];
    state[key] = value;
    if (key in DEFAULTS && !(key === 'edition' && getEdition(value).status === 'draft')) store.set(key, value);   // a draft edition is not remembered
    if (key === 'theme') applyTheme();
    renderTop(); renderSide();
    if (quiet) return;
    if (key === 'homeFilter') { if (!route.id) renderMain(); return; }
    if (key === 'theme' || key === 'sidebarRail' || key === 'navOpen') return;
    if (view && view.onState) view.onState(key, prev); else renderMain();
  },
  send(sd, fromTitle) {
    store.set('send.' + sd.to, { from: fromTitle, values: sd.values, mode: sd.mode || null });
    location.hash = '#' + sd.to + (sd.mode ? '/' + sd.mode : '');
  }
};

function seg(label, options, current, onPick) {
  return h('div', { class: 'ctrl' }, label, h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map((o) => h('button', { type: 'button', class: o[0] === current ? 'on' : '', 'aria-pressed': String(o[0] === current), onClick: () => onPick(o[0]) }, o[1]))));
}

function renderTop() {
  const box = clear($('ctrls'));
  const mod = getModule(route.id), g = mod ? getGroup(mod.group) : null;
  box.appendChild(h('label', { class: 'ctrl' }, 'Code edition',
    h('select', { class: 'sel', 'aria-label': 'Code edition', onChange: (e) => app.set('edition', e.target.value) },
      editions.map((ed) => h('option', { value: ed.id, disabled: selectable(ed) ? null : true, selected: ed.id === getEdition(state.edition).id }, ed.label)))));
  if (g && g.methods.length) box.appendChild(seg('Design method', g.methods.map((x) => [x, x]), state[g.stateKey], (val) => app.set(g.stateKey, val)));
  box.appendChild(seg('Units', [['SI', 'SI'], ['US', 'English']], state.units, (val) => app.set('units', val)));
  box.appendChild(seg('Theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], state.theme, (val) => app.set('theme', val)));
}

function renderSide() {
  const side = $('side');
  side.className = 'side' + (state.navOpen ? ' navopen' : '') + (state.sidebarRail ? ' rail' : '');
  clear(side);
  side.appendChild(h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:nowrap;gap:6px' },
    h('a', { class: 'navitem homeb' + (!route.id ? ' on' : ''), href: '#', style: 'width:auto;flex:1', 'aria-current': !route.id ? 'page' : null }, 'All calculators'),
    h('button', { type: 'button', class: 'btn navbtn', 'aria-expanded': String(state.navOpen), onClick: () => app.set('navOpen', !state.navOpen) }, state.navOpen ? 'Hide modules' : 'Modules'),
    h('button', { type: 'button', class: 'btn railbtn', 'aria-label': state.sidebarRail ? 'Expand sidebar' : 'Collapse sidebar', onClick: () => app.set('sidebarRail', !state.sidebarRail) }, state.sidebarRail ? '»' : '«')));
  side.appendChild(h('div', { class: 'railonly' },
    h('a', { class: 'railic', href: '#', 'aria-label': 'All calculators', onClick: () => app.set('homeFilter', 'all', true) }, 'All'),
    GROUPS.map((g) => h('a', { class: 'railic', href: '#', 'aria-label': g.label, onClick: () => { state.homeFilter = g.id; if (!route.id) renderMain(); } }, g.abbr))));
  const list = h('div', { class: 'navlist' });
  GROUPS.forEach((g) => {
    list.appendChild(h('div', { class: 'navhead' }, g.label));
    MODULES.filter((m) => m.group === g.id).forEach((m) => {
      const tag = tagOf(m), on = route.id === m.id;
      list.appendChild(h('a', { class: 'navitem' + (on ? ' on' : '') + (isBuilt(m.id) ? '' : ' later'), href: '#' + m.id, 'aria-current': on ? 'page' : null },
        h('span', null, m.title), tag ? h('span', { class: 'tag' }, tag) : null));
    });
  });
  side.appendChild(list);
}

function parseHash() {
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  const [path, qs] = raw.split('?');
  const seg3 = path.split('/').filter(Boolean);
  const query = {};
  (qs || '').split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) query[kv.slice(0, i)] = kv.slice(i + 1); });
  const id = seg3.length >= 2 ? seg3[0] + '/' + seg3[1] : '';
  return { id: getModule(id) ? id : '', mode: seg3[2] || '', query, unknown: raw !== '' && !getModule(id) };
}

async function renderMain() {
  const my = ++token;
  const outlet = $('main');
  if (view && view.destroy) view.destroy();
  view = null;
  const mod = getModule(route.id);
  if (!mod) { clear(outlet); renderHome(outlet, app); return; }
  if (!isBuilt(mod.id)) { clear(outlet); renderPlanned(outlet, mod); return; }
  let def;
  try { def = await loadModule(mod.id); }
  catch (e) { if (my === token) { clear(outlet); outlet.appendChild(h('div', { class: 'err', role: 'alert' }, 'This calculator could not be loaded. Reload the page and try again.')); } return; }
  if (my !== token) return;
  clear(outlet);
  store.pushRecent(mod.id);
  view = createWorkspace(outlet, def, mod, getGroup(mod.group), route, app);
  window.__sadc = { app, view: () => view, def };
}

function onRoute() {
  const next = parseHash();
  if (next.unknown) { history.replaceState(null, '', location.pathname + location.search + '#'); }
  const q = next.query;
  if (q.e && editions.some((ed) => ed.id === q.e && selectable(ed))) { state.edition = q.e; }
  if (q.u === 'SI' || q.u === 'US') { state.units = q.u; store.set('units', q.u); }
  const mod = getModule(next.id);
  if (mod && q.m) { const g = getGroup(mod.group); if (g.stateKey && g.methods.includes(q.m)) { state[g.stateKey] = q.m; store.set(g.stateKey, q.m); } }
  route = next;
  state.navOpen = false;
  renderTop(); renderSide(); renderMain();
  if (!q.i) window.scrollTo(0, 0);
}

applyTheme();
window.addEventListener('hashchange', onRoute);
onRoute();
