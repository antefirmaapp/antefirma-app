/**
 * Visual regression: the web app's main screens compared with approved images.
 *
 *     node tools/web-build.mjs && node test/visual.mjs     (needs Playwright)
 *     UPDATE_VISUAL=1 node test/visual.mjs                  to approve a deliberate change
 *
 * The web app runs the same panel and settings code and CSS as the extension,
 * so this catches layout and style regressions in both. Every screen is taken
 * in light theme, with animations off and one font everywhere (DejaVu Sans, on
 * Ubuntu and in most Linux images), so the same code gives the same pixels.
 * Images are compared inside Chromium, without extra dependencies: a pixel
 * counts as different when a channel moves by more than 32; a screen fails when
 * more than 0.5 % of its pixels differ, or its size changes. On failure the new
 * image and a diff (changed pixels in red) are written next to the baseline as
 * `<name>.new.png` and `<name>.diff.png`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { server, BASE, TEXT, api, ROOT } from './web-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIR = join(ROOT, 'test', 'visual');
const UPDATE = process.env.UPDATE_VISUAL === '1';
const TOLERANCE = 0.005;
mkdirSync(DIR, { recursive: true });

// Fixed clock, so dates and "days left" never change the picture.
const NOW = Date.parse('2026-11-10T09:00:00Z');
const FREEZE = `{
  const N = ${NOW}; const D = Date;
  class F extends D { constructor(...a) { super(...(a.length ? a : [N])); } static now() { return N; } }
  globalThis.Date = F;
}`;
const STYLE = `*, *::before, *::after { font-family: "DejaVu Sans", sans-serif !important; animation: none !important; transition: none !important; caret-color: transparent !important; }`;

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Compares two PNGs in a page: { width, height, changed, total, diff (PNG bytes) }. */
async function compare(cmp, a, b) {
  const r = await cmp.evaluate(async ([a64, b64]) => {
    const load = (b64) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = `data:image/png;base64,${b64}`; });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}×${ia.height} → ${ib.width}×${ib.height}` };
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height);
    x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height);
    const out = x.createImageData(c.width, c.height);
    let changed = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      const grey = (db.data[i] + db.data[i + 1] + db.data[i + 2]) / 3;
      if (d > 32) { changed++; out.data.set([255, 0, 0, 255], i); } else out.data.set([grey, grey, grey, 60], i);
    }
    x.putImageData(out, 0, 0);
    return { changed, total: c.width * c.height, diff: c.toDataURL('image/png').split(',')[1] };
  }, [a.toString('base64'), b.toString('base64')]);
  return r;
}

async function screen(page, cmp, name) {
  await page.waitForTimeout(150);
  const shot = await page.screenshot({ fullPage: true });
  const base = join(DIR, `${name}.png`);
  for (const f of [`${name}.new.png`, `${name}.diff.png`]) rmSync(join(DIR, f), { force: true });
  if (UPDATE || !existsSync(base)) {
    writeFileSync(base, shot);
    return check(`${name}: baseline ${UPDATE ? 'updated' : 'created'}`, true);
  }
  const r = await compare(cmp, readFileSync(base), shot);
  if (r.size) {
    writeFileSync(join(DIR, `${name}.new.png`), shot);
    return check(`${name}: same size`, false, r.size);
  }
  const share = r.changed / r.total;
  const ok = share <= TOLERANCE;
  if (!ok) {
    writeFileSync(join(DIR, `${name}.new.png`), shot);
    writeFileSync(join(DIR, `${name}.diff.png`), Buffer.from(r.diff, 'base64'));
  }
  check(`${name}: matches the approved image`, ok, `${(share * 100).toFixed(2)} % of pixels differ`);
}

async function run(label, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'en-GB', colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1, ...extra });
  await ctx.addInitScript(FREEZE);
  await ctx.route('https://api.antefirma.app/**', api);
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith('https://api.antefirma.app/'), (r) => r.abort());
  const page = await ctx.newPage();
  const cmp = await ctx.newPage();
  const style = () => page.addStyleTag({ content: STYLE });

  await page.goto(BASE);
  await style();
  await page.waitForSelector('.web-welcome');
  await screen(page, cmp, `${label}-welcome`);
  await page.click('.web-welcome [data-w="paste"]');
  await page.evaluate(() => document.activeElement?.blur());
  await screen(page, cmp, `${label}-empty`);

  await page.fill('#paste-text', TEXT);
  await page.click('#run-paste');
  await page.waitForSelector('#modal:not([hidden])');
  await screen(page, cmp, `${label}-consent`);
  await page.locator('#modal-foot button', { hasText: /analyse/i }).first().click();
  await page.waitForFunction(() => /599[.,]76/.test(document.getElementById('result')?.textContent || ''));
  await screen(page, cmp, `${label}-verdict`);

  await page.goto(`${BASE}settings/`);
  await style();
  await page.waitForTimeout(400);
  // The installation code is random on every run.
  await page.evaluate(() => { const el = document.getElementById('install-id'); if (el) el.textContent = '00000000-0000-4000-8000-000000000000'; });
  await screen(page, cmp, `${label}-settings`);
  await ctx.close();
}

try {
  await run('desktop', { width: 1280, height: 800 });
  await run('phone', { width: 375, height: 740 }, { isMobile: true, hasTouch: true });
} catch (err) {
  check('the run reaches the end', false, err.message);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) console.log(`New images and diffs are in ${DIR} (*.new.png, *.diff.png).`);
process.exitCode = failed ? 1 : 0;
