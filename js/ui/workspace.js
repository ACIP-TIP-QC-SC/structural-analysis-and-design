// Calculator workspace shared by every module: header, mode tabs, step bar, form card,
// live drawing, verdict, key results and worked solution. There is no Solve button:
// every input change recalculates at once.
import { h, clear } from './dom.js';
import { renderField, refreshStates, fieldState, barLabel } from './field.js';
import { modeTabs } from './tabs.js';
import { stepBar } from './stepbar.js';
import { verdictBanner, stickyStrip } from './verdict.js';
import { checksSummary } from './checkrow.js';
import { solutionCard } from './solution.js';
import { keyResults, messages, tables, sendLinks } from './results.js';
import { presetSelect } from './presets.js';
import { shapePicker, shapeProps, loadShapes, findShape, shapesNow } from './shapepicker.js';
import { iconMarkup } from './icons.js';
import { toSI, fromSI, convertTyped, unitLabel, SYSTEMS } from '../core/units.js';
import { fmt, fmtQ, renderTokens } from '../core/format.js';
import { fail } from '../core/steps.js';
import * as store from '../core/storage.js';
import { solutionText, buildReport, printReport, copyText } from '../core/report.js';
import { buildModel, hasViz } from './viz/models.js';

const METHOD_NAMES = {
  USD: 'USD (ultimate strength)', WSD: 'WSD (working stress, reference mode)',
  LRFD: 'LRFD (load and resistance factor)', ASD: 'ASD (allowable strength)'
};
const NOT_SUPPORTED = 'This shape type is not supported in this calculator yet';
const isNum = (f) => !f.type || f.type === 'number';
const isList = (f) => f && f.type === 'list';
// Convert every numeric cell of a list value between unit systems (or to SI with toSI).
function convertRows(rows, f, fn) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    const o = Object.assign({}, r);
    f.columns.forEach((c) => { if (typeof o[c.key] === 'number' && isFinite(o[c.key])) o[c.key] = fn(o[c.key], c.quantity); });
    return o;
  });
}

