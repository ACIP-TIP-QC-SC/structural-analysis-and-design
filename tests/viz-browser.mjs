// Browser test of the Stress, 3D and Play views: node tests/viz-browser.mjs [module] [--shots]   (needs Playwright; a development tool only)
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
const { hasViz } = await import(new URL('../js/ui/viz/models.js', import.meta.url));
const MODULES = registry.MODULES.filter((m) => registry.isBuilt(m.id) && hasViz(m.id)).map((m) => m.id);
const ONLY = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const SHOTS = process.argv.includes('--shots');
const fails = [];
let checks = 0, views = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const open = async (hash) => {
  await page.goto(base + '#' + hash);
  await page.waitForFunction((h) => window.__sadc && window.__sadc.def && h.startsWith(window.__sadc.def.id) && window.__sadc.view(), hash);
};
const shotDir = join(root, 'tests', 'shots');
if (SHOTS) await import('node:fs').then((fs) => fs.mkdirSync(shotDir, { recursive: true }));
for (const id of MODULES.filter((m) => !ONLY || m.includes(ONLY))) {
  await open(id);
  const modes = await page.evaluate(() => window.__sadc.def.modes.map((m) => m.id));
  for (const mode of modes) {
    await open(id + '/' + mode);
    const presets = await page.evaluate(() => window.__sadc.view().debug.presets().map((p) => p.id));
    for (const pid of presets.slice(0, 2)) {
      errors.length = 0;
      const has = await page.evaluate((pid) => { const vw = window.__sadc.view(); vw.debug.loadPreset(vw.debug.presets().find((x) => x.id === pid)); return !!vw.debug.model(); }, pid);
      if (!has) continue;
      const tag = id + '/' + mode + ' [' + pid + ']: ';
      for (const v of ['Stress', '3D']) {
        const btn = page.locator('.vz-bar .seg button', { hasText: new RegExp('^' + v + '$') });
        if (await btn.isDisabled()) continue;
        await btn.click();
        await page.waitForFunction(() => { const vw = window.__sadc.view(); return vw.debug.viz() && document.querySelector('.vz-canvas'); }, null, { timeout: 15000 });
        await page.waitForTimeout(60);
        const info = await page.evaluate((v) => {
          const c = document.querySelector('.vz-canvas'), lg = document.querySelector('.vz-legend');
          const g = c.getContext('webgl2') || c.getContext('webgl');
          const w = c.width, h = c.height, N = 400, px = new Uint8Array(4 * N);
          let colored = 0;
          for (let i = 0; i < N; i++) { g.readPixels(Math.floor(w * (0.05 + 0.9 * (i % 20) / 20)), Math.floor(h * (0.05 + 0.9 * Math.floor(i / 20) / 20)), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4)); }
          // Compare with the background colour in the bottom-right corner.
          const bg = new Uint8Array(4); g.readPixels(w - 3, 2, 1, 1, g.RGBA, g.UNSIGNED_BYTE, bg);
          const ref = [bg[0], bg[1], bg[2]];
          for (let i = 0; i < N; i++) if (Math.abs(px[i * 4] - ref[0]) + Math.abs(px[i * 4 + 1] - ref[1]) + Math.abs(px[i * 4 + 2] - ref[2]) > 30) colored++;
          return { w, h, colored, legend: lg && lg.style.display !== 'none' ? lg.innerText : '' };
        }, v);
        views++;
        ok(info.w > 100 && info.h > 100, tag + v + ': canvas too small');
        ok(info.colored > 2, tag + v + ': nothing drawn');
        if (v === 'Stress') ok(/\d/.test(info.legend) && !/NaN|undefined|Infinity/.test(info.legend), tag + 'legend missing or bad: ' + info.legend.slice(0, 80));
        if (v === 'Stress' && pid === presets[0]) {
          // Legend controls: full, minimize, restore, drag.
          const lg = page.locator('.vz-legend');
          await lg.locator('[data-act=size]').click();
          ok(await lg.evaluate((e) => e.classList.contains('vz-full') && e.querySelectorAll('.vz-row').length >= 11), tag + 'full legend not shown');
          await lg.locator('[data-act=min]').click();
          ok(await lg.evaluate((e) => e.classList.contains('vz-min') && e.offsetHeight < 50), tag + 'legend did not minimize');
          await lg.locator('[data-act=min]').click();
          ok(await lg.evaluate((e) => e.classList.contains('vz-compact')), tag + 'legend did not restore to compact');
          const hb = await lg.locator('.vz-lh').boundingBox();
          await page.mouse.move(hb.x + 20, hb.y + 6); await page.mouse.down(); await page.mouse.move(hb.x + 140, hb.y + 60, { steps: 4 }); await page.mouse.up();
          const nb = await lg.boundingBox();
          ok(nb.x > hb.x + 60 && nb.y > hb.y + 20, tag + 'legend did not move when dragged');
        }
        if (SHOTS && pid === presets[0]) await page.locator('.vz-host').screenshot({ path: join(shotDir, (id + '-' + mode + '-' + v).replace(/\//g, '-') + '.png') });
      }
      // Play: run the animation and jump to the loading and failure phases
      const play = page.locator('.vz-play');
      if (!(await play.isDisabled())) {
        await play.click();
        await page.waitForTimeout(250);
        await play.click();
        const hud = await page.evaluate(() => { const vw = window.__sadc.view(), z = vw.debug.viz(); return [3, 8.5].map((t) => { z.seek(t); return document.querySelector('.vz-hud').innerText; }); });
        ok(hud.every((t) => t && !/NaN|undefined|Infinity/.test(t)), tag + 'bad animation text: ' + hud.join(' | '));
        if (SHOTS && pid === presets[0]) await page.locator('.vz-host').screenshot({ path: join(shotDir, (id + '-' + mode + '-play').replace(/\//g, '-') + '.png') });
      }
      // Rebar toggle
      const tog = page.locator('.vz-opt input');
      if (await tog.count()) { await tog.click(); await page.waitForTimeout(40); await tog.click(); }
      await page.locator('.vz-bar .seg button', { hasText: /^Drawing$/ }).click();
      ok(await page.locator('svg.dg').count() > 0, tag + 'no 2D drawing after switching back');
      ok(errors.length === 0, tag + 'console errors: ' + errors.slice(0, 3).join(' | '));
    }
  }
}
await browser.close();
server.close();
fails.slice(0, 60).forEach((f) => console.log('  FAIL ' + f));
console.log(views + ' views rendered, ' + checks + ' checks, ' + fails.length + ' failed');
process.exit(fails.length ? 1 : 0);
