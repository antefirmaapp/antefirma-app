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
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'web');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/web is missing: run node tools/web-build.mjs first');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;

const TEXT = `Abbonamento Premium a € 19,99 al mese. Il contratto ha una durata minima di 24 mesi.
Alla scadenza il contratto si rinnova automaticamente per un uguale periodo, salvo disdetta con preavviso di almeno 60 giorni.
In caso di recesso anticipato è dovuta una penale di € 120,00.`;
const VERDICT = {
  findings: [
    { category: 'auto_renewal', quote: 'Alla scadenza il contratto si rinnova automaticamente per un uguale', why: 'Another 24 months.', confidence: 0.9 },
    { category: 'early_termination_penalty', quote: 'In caso di recesso anticipato è dovuta una penale di € 120,00', why: 'Leaving early costs.', confidence: 0.9 },
  ],
  terms: {
    price: { value: 19.99, quote: '€ 19,99' }, currency: { value: 'EUR' }, billing_period: { value: 'month' },
    minimum_term_months: { value: 24, quote: 'durata minima di 24 mesi' }, notice_days: { value: 60, quote: 'preavviso di almeno 60 giorni' },
    exit_fee: { value: 120, quote: 'penale di € 120,00' }, extra_fees: [],
  },
  summary: '', dropped: 0, truncated: false, model: 'fake', cached: false,
  quota: { plan: 'free', remaining: 4, month: { limit: 5, remaining: 4 } },
};
const calls = [];
async function api(route) {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  calls.push(path);
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (path === '/v1/health') return json(200, { ok: true });
  if (path === '/v1/register') return json(200, { token: 'v1.fake' });
  if (path === '/v1/analyze') return json(200, VERDICT);
  if (path === '/v1/license') return json(200, { plan: 'free', active: false, quota: { month: { limit: 5, remaining: 4 } } });
  return json(404, { error: 'not_found' });
}

const a11y = async (pg, name) => {
  if (!(await pg.evaluate(() => Boolean(window.axe)))) await pg.evaluate(AXE);
  const found = await pg.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.slice(0, 2).map((n) => n.target.flat().join(' ') + (n.any?.[0]?.message ? ': ' + n.any[0].message : '')).join(' | ')})`);
  });
  check(`${name}: no serious accessibility problems`, found.length === 0, found.join('; '));
};
const tooWide = (pg) => pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

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

  await page.reload();
  check('the welcome does not come back', (await page.locator('.web-welcome').count()) === 0);
  await page.goto(`${BASE}settings/`);
  await page.waitForTimeout(600);
  check('settings open in the web app', (await page.locator('#save, form, section').count()) > 0);
  await a11y(page, 'settings');
  await ctx.close();

  // ── phone ──
  const phone = await open({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  await phone.page.waitForSelector('.web-welcome', { timeout: 5000 });
  check('phone: the welcome fits the screen', !(await tooWide(phone.page)));
  await phone.page.click('.web-welcome [data-w="paste"]');
  check('phone: the panel fits the screen', !(await tooWide(phone.page)));
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
