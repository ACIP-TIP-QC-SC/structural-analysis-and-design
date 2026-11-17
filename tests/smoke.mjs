// Browser smoke test: node tests/smoke.mjs   (needs Playwright; a development tool only)
// Hand-off Section 12, items 4 to 6:
//  - loads every preset of every built module in SI and English, in light and dark themes;
//  - asserts no console errors, no "NaN", "undefined" or "Infinity" in the page text,
//    and that the verdict matches the preset's expectation;
//  - converts one preset to English and back and checks the inputs return within 0.01%;
//  - checks the layout at 360, 820 and 1440 px (no horizontal page scroll, footer reachable, drawing visible);
//  - checks the "Send to" links, a share link, persistence across reload and one printed report per group.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.csv': 'text/csv' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch (e) { console.log('Playwright is not installed. See HANDBACK.md for the manual run.'); server.close(); process.exit(2); }

const registry = await import(new URL('../js/core/registry.js', import.meta.url));
const MODULES = registry.MODULES.filter((m) => registry.isBuilt(m.id)).map((m) => m.id);
const ONLY = process.argv[2] || '';
const BAD = /NaN|undefined|Infinity/;
const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const open = async (hash) => {
  await page.goto(base + '#' + hash);
  await page.waitForFunction((h) => window.__sadc && window.__sadc.def && h.startsWith(window.__sadc.def.id) && window.__sadc.view(), hash);
};
const settle = () => page.waitForTimeout(30);

// ---- every preset, both unit systems, both themes
let presetRuns = 0;
for (const id of MODULES.filter((m) => !ONLY || m.includes(ONLY))) {
  await open(id);
  const modes = await page.evaluate(() => window.__sadc.def.modes.map((m) => m.id));
  for (const mode of modes) {
    await open(id + '/' + mode);
    const presets = await page.evaluate(() => window.__sadc.view().debug.presets().map((p) => ({ id: p.id, name: p.name, pass: 'pass' in p ? p.pass : undefined, ok: p.ok })));
    ok(presets.length > 0, id + '/' + mode + ': no presets');
    for (const pr of presets) {
      for (const units of ['SI', 'US']) {
        for (const theme of ['light', 'dark']) {
          await page.evaluate(({ pid, units, theme }) => {
            const s = window.__sadc; s.app.set('theme', theme); s.app.set('units', units);
            const vw = s.view(); vw.debug.loadPreset(vw.debug.presets().find((x) => x.id === pid));
            const steps = document.querySelectorAll('.stepb'); steps[steps.length - 1].click();
          }, { pid: pr.id, units, theme });
          await settle();
          const info = await page.evaluate(() => {
            const main = document.getElementById('main');
            const vd = main.querySelector('.verdict'), er = main.querySelector('.err');
            return { text: main.innerText, verdict: vd ? vd.querySelector('strong').textContent : null, error: er ? er.textContent : null, steps: main.querySelectorAll('.step').length, svg: !!main.querySelector('svg.dg'), theme: document.documentElement.getAttribute('data-theme') };
          });
          presetRuns++;
          const tag = id + '/' + mode + ' [' + pr.name + '] ' + units + ' ' + theme + ': ';
          const hit = info.text.match(BAD);
          ok(!hit, tag + 'page text contains "' + (hit && hit[0]) + '" near: ' + (hit ? info.text.slice(Math.max(0, hit.index - 60), hit.index + 30).replace(/\n/g, ' ') : ''));
          ok(info.theme === theme, tag + 'theme not applied');
          ok(info.svg, tag + 'no drawing');
          if (pr.pass === true) ok(info.verdict === 'ADEQUATE', tag + 'expected ADEQUATE, got ' + (info.verdict || info.error));
          else if (pr.pass === false) ok(info.verdict === 'NOT ADEQUATE', tag + 'expected NOT ADEQUATE, got ' + (info.verdict || info.error));
          else if (pr.pass === null) ok(info.verdict === null && !info.error, tag + 'expected no verdict, got ' + (info.verdict || info.error));
          else if (pr.ok === false) ok(!!info.error, tag + 'expected the error panel');
          else ok(!info.error, tag + 'unexpected error: ' + info.error);
          if (!info.error) ok(info.steps > 0, tag + 'no worked solution');
        }
      }
    }
  }
}
await page.evaluate(() => { window.__sadc.app.set('units', 'SI'); window.__sadc.app.set('theme', 'light'); });

