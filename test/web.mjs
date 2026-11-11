/**
 * The web app (dist/web, as published on web.antefirma.app) in a real Chromium,
 * with a fake server.
 *
 *     node tools/web-build.mjs && node test/web.mjs        (needs Playwright)
 *
 * It checks the path of someone who arrives for the first time: welcome,
 * pasted text, consent, verdict with the cost, saving the commitment, settings;
 * accessibility with axe-core at each step; a 375 px phone with no sideways
 * scrolling; no JavaScript errors.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { server, BASE, TEXT, calls, api } from './web-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const a11y = async (pg, name) => {
  if (!(await pg.evaluate(() => Boolean(window.axe)))) await pg.evaluate(AXE);
  const found = await pg.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.slice(0, 2).map((n) => n.target.flat().join(' ') + (n.any?.[0]?.message ? ': ' + n.any[0].message : '')).join(' | ')})`);
  });
  check(`${name}: no serious accessibility problems`, found.length === 0, found.join('; '));
};
/** null if the page fits the screen, otherwise the innermost element (or text) that sticks out. */
const tooWide = (pg) => pg.evaluate(() => {
  const w = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= w + 1) return null;
  const name = (n) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${n.className && typeof n.className === 'string' ? `.${n.className.split(' ')[0]}` : ''}`;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const r = document.createRange(); r.selectNodeContents(t);
    if (r.getBoundingClientRect().right > w + 1) return `text "${t.textContent.trim().slice(0, 40)}" in ${name(t.parentElement)}`;
  }
  const el = [...document.querySelectorAll('body *')].filter((n) => n.getBoundingClientRect().right > w + 1)
    .find((n) => ![...n.children].some((c) => c.getBoundingClientRect().right > w + 1));
  return el ? name(el) : `page (${document.documentElement.scrollWidth} px)`;
});

const browser = await chromium.launch();
const errors = [];
const open = async (opts) => {
  const ctx = await browser.newContext({ locale: 'en-GB', reducedMotion: 'reduce', ...opts });
  await ctx.route('https://api.antefirma.app/**', api);
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith('https://api.antefirma.app/'), (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE);
  return { ctx, page };
};

try {
  // ── desktop ──
  const { ctx, page } = await open({ viewport: { width: 1280, height: 820 } });
  await page.waitForSelector('.web-welcome', { timeout: 5000 });
  check('first opening: the welcome appears, in the browser language', (await page.textContent('#ww-t'))?.length > 3 && !/\bweb[A-Z]\w+/.test(await page.textContent('.web-welcome')));
  await a11y(page, 'the welcome');
  await page.click('.web-welcome [data-w="paste"]');
  check('"Paste" closes the welcome and puts the cursor in the text box', (await page.locator('.web-welcome').count()) === 0 && await page.evaluate(() => document.activeElement?.id === 'paste-text'));
  check('the empty result says what will appear', await page.isVisible('.web-placeholder'));
  await a11y(page, 'the empty panel');

  await page.fill('#paste-text', TEXT);
  await page.click('#run-paste');
  await page.waitForSelector('#modal:not([hidden])', { timeout: 5000 });
  check('the first analysis asks for consent', (await page.textContent('#modal-title')).length > 3);
  await a11y(page, 'the consent dialog');
  await page.locator('#modal-foot button', { hasText: /analyse/i }).first().click();
  await page.waitForFunction(() => /599[.,]76/.test(document.getElementById('result')?.textContent || ''), null, { timeout: 10000 });
  check('the verdict shows the real cost (€19.99 × 24 + €120)', true);
  check('only the analysis went to the server, after the yes', calls.includes('/v1/analyze'));
  await a11y(page, 'the verdict');

  // Recorded as a commitment: it appears in the Commitments tab with its deadline.
  await page.click('#track');
  await page.waitForTimeout(600);
  await page.click('#tab-btn-commitments');
  await page.waitForTimeout(600);
  const items = await page.locator('.c-item:not(.example)').count();
  check('the commitment is recorded and listed in the Commitments tab', items === 1, `${items} commitments`);
  check('…with its cancellation deadline', /2028/.test(await page.locator('.c-item:not(.example)').first().textContent()));
  await a11y(page, 'the Commitments tab');

  await page.reload();
  check('the welcome does not come back', (await page.locator('.web-welcome').count()) === 0);
  await page.goto(`${BASE}settings/`);
  await page.waitForTimeout(600);
  check('settings open in the web app', (await page.locator('#save, form, section').count()) > 0);
  await a11y(page, 'settings');
  await ctx.close();

  // ── phone ──
  const phone = await open({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  // FONT=… imitates another system's fonts (CI runs on Ubuntu, with wider DejaVu).
  if (process.env.FONT) await phone.page.addStyleTag({ content: `*{font-family:${process.env.FONT} !important}` });
  await phone.page.waitForSelector('.web-welcome', { timeout: 5000 });
  let wide = await tooWide(phone.page);
  check('phone: the welcome fits the screen', !wide, wide || '');
  await phone.page.click('.web-welcome [data-w="paste"]');
  wide = await tooWide(phone.page);
  check('phone: the panel fits the screen', !wide, wide || '');
  await phone.ctx.close();
} catch (err) {
  check('the run reaches the end', false, err.message);
} finally {
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