export function createWorkspace(outlet, def, mod, group, route, app) {
  const st = {
    mode: def.modes.some((m) => m.id === route.mode) ? route.mode : def.modes[0].id,
    step: 1, vals: {}, presetId: '', banner: '', transient: false, customKeys: {},
    show: { dim: true, info: true }, toolsOpen: false, result: null, shapeError: '',
    view: '2d', playing: false, rebar: true
  };
  (def.drawOptions || []).forEach((o) => { st.show[o.key] = o.default !== false; });
  let timer = null, parts = {};
  let viz = null, vizHost = null, vizLoading = null, vizModel = null;

  const edition = () => app.edition();
  const sys = () => app.state.units;
  function method() {
    if (!def.methods || !def.methods.length) return null;
    const global = group.stateKey ? app.state[group.stateKey] : null;
    return def.methods.includes(global) ? global : def.methods[0];
  }
  const uiCtx = () => ({ sys: sys(), edition: edition(), clauseDisplay: app.state.clauseDisplay, customKeys: st.customKeys, runAction });
  const stepNames = () => (typeof def.steps === 'function' ? def.steps(st.mode, method()) : def.steps);
  const tasks = () => (def.tasks ? def.tasks(st.mode, method()) : []);
  function task() { const t = tasks(); return t.length ? (t.some((x) => x.id === st.vals.task) ? st.vals.task : t[0].id) : null; }

  // Field list for the current mode. Shape fields expand into their property fields.
  function fieldList(vals) {
    const src = Object.assign({}, vals || st.vals, { task: tasksFor(vals || st.vals) });
    const out = [];
    def.fields(st.mode, method(), src, edition()).forEach((f) => {
      out.push(f);
      if (f.type === 'shape') f.props.forEach((p) => out.push(Object.assign({ step: f.step, hidden: src[f.key] !== 'custom', shapeProp: f.key }, p)));
    });
    return out;
  }
  function tasksFor(vals) { const t = tasks(); return t.length ? (t.some((x) => x.id === vals.task) ? vals.task : t[0].id) : null; }

  // Defaults in SI, then in the display system.
  function defaultsSI() {
    const d = {};
    for (let pass = 0; pass < 3; pass++) fieldList(d).forEach((f) => { if (!(f.key in d) && f.default !== undefined) d[f.key] = f.default; });
    return d;
  }
  function toDisplay(siVals, base) {
    const out = Object.assign({}, base || {});
    const fl = fieldListFor(Object.assign({}, out, siVals));
    Object.keys(siVals).forEach((k) => {
      const f = fl.find((x) => x.key === k);
      const val = siVals[k];
      out[k] = f && isNum(f) && typeof val === 'number' ? convertTyped(val, f.quantity, 'SI', sys())
        : isList(f) ? convertRows(val, f, (x, q) => convertTyped(x, q, 'SI', sys())) : val;
    });
    return out;
  }
  function fieldListFor(vals) {
    const seen = {}, out = [];
    for (let pass = 0; pass < 2; pass++) fieldList(vals).forEach((f) => { if (!seen[f.key]) { seen[f.key] = 1; out.push(f); } });
    return out;
  }
  function convertVals(vals, from, to) {
    const out = Object.assign({}, vals);
    fieldListFor(vals).forEach((f) => {
      if (isNum(f) && typeof out[f.key] === 'number') out[f.key] = convertTyped(out[f.key], f.quantity, from, to);
      else if (isList(f)) out[f.key] = convertRows(out[f.key], f, (x, q) => convertTyped(x, q, from, to));
    });
    return out;
  }
  function siInput() {
    const out = {}, missing = [];
    fieldList().forEach((f) => {
      if (f.type === 'action') return;
      const val = st.vals[f.key];
      if (isNum(f)) {
        if (typeof val === 'number' && isFinite(val)) out[f.key] = toSI(val, f.quantity, sys());
        else if (f.optional) out[f.key] = null;
        else { out[f.key] = NaN; missing.push(f.label); }
      } else if (isList(f)) {
        if (fieldState(f, val, sys()).cls === 'bad') missing.push(f.label);
        out[f.key] = convertRows(Array.isArray(val) ? val : [], f, (x, q) => toSI(x, q, sys()));
      } else out[f.key] = val;
    });
    const t = task();
    if (t) out.task = t;
    out.mode = st.mode;
    return { input: out, missing };
  }
  function solveNow() {
    const { input, missing } = siInput();
    if (st.shapeError) return fail([st.shapeError + '.']);
    if (missing.length) return fail(['Every input needs a number. Check: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' and others' : '') + '.']);
    try { return def.solve(input, { edition: edition(), method: method() }); }
    catch (e) { return fail(['This combination of inputs could not be calculated (' + e.message + ').']); }
  }

  // ---- saving
  const saveKey = () => 'in.' + def.id + '.' + st.mode;
  function save() { if (!st.transient) store.set(saveKey(), { u: sys(), v: st.vals }); }
  function loadMode() {
    st.presetId = ''; st.customKeys = {}; st.shapeError = '';
    const base = toDisplay(defaultsSI());
    const saved = store.get(saveKey());
    st.vals = saved && saved.v ? Object.assign(base, saved.u === sys() ? saved.v : convertVals(saved.v, saved.u || 'SI', sys())) : base;
  }
  function applySI(values) { st.vals = toDisplay(values, st.vals); }

  // ---- events
  function onChange(key, value, structural) {
    st.vals[key] = value; st.presetId = ''; st.transient = false;
    save();
    if (structural) { renderAll(); return; }
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  }
  function pickShape(f, name) {
    st.vals[f.key] = name; st.shapeError = ''; st.presetId = ''; st.transient = false;
    if (name !== 'custom') {
      const shape = findShape(name);
      if (shape) {
        const { values, missing, absent } = shapeProps(shape, f.props);
        if (missing.length) st.shapeError = NOT_SUPPORTED;
        applySI(values);
        absent.concat(missing).forEach((k) => { st.vals[k] = ''; });
      }
    }
    save(); renderAll();
  }
  function runAction(f) {
    const patch = f.run(siInput().input, { edition: edition(), method: method() });
    if (patch) { applySI(patch); st.transient = false; save(); renderAll(); }
  }
  function loadPreset(p) {
    if (p.method && group.stateKey && app.state[group.stateKey] !== p.method) app.set(group.stateKey, p.method, true);
    st.customKeys = {}; st.shapeError = '';
    st.vals = toDisplay(Object.assign(defaultsSI(), p.inputs));
    st.presetId = p.id; st.transient = false;
    save(); renderAll();
  }
  function reset() {
    store.remove(saveKey());
    st.banner = ''; st.transient = false;
    loadMode(); renderAll();
  }
  function reportData() {
    const inputs = [];
    const t = tasks().find((x) => x.id === task());
    fieldList().forEach((f) => {
      if (f.hidden || f.type === 'action') return;
      const val = st.vals[f.key];
      let text;
      if (f.type === 'check') text = val ? 'Yes' : 'No';
      else if (f.type === 'bar') text = barLabel(val, sys());
      else if (f.type === 'select') { const o = f.options.find((x) => String(x.value) === String(val)); text = o ? o.label : String(val); }
      else if (f.type === 'shape') text = val === 'custom' ? 'Custom section' : String(val);
      else if (isList(f)) text = (Array.isArray(val) ? val : []).map((r, i) => (i + 1) + ': ' + f.columns.map((c) => c.label + ' ' + (typeof r[c.key] === 'number' ? fmt(r[c.key]) + (unitLabel(c.quantity, sys()) ? ' ' + unitLabel(c.quantity, sys()) : '') : '–')).join(', ')).join('; ');
      else text = typeof val === 'number' && isFinite(val) ? fmt(val) + (unitLabel(f.quantity, sys()) ? ' ' + unitLabel(f.quantity, sys()) : '') : (f.optional ? 'not given' : '–');
      inputs.push({ label: f.label + (f.symbol ? ', ' + f.symbol : ''), value: text });
    });
    return {
      group: group.label, module: def.title, modeLabel: def.modes.find((m) => m.id === st.mode).label, taskLabel: t ? t.label : '',
      edition: edition(), method: method(), sys: sys(), clauseDisplay: app.state.clauseDisplay, inputs, result: st.result
    };
  }
  function shareLink() {
    const q = 'e=' + edition().id + (method() ? '&m=' + method() : '') + '&u=' + sys() + '&i=' + store.encodeInputs(st.vals);
    return location.href.split('#')[0] + '#' + def.id + '/' + st.mode + '?' + q;
  }
  function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1600); }

  function drawSvg() {
    try { return def.draw(st.result, { sys: sys(), show: st.show, edition: edition(), fq: (val, q, unit = true) => fmtQ(val, q, sys(), unit) }); }
    catch (e) { return null; }
  }
  function savePng() {
    if (st.view !== '2d' && viz) {
      const link = document.createElement('a');
      link.download = def.id.replace('/', '-') + '-' + st.mode + '-' + st.view + '.png'; link.href = viz.png(); link.click();
      return;
    }
    const live = parts.draw && parts.draw.querySelector('svg.dg');
    if (!live) return;
    const clone = live.cloneNode(true);
    const a = live.querySelectorAll('*'), b = clone.querySelectorAll('*');
    const props = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'display'];
    a.forEach((node, i) => { const cs = getComputedStyle(node); b[i].setAttribute('style', props.map((p) => p + ':' + cs.getPropertyValue(p)).join(';')); });
    const vb = live.viewBox.baseVal, k = 3;
    clone.setAttribute('width', vb.width * k); clone.setAttribute('height', vb.height * k);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = vb.width * k; cv.height = vb.height * k;
      const g2 = cv.getContext('2d');
      g2.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel') || '#fff';
      g2.fillRect(0, 0, cv.width, cv.height); g2.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.download = def.id.replace('/', '-') + '-' + st.mode + '.png'; link.href = cv.toDataURL('image/png'); link.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  }

  // ---- rendering
  function formCard() {
    const names = stepNames(), name = names[st.step];
    const card = h('section', { class: 'card inputs', 'aria-label': 'Step inputs' });
    const ctx = uiCtx();
    if (st.step === 0) {
      card.appendChild(h('h3', { class: 'h3', style: 'margin-bottom:4px' }, 'Setup'));
      card.appendChild(h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Design code'), h('span', null, edition().label)));
      if (method()) card.appendChild(h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Method'), h('span', null, METHOD_NAMES[method()] || method())));
      card.appendChild(h('div', { class: 'kv' }, h('span', { class: 'muted' }, 'Units'), h('span', null, SYSTEMS[sys()])));
      card.appendChild(h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'Change these in the top bar at any time and the solution recalculates.'));
      if (group.id === 'rc' && def.methods.length === 1 && app.state.rcMethod === 'WSD') card.appendChild(h('p', { class: 'muted small', style: 'margin:8px 0 0' }, 'WSD reference mode is available in Beam flexure.'));
      if (def.modes.length > 1) {
        card.appendChild(h('h3', { class: 'h3', style: 'margin-top:20px' }, def.modeHeading || 'Calculation'));
        card.appendChild(h('div', { class: 'tiles' }, def.modes.map((m) => h('a', { class: 'tile' + (m.id === st.mode ? ' on' : ''), href: '#' + def.id + '/' + m.id, html: iconMarkup(m.icon) + '<span>' + m.label + '</span>' }))));
      }
      card.appendChild(h('h3', { class: 'h3', style: 'margin-top:20px' }, 'Start from'));
      card.appendChild(presetSelect(def.presets || [], st.mode, st.presetId, loadPreset));
      if (def.setupNote) card.appendChild(h('p', { class: 'muted small', style: 'margin:12px 0 0' }, def.setupNote));
    } else if (st.step === names.length - 1) {
      card.appendChild(h('h3', { class: 'h3', style: 'margin-bottom:8px' }, 'Design checks summary'));
      card.appendChild(parts.checks = h('div'));
    } else {
      card.appendChild(h('h3', { class: 'h3' }, name));
      const grid = h('div', { class: 'fields' });
      const mine = fieldList().filter((f) => f.step === name && !f.hidden);
      mine.forEach((f) => {
        if (f.type === 'shape') {
          grid.appendChild(shapePicker(f, st.vals[f.key], (nm) => pickShape(f, nm)));
          if (st.vals[f.key] !== 'custom') {
            const summary = f.props.map((p) => (p.symbol || p.label) + ' = ' + (typeof st.vals[p.key] === 'number' ? fmt(st.vals[p.key]) + (unitLabel(p.quantity, sys()) ? ' ' + unitLabel(p.quantity, sys()) : '') : '–'));
            grid.appendChild(h('div', { class: 'field wide' }, h('div', { class: 'info', style: 'margin:0' }, summary.map((t) => h('span', { class: 'chip' }, t)))));
            if (st.shapeError) grid.appendChild(h('div', { class: 'field wide bad' }, h('span', { class: 'why' }, st.shapeError + '.')));
          } else grid.appendChild(h('div', { class: 'field wide' }, h('span', { class: 'hint' }, 'Custom section: type the properties below.')));
        } else grid.appendChild(renderField(f, st.vals[f.key], ctx, onChange));
      });
      if (!mine.length) grid.appendChild(h('p', { class: 'muted small', style: 'margin:0;grid-column:1/-1' }, 'Nothing to enter in this step for the current choices.'));
      card.appendChild(grid);
      const help = def.stepHelp ? def.stepHelp(name, st.mode, method(), st.vals) : (st.step === 1 ? 'The drawing redraws to scale as you type.' : '');
      if (help) card.appendChild(h('p', { class: 'muted small', style: 'margin:16px 0 0' }, help));
    }
    const last = names.length - 1;
    card.appendChild(h('div', { class: 'row sb', style: 'margin-top:20px' },
      h('button', { type: 'button', class: 'btn', disabled: st.step === 0 ? true : null, onClick: () => goStep(st.step - 1) }, 'Back'),
      h('button', { type: 'button', class: 'btn pri', onClick: () => goStep(st.step === last ? 0 : st.step + 1) },
        st.step === last ? 'Back to setup' : st.step === last - 1 ? 'See results' : 'Next: ' + names[st.step + 1])));
    return card;
  }
  function goStep(i) { st.step = Math.max(0, Math.min(stepNames().length - 1, i)); renderAll(); }

  // ---- 3D, stress and animation views (three.js is loaded only when first needed)
  function vizBar(model) {
    const set = (v) => { st.view = v; if (v === '2d') st.playing = false; refresh(); };
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Drawing view' },
      [['2d', 'Drawing'], ['stress', 'Stress'], ['3d', '3D']].map(([v, label]) => h('button', {
        type: 'button', class: st.view === v ? 'on' : '', 'aria-pressed': String(st.view === v),
        disabled: v === 'stress' && !(model && model.stress) ? true : null,
        title: v === 'stress' ? 'Stress distribution with a color legend' : v === '3d' ? '3D view; drag to orbit, scroll to zoom' : '2D drawing to scale',
        onClick: () => set(v) }, label)));
    const play = h('button', {
      type: 'button', class: 'btn vz-play' + (st.playing ? ' pri' : ''), 'aria-pressed': String(st.playing),
      disabled: !model || model.noAnim ? true : null,
      title: 'Loop a 10 second animation of the deflection and failure',
      onClick: () => { st.playing = !st.playing; if (st.playing && st.view === '2d') st.view = '3d'; refresh(); } }, st.playing ? '❚❚ Pause' : '▶ Play');
    const rebar = model && model.hasRebar && st.view !== '2d'
      ? h('label', { class: 'opt vz-opt' }, h('input', { type: 'checkbox', checked: st.rebar, onChange: (e) => { st.rebar = e.target.checked; refresh(); } }), ' Show reinforcement')
      : null;
    return h('div', { class: 'row vz-bar' }, seg, play, rebar);
  }
  function vizView(model) {
    if (!vizHost) vizHost = h('div', { class: 'vz-host' });
    const opts = () => ({ view: st.view, rebar: st.rebar, playing: st.playing, fq: (val, q, unit = true) => fmtQ(val, q, sys(), unit),
      bg: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#ffffff' });
    vizModel = model;
    if (viz) viz.update(model, opts());
    else if (!vizLoading) {
      vizLoading = import('./viz/viz3d.js').then((mod) => {
        if (!vizHost) return;
        viz = mod.createViewer(vizHost);
        if (viz && vizModel && st.view !== '2d') viz.update(vizModel, opts());
      }).catch(() => { if (vizHost) vizHost.appendChild(h('p', { class: 'muted small' }, 'The 3D view could not be loaded.')); });
    }
    return vizHost;
  }
  function currentModel() {
    if (!hasViz(def.id) || !st.result || !st.result.ok) return null;
    try { return buildModel(def.id, st.mode, siInput().input, st.result); } catch (e) { return null; }
  }

  function drawCard() {
    const card = h('section', { class: 'card diacard o-draw', 'aria-label': 'Live drawing' });
    const model = currentModel();
    if (!model) { st.view = '2d'; st.playing = false; }
    if (st.view === 'stress' && !model.stress) st.view = '3d';
    card.appendChild(h('div', { class: 'row sb vz-head' }, h('h3', { class: 'h3', style: 'margin:0' }, 'Live drawing'), model ? vizBar(model) : null));
    const chips = [edition().short].concat(method() ? [method()] : []);
    ((st.result.diagram && st.result.diagram.chips) || []).forEach((c) => chips.push(renderTokens(c, sys())));
    card.appendChild(h('div', { class: 'info' + (st.show.info ? '' : ' hide') }, chips.map((t) => h('span', { class: 'chip' }, t))));
    if (st.view !== '2d' && model) {
      card.appendChild(vizView(model));
      card.appendChild(h('p', { class: 'muted small vz-note' }, 'Illustrative view driven by the computed results, not a finite element analysis. Drag to orbit, scroll to zoom.'));
    } else {
      if (viz) viz.update(null, { view: '2d' });
      const svg = drawSvg();
      card.appendChild(svg || h('p', { class: 'muted small' }, 'The drawing appears when the inputs are valid.'));
    }
    card.appendChild(h('button', { type: 'button', class: 'tooltab' + (st.toolsOpen ? ' open' : ''), 'aria-label': 'Drawing options', 'aria-expanded': String(st.toolsOpen), onClick: () => { st.toolsOpen = !st.toolsOpen; refresh(); } }, st.toolsOpen ? '›' : '‹'));
    const opts = [{ key: 'dim', label: 'Dimensions' }].concat(def.drawOptions || [], [{ key: 'info', label: 'Design info' }]);
    card.appendChild(h('div', { class: 'tools' + (st.toolsOpen ? ' open' : '') },
      h('h3', { class: 'h3', style: 'margin:0' }, 'Drawing options'),
      opts.map((o) => h('label', { class: 'opt' }, h('input', { type: 'checkbox', checked: st.show[o.key], tabindex: st.toolsOpen ? null : '-1', onChange: (e) => { st.show[o.key] = e.target.checked; refresh(); } }), ' ' + o.label)),
      h('button', { type: 'button', class: 'btn', tabindex: st.toolsOpen ? null : '-1', onClick: savePng }, 'Save image as PNG'),
      def.signNote ? h('p', { class: 'muted', style: 'margin:6px 0 0;font-size:12px' }, h('strong', null, 'Sign convention: '), def.signNote) : null));
    return card;
  }

  function fillOutputs() {
    st.result = solveNow();
    const ctx = uiCtx(), r = st.result;
    clear(parts.out);
    parts.draw = drawCard();
    [parts.draw, verdictBanner(r), messages(r), keyResults(r, ctx), tables(r, ctx), sendLinks(r, (sd) => app.send(sd, def.title))].forEach((x) => { if (x) parts.out.appendChild(x); });
    if (parts.checks) { clear(parts.checks); parts.checks.appendChild(checksSummary(r, ctx)); }
    clear(parts.solution);
    if (st.step === stepNames().length - 1 && r.ok && r.steps.length) parts.solution.appendChild(solutionCard(r, ctx, (val) => app.set('clauseDisplay', val)));
    clear(parts.stick);
    const strip = stickyStrip(r);
    if (strip) parts.stick.appendChild(strip);
  }
  function refresh() {
    clearTimeout(timer);
    if (parts.form) refreshStates(parts.form, fieldList(), st.vals, sys());
    fillOutputs();
  }

  function renderAll() {
    clearTimeout(timer);
    const active = document.activeElement && outlet.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
    const names = stepNames();
    if (st.step > names.length - 1) st.step = names.length - 1;
    clear(outlet);
    parts = {};
    const modeLabel = def.modes.find((m) => m.id === st.mode).label;
    const copyBtn = h('button', { type: 'button', class: 'btn', onClick: async () => { const ok = await copyText(solutionText(reportData())); flash(copyBtn, ok ? 'Copied' : 'Copy failed'); } }, 'Copy solution');
    const shareBtn = h('button', { type: 'button', class: 'btn', onClick: async () => { const ok = await copyText(shareLink()); flash(shareBtn, ok ? 'Link copied' : 'Copy failed'); } }, 'Share link');
    outlet.appendChild(h('div', { class: 'row sb' },
      h('div', null, h('p', { class: 'muted small', style: 'margin:0' }, group.label),
        h('div', { class: 'row' }, h('h2', { class: 'h2' }, def.title), h('span', { class: 'tag' }, modeLabel),
          method() === 'WSD' ? h('span', { class: 'pill warn' }, 'WSD reference mode') : null)),
      h('div', { class: 'row' }, copyBtn,
        h('button', { type: 'button', class: 'btn', onClick: () => { const live = (parts.draw && parts.draw.querySelector('svg.dg')) || drawSvg(); buildReport(reportData(), live ? live.cloneNode(true) : null); printReport(def.id.replace('/', '-') + '-' + st.mode); } }, 'Print report'),
        shareBtn,
        h('button', { type: 'button', class: 'btn', onClick: reset }, 'Reset'))));
    if (st.banner) outlet.appendChild(h('div', { class: 'banner', role: 'status' }, h('span', null, st.banner), h('button', { type: 'button', class: 'btn', 'aria-label': 'Dismiss', onClick: () => { st.banner = ''; renderAll(); } }, 'Dismiss')));
    const tabs = modeTabs(def, st.mode, tasks(), task(), (t) => onChange('task', t, true));
    if (tabs) outlet.appendChild(tabs);
    outlet.appendChild(stepBar(names, st.step, goStep));
    parts.form = formCard();
    parts.out = h('div', { class: 'out' });
    outlet.appendChild(h('div', { class: 'work' + (st.step === names.length - 1 ? ' results' : '') }, parts.form, parts.out));
    parts.solution = h('div');
    outlet.appendChild(parts.solution);
    parts.stick = h('div');
    outlet.appendChild(parts.stick);
    fillOutputs();
    if (active) { const el = outlet.querySelector('[data-key="' + active + '"]'); if (el && el.focus) el.focus(); }
  }

  // ---- start
  loadMode();
  if (route.query && route.query.i) {
    const shared = store.decodeInputs(route.query.i);
    if (shared) {
      const from = route.query.u === 'US' ? 'US' : 'SI';
      st.vals = Object.assign(toDisplay(defaultsSI()), from === sys() ? shared : convertVals(shared, from, sys()));
      st.transient = true; st.banner = 'Loaded from a shared link. Your saved inputs are kept until you edit a value.';
    }
  }
  const sent = store.get('send.' + def.id);
  if (sent && sent.values && (!sent.mode || sent.mode === st.mode)) {
    store.remove('send.' + def.id);
    applySI(sent.values);
    st.banner = 'Loaded from ' + sent.from; st.transient = false; save();
  }
  const firstShape = fieldList().find((f) => f.type === 'shape');
  if (firstShape && !shapesNow()) loadShapes().then(() => { if (outlet.isConnected) renderAll(); });
  renderAll();

  return {
    onState(key, prev) {
      if (key === 'units') { st.vals = convertVals(st.vals, prev, sys()); save(); }
      renderAll();
    },
    destroy() { clearTimeout(timer); if (viz) viz.dispose(); viz = null; vizHost = null; },
    // Used by the browser smoke test.
    debug: { state: st, siInput: () => siInput().input, loadPreset, viz: () => viz, model: currentModel, presets: () => (def.presets || []).filter((p) => p.mode === st.mode) }
  };
}