// ---- units round trip: SI -> English -> SI within 0.01%
await open('rc/beam-flexure/singly');
const trip = await page.evaluate(() => {
  const s = window.__sadc, vw = s.view();
  vw.debug.loadPreset(vw.debug.presets()[0]);
  const before = Object.assign({}, vw.debug.state.vals);
  s.app.set('units', 'US'); s.app.set('units', 'SI');
  const after = vw.debug.state.vals;
  return Object.keys(before).filter((k) => typeof before[k] === 'number').map((k) => ({ k, a: before[k], b: after[k] }));
});
trip.forEach((t) => ok(Math.abs(t.a - t.b) <= 1e-4 * Math.abs(t.a), 'units round trip: ' + t.k + ' ' + t.a + ' -> ' + t.b));

// ---- settings persist across reload
await page.evaluate(() => { const a = window.__sadc.app; a.set('units', 'US'); a.set('theme', 'dark'); a.set('rcMethod', 'WSD'); });
await page.reload();
await page.waitForFunction(() => window.__sadc && window.__sadc.view());
const kept = await page.evaluate(() => { const st = window.__sadc.app.state; return st.units === 'US' && st.theme === 'dark' && st.rcMethod === 'WSD' && document.documentElement.getAttribute('data-theme') === 'dark'; });
ok(kept, 'theme, units and method did not persist across reload');
await page.evaluate(() => { const a = window.__sadc.app; a.set('units', 'SI'); a.set('theme', 'light'); a.set('rcMethod', 'USD'); });

// ---- every sidebar item routes
await page.goto(base + '#');
const links = await page.$$eval('#side a.navitem', (as) => as.map((a) => a.getAttribute('href')));
ok(links.length === 32, 'sidebar should list Home and 31 modules, found ' + links.length);
for (const href of links) {
  await page.goto(base + href);
  await page.waitForTimeout(40);
  const h2 = await page.$eval('#main .h2', (e) => e.textContent).catch(() => '');
  ok(h2.length > 0, 'route ' + href + ' shows no page');
}

// ---- "Send to" links
await open('shared/load-transfer/takeoff');
await page.evaluate(() => { const vw = window.__sadc.view(); vw.debug.loadPreset(vw.debug.presets()[0]); });
await settle();
const sent = await page.evaluate(() => { const r = window.__sadc.view().debug.state.result; return r.send.map((x) => ({ to: x.to, values: x.values })); });
for (let i = 0; i < sent.length; i++) {
  await open('shared/load-transfer/takeoff');
  await page.evaluate(() => { const vw = window.__sadc.view(); vw.debug.loadPreset(vw.debug.presets()[0]); });
  await settle();
  await page.locator('.sendrow button').nth(i).click();
  await page.waitForFunction((to) => window.__sadc.def.id === to && document.querySelector('.banner'), sent[i].to);
  const got = await page.evaluate(() => ({ input: window.__sadc.view().debug.siInput(), banner: document.querySelector('.banner').textContent }));
  ok(/Loaded from Load transfer/.test(got.banner), 'send banner missing for ' + sent[i].to);
  Object.entries(sent[i].values).forEach(([k, val]) => ok(Math.abs(got.input[k] - val) <= 1e-4 * Math.abs(val), 'send to ' + sent[i].to + ': ' + k + ' = ' + got.input[k] + ', expected ' + val));
  await page.evaluate(() => document.querySelector('button.btn:last-child') && [...document.querySelectorAll('.row .btn')].find((b) => b.textContent === 'Reset').click());
}
for (const [mode, quantity] of [['strength', 'moment'], ['strength', 'force']]) {
  await open('shared/load-combos/' + mode);
  await page.evaluate((quantity) => { const vw = window.__sadc.view(); vw.debug.loadPreset(vw.debug.presets()[0]); vw.debug.state.vals.quantity = quantity; window.__sadc.app.set('clauseDisplay', 'nscp'); window.__sadc.app.set('clauseDisplay', 'both'); }, quantity);
  await settle();
  const n = await page.locator('.sendrow button').count();
  ok(n === (quantity === 'moment' ? 1 : 2), 'load combinations send links for ' + quantity + ': found ' + n);
  await page.locator('.sendrow button').first().click();
  await page.waitForFunction(() => document.querySelector('.banner'));
  ok(/Loaded from Load combinations/.test(await page.$eval('.banner', (e) => e.textContent)), 'send banner missing from load combinations');
  await page.evaluate(() => [...document.querySelectorAll('.row .btn')].find((b) => b.textContent === 'Reset').click());
}

