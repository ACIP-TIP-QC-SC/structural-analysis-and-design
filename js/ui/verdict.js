// Verdict banner, error panel and status pill. Text and icon, never color alone.
import { h } from './dom.js';
import { fmtDC } from '../core/format.js';

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"></path></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"></path></svg>';

export const STATUS = { OK: { cls: 'ok', text: 'OK' }, NEAR: { cls: 'warn', text: 'OK · near limit' }, NG: { cls: 'ng', text: 'NG' } };
export const pill = (status) => h('span', { class: 'pill ' + STATUS[status].cls }, STATUS[status].text);

export function verdictLine(result) {
  const vd = result.verdict;
  return vd ? 'Governing: ' + vd.governing + ', D/C = ' + fmtDC(vd.dc) : '';
}
export const verdictWord = (result) => (result.verdict.pass ? 'ADEQUATE' : 'NOT ADEQUATE');

export function verdictBanner(result) {
  if (!result.ok) {
    return h('div', { class: 'err o-verdict', role: 'alert' }, h('strong', null, 'Check the inputs. '), result.errors.join(' '));
  }
  if (!result.verdict) return null;
  const pass = result.verdict.pass;
  const el = h('div', { class: 'verdict o-verdict ' + (pass ? 'pass' : 'fail'), role: 'status' });
  el.innerHTML = pass ? CHECK : CROSS;
  el.appendChild(h('strong', null, verdictWord(result)));
  el.appendChild(h('span', null, verdictLine(result)));
  return el;
}

// Small strip fixed to the bottom of a phone screen while inputs are edited.
export function stickyStrip(result) {
  const el = h('div', { class: 'stick', 'aria-hidden': 'true' });
  if (!result.ok) { el.appendChild(h('span', { class: 'pill ng' }, 'Check the inputs')); return el; }
  if (!result.verdict) return null;
  el.appendChild(h('span', { class: 'pill ' + (result.verdict.pass ? 'ok' : 'ng') }, verdictWord(result)));
  el.appendChild(h('span', { class: 'mono' }, 'D/C = ' + fmtDC(result.verdict.dc)));
  el.appendChild(h('span', { class: 'muted' }, result.verdict.governing));
  return el;
}
