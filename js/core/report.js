// Print report and copy-solution text. Both are built from the same result object,
// so they never disagree with the screen.
import { fmtDC, fmtQ, renderTokens } from './format.js';
import { clauseText } from '../codes/index.js';
import { SYSTEMS } from './units.js';
import { mathNodes } from '../ui/dom.js';

const SITE = 'Structural Analysis and Design Calculator';
const ORG = 'American Concrete Institute Philippines T.I.P. QC Student Chapter';
const BY = 'by CEM Jumawan';
const STATUS = { OK: 'OK', NEAR: 'OK · near limit', NG: 'NG' };

const side = (x, sys) => (x.label ? x.label + ' = ' : '') + fmtQ(x.value, x.q, sys);
const cell = (c, sys) => (c != null && typeof c === 'object' ? renderTokens(Array.isArray(c) ? c : [c], sys) : String(c == null ? '' : c));
const title = (r) => r.modeLabel + (r.taskLabel ? ', ' + r.taskLabel.toLowerCase() : '');

// r: { group, module, modeLabel, taskLabel, edition, method, sys, clauseDisplay, inputs: [{label, value}], result }
export function solutionText(r) {
  const res = r.result, sys = r.sys, L = [];
  L.push(SITE, BY, '');
  L.push(r.group + ' · ' + r.module + ' · ' + title(r));
  L.push('Code edition: ' + r.edition.label);
  if (r.method) L.push('Method: ' + r.method);
  L.push('Units: ' + SYSTEMS[sys], '');
  if (!res.ok) { L.push('ERRORS'); res.errors.forEach((e) => L.push('  ' + e)); L.push(''); }
  if (res.ok && res.warnings.length) { L.push('WARNINGS'); res.warnings.forEach((e) => L.push('  ' + e)); L.push(''); }
  if (res.notes.length) { L.push('NOTES'); res.notes.forEach((e) => L.push('  ' + e)); L.push(''); }
  L.push('INPUTS');
  r.inputs.forEach((i) => L.push('  ' + i.label + ': ' + i.value));
  L.push('');
  if (res.ok) {
    if (res.verdict && res.verdict.line != null) L.push('RESULT: ' + res.verdict.line, '');
    else if (res.verdict) L.push('VERDICT: ' + (res.verdict.pass ? 'ADEQUATE' : 'NOT ADEQUATE') + ' (governing: ' + res.verdict.governing + ', D/C = ' + fmtDC(res.verdict.dc) + ')', '');
    if (res.checks.length) {
      L.push('CHECKS');
      res.checks.forEach((c) => L.push('  ' + c.name + ': ' + side(c.demand, sys) + ' against ' + side(c.capacity, sys) + '; D/C = ' + fmtDC(c.dc) + '; ' + STATUS[c.status] + ' [' + clauseText(r.edition, c.clause, r.clauseDisplay) + ']' + (c.note ? ' (' + c.note + ')' : '')));
      L.push('');
    }
    L.push('RESULTS');
    res.results.forEach((x) => L.push('  ' + x.label + ' = ' + fmtQ(x.value, x.q, sys)));
    L.push('');
    ((res.diagram && res.diagram.tables) || []).forEach((t) => {
      L.push(t.title.toUpperCase());
      L.push('  ' + t.head.join(' | '));
      t.rows.forEach((row) => L.push('  ' + row.cells.map((c) => cell(c, sys)).join(' | ')));
      if (t.note) L.push('  ' + t.note);
      L.push('');
    });
    L.push('SOLUTION');
    res.steps.forEach((st, i) => {
      L.push((i + 1) + '. ' + st.title);
      if (st.formula) L.push('   ' + renderTokens(st.formula, sys));
      if (st.substitution) L.push('   ' + renderTokens(st.substitution, sys));
      if (st.result) L.push('   ' + renderTokens(st.result, sys));
      if (st.note) L.push('   Note: ' + st.note);
      if (st.clause) L.push('   [' + clauseText(r.edition, st.clause, r.clauseDisplay) + ']');
    });
    L.push('');
  }
  L.push('ACIP T.I.P. QC SC · ' + SITE);
  L.push('For study and preliminary design. Verify results against the governing code.');
  return L.join('\n');
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function table(head, rows) {
  const t = el('table', rows.length <= 14 ? 'keep' : null);
  if (head) { const tr = el('tr'); head.forEach((x) => tr.appendChild(el('th', null, x))); t.appendChild(tr); }
  rows.forEach((cells) => {
    const tr = el('tr');
    cells.forEach((c) => { const td = el('td', c && c.cls ? c.cls : null, c && c.text != null ? c.text : c); tr.appendChild(td); });
    t.appendChild(tr);
  });
  return t;
}

// Build the A4 report into the #report element. svg: a clone of the live drawing (or null).
export function buildReport(r, svg) {
  const root = document.getElementById('report');
  if (!root) return;
  root.textContent = '';
  const res = r.result, sys = r.sys;
  const rp = el('div', 'rp lightpal');

  const head = el('div', 'rp-head');
  const img = el('img'); img.src = 'assets/logo-256.png'; img.alt = 'ACI Philippines T.I.P. Quezon City Student Chapter logo';
  head.appendChild(img);
  const names = el('div');
  names.appendChild(el('div', 't', SITE)); names.appendChild(el('div', 's', ORG)); names.appendChild(el('div', 'by', BY));
  head.appendChild(names);
  const meta = el('div', 'meta');
  meta.appendChild(el('div', null, r.edition.label));
  meta.appendChild(el('div', null, (r.method ? 'Method: ' + r.method + ' · ' : '') + 'Units: ' + (sys === 'US' ? 'English' : 'SI')));
  meta.appendChild(el('div', null, 'Printed ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })));
  head.appendChild(meta);
  rp.appendChild(head);

  const tt = el('div', 'rp-title');
  const left = el('div');
  left.appendChild(el('div', 'g', r.group + ' · ' + r.module));
  left.appendChild(el('div', 'n', title(r)));
  tt.appendChild(left);
  if (!res.ok) {
    const vb = el('div', 'rp-v fail'); vb.appendChild(el('div', 'w', 'CHECK THE INPUTS')); tt.appendChild(vb);
  } else if (res.verdict && res.verdict.line != null) {
    // analysis modules: their own banner word and line
    const vb = el('div', 'rp-v' + (res.verdict.pass ? '' : ' fail'));
    vb.appendChild(el('div', 'w', res.verdict.word[res.verdict.pass ? 0 : 1]));
    vb.appendChild(el('div', null, res.verdict.line));
    tt.appendChild(vb);
  } else if (res.verdict) {
    const vb = el('div', 'rp-v' + (res.verdict.pass ? '' : ' fail'));
    vb.appendChild(el('div', 'w', res.verdict.pass ? 'ADEQUATE' : 'NOT ADEQUATE'));
    vb.appendChild(el('div', 'mono', 'Governing D/C = ' + fmtDC(res.verdict.dc)));
    vb.appendChild(el('div', null, res.verdict.governing));
    tt.appendChild(vb);
  }
  rp.appendChild(tt);

  const msgs = el('div', 'rp-msgs');
  if (!res.ok) res.errors.forEach((e) => msgs.appendChild(el('p', 'msg ng', 'Error: ' + e)));
  if (res.ok) res.warnings.forEach((e) => msgs.appendChild(el('p', 'msg near', 'Warning: ' + e)));
  res.notes.forEach((e) => msgs.appendChild(el('p', 'msg', 'Note: ' + e)));
  if (msgs.childNodes.length) rp.appendChild(msgs);

  const two = el('div', 'rp-two');
  const a = el('div'); a.appendChild(el('h2', null, 'Inputs'));
  a.appendChild(table(null, r.inputs.map((i) => [i.label, { cls: 'mono', text: i.value }])));
  two.appendChild(a);
  if (svg) { const b = el('div'); b.appendChild(el('h2', null, 'Drawing')); b.appendChild(svg); two.appendChild(b); }
  rp.appendChild(two);
  // Module-specific report sections (Matrix Analysis: tables, matrices and diagrams, hand-off 7.6).
  if (r.extra) [].concat(r.extra).forEach((node) => { if (node) rp.appendChild(node); });

  if (res.ok) {
    if (res.checks.length) {
      rp.appendChild(el('h2', null, 'Check summary'));
      rp.appendChild(table(['Check', 'Demand', 'Capacity', 'D/C', 'Status', 'Clause'], res.checks.map((c) => [
        c.name + (c.note ? ' (' + c.note + ')' : ''), { cls: 'mono', text: side(c.demand, sys) }, { cls: 'mono', text: side(c.capacity, sys) }, { cls: 'mono', text: fmtDC(c.dc) },
        { cls: c.status === 'NG' ? 'ng' : c.status === 'NEAR' ? 'near' : 'ok', text: STATUS[c.status] }, { cls: 'cl', text: clauseText(r.edition, c.clause, r.clauseDisplay) }])));
    }
    if (res.results.length) {
      rp.appendChild(el('h2', null, 'Key results'));
      rp.appendChild(table(null, res.results.map((x) => [x.label, { cls: 'mono', text: fmtQ(x.value, x.q, sys) }])));
    }
    ((res.diagram && res.diagram.tables) || []).forEach((t) => {
      rp.appendChild(el('h2', null, t.title));
      rp.appendChild(table(t.head, t.rows.map((row) => row.cells.map((c) => ({ cls: 'mono', text: cell(c, sys) })))));
      if (t.note) rp.appendChild(el('p', 'msg', t.note));
    });
    rp.appendChild(el('h2', null, 'Worked solution'));
    res.steps.forEach((st, i) => {
      const row = el('div', 'st');
      row.appendChild(el('b', null, String(i + 1)));
      const body = el('div');
      body.appendChild(el('div', 'tt', st.title));
      const line = [st.formula, st.substitution].filter(Boolean).map((x) => renderTokens(x, sys));
      line.forEach((x) => { const d = el('div', 'mono'); d.append(...mathNodes(x)); body.appendChild(d); });
      if (st.result) { const d = el('div', 'mono'); const sr = el('strong'); sr.append(...mathNodes(renderTokens(st.result, sys))); d.appendChild(sr); body.appendChild(d); }
      if (st.note) body.appendChild(el('div', 'nt', st.note));
      if (st.clause) body.appendChild(el('div', 'cl', clauseText(r.edition, st.clause, r.clauseDisplay)));
      row.appendChild(body);
      rp.appendChild(row);
    });
  }
  root.appendChild(rp);
}

// Print with a suggested PDF name of <module>-<mode>.pdf.
export function printReport(fileName) {
  const old = document.title;
  document.title = fileName;
  const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 2000);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through to the older method */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