// ---- share link loads inputs without overwriting saved ones
await open('rc/beam-flexure/singly');
const link = await page.evaluate(() => {
  const vw = window.__sadc.view(); vw.debug.loadPreset(vw.debug.presets().find((p) => p.id === 'ng1'));
  const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '#rc/beam-flexure/singly?e=nscp2015&m=USD&u=SI&i=' + enc(Object.assign({}, vw.debug.state.vals, { b: 333 }));
});
await page.goto(base + '#'); await page.goto(base + link);
await page.waitForFunction(() => window.__sadc && window.__sadc.view() && document.querySelector('.banner'));
const shared = await page.evaluate(() => ({ b: window.__sadc.view().debug.siInput().b, saved: JSON.parse(localStorage.getItem('sadc.in.rc/beam-flexure.singly')).v.b }));
ok(shared.b === 333 && shared.saved === 250, 'share link: b = ' + shared.b + ', saved b = ' + shared.saved);
await page.evaluate(() => [...document.querySelectorAll('.row .btn')].find((b) => b.textContent === 'Reset').click());

// ---- layout at 360, 820 and 1440 px
for (const width of [360, 820, 1440]) {
  await page.setViewportSize({ width, height: 800 });
  for (const hash of ['', 'rc/beam-flexure/singly', 'steel/beams/flexure', 'found/isolated/design', 'shared/load-combos/strength', 'rc/columns']) {
    await page.goto(base + '#' + hash);
    await page.waitForTimeout(120);
    if (hash && hash !== 'rc/columns') { await page.evaluate(() => { const st = document.querySelectorAll('.stepb'); st[st.length - 1].click(); }); await settle(); }
    const lay = await page.evaluate(() => {
      const de = document.documentElement, foot = document.querySelector('.foot').getBoundingClientRect(), svg = document.querySelector('#main svg.dg');
      const bar = document.querySelector('.steps');
      return { sw: de.scrollWidth, cw: de.clientWidth, footBottom: foot.bottom + window.scrollY, docH: de.scrollHeight, svgW: svg ? svg.getBoundingClientRect().width : null,
        nested: [...document.querySelectorAll('#main *')].filter((el) => { const cs = getComputedStyle(el); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1 && !el.closest('.tools'); }).length,
        barH: bar && bar.children.length >= 5 ? bar.getBoundingClientRect().height : 0 };
    });
    const tag = 'layout ' + width + ' px, #' + hash + ': ';
    ok(lay.sw <= lay.cw + 1, tag + 'horizontal page scroll (' + lay.sw + ' > ' + lay.cw + ')');
    ok(Math.abs(lay.footBottom - lay.docH) < 2, tag + 'footer not reachable at the end of the page');
    ok(lay.nested === 0, tag + 'nested scroll box');
    if (lay.svgW != null) ok(lay.svgW > 200, tag + 'drawing not visible (width ' + lay.svgW + ')');
    if (width === 360 && lay.barH) ok(lay.barH > 60, tag + 'step bar did not wrap');
  }
}
await page.setViewportSize({ width: 1440, height: 900 });

// ---- one printed report per group
await page.emulateMedia({ media: 'print' });
for (const hash of ['rc/beam-flexure/singly', 'steel/compression/buckling', 'found/isolated/design', 'shared/load-combos/strength']) {
  await open(hash);
  await page.evaluate(() => { window.print = () => {}; [...document.querySelectorAll('.row .btn')].find((b) => b.textContent === 'Print report').click(); });
  await settle();
  const rp = await page.evaluate(() => {
    const r = document.getElementById('report');
    return { text: r.innerText, shown: getComputedStyle(r).display !== 'none', appHidden: getComputedStyle(document.querySelector('.app')).display === 'none', wm: !!r.querySelector('.rp-wm'), logo: !!r.querySelector('img'), tables: r.querySelectorAll('table').length, steps: r.querySelectorAll('.st').length, svg: !!r.querySelector('svg'), title: document.title };
  });
  const tag = 'report ' + hash + ': ';
  ok(rp.shown && rp.appHidden, tag + 'print view not switched');
  ok(rp.text.includes('Structural Analysis and Design Calculator') && rp.text.includes('American Concrete Institute Philippines T.I.P. QC Student Chapter') && rp.text.includes('by CEM Jumawan'), tag + 'branding lines missing');
  ok(rp.wm && rp.logo, tag + 'watermark or logo missing');
  ok(rp.steps > 0 && rp.svg, tag + 'solution or drawing missing');
  ok(hash.startsWith('shared') || /Check summary/i.test(rp.text), tag + 'check table missing');
  ok(!BAD.test(rp.text), tag + 'bad text in report');
  ok(rp.title === hash.replace('/', '-').replace('/', '-'), tag + 'PDF name is ' + rp.title);
}
await page.emulateMedia({ media: 'screen' });

ok(errors.length === 0, 'console errors: ' + errors.slice(0, 5).join(' | '));
await browser.close();
server.close();
console.log(presetRuns + ' preset renders (every preset × SI/English × light/dark), ' + checks + ' checks, ' + fails.length + ' failed.');
fails.slice(0, 40).forEach((f) => console.log('  FAIL ' + f));
process.exitCode = fails.length ? 1 : 0;
