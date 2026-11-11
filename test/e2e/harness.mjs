/* global chrome -- used inside sw.evaluate(), which runs in the extension */
/**
 * What every end-to-end check shares: the extension loaded in a real Chromium,
 * the demo pages served locally and a fake api.antefirma.app.
 *
 *     const h = await startStack();
 *     … h.check('name', ok) …
 *     await h.close();       // prints "n/m checks passed", returns the failures
 *
 * The fake server answers like the real one. By default (`fake.engine = 'keywords'`)
 * it reads the page text it receives and reports, with a real quote, the risk
 * sentences the demo pages use (renewal, minimum term, penalty, no refund,
 * arbitration, in it/en/es): so each demo page gets the verdict its own text
 * deserves, and a fair contract gets none. `fake.fixed` replaces that with a
 * fixed answer. `fake.mode` simulates failures: 'slow', 'timeout', 'network',
 * '500', 'malformed', '401-once', '401-always', 'quota'. Nothing leaves the machine.
 *
 * Requires Playwright with Chromium (`require('playwright')`).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** Risk sentences of the demo pages, as the model would quote them. */
const RULES = [
  ['auto_renewal', /(?:si rinnova (?:automaticamente|tacitamente)|renews automatically|se renueva autom[áa]ticamente)[^.\n]{0,60}|rinnovo automatico ogni \d+ mesi/i],
  ['minimum_term', /(?:durata minima (?:di )?\d+ mesi|minimum term of \d+ months|permanencia m[íi]nima de [a-zñ]+ meses)/i],
  ['early_termination_penalty', /(?:(?:è dovuta una )?penal(?:e|ità) (?:di|pari a|di recesso) (?:€ ?)?\d[\d.,]*(?: ?(?:€|euro))?|penalizaci[óo]n de \d[\d.,]* euros|fee of £\d[\d.,]*)/i],
  ['no_refund', /(?:non sono rimborsabili|nessun rimborso degli importi versati|non-refundable|no son reembolsables)[^.\n]{0,30}/i],
  ['arbitration', /devoluta ad arbitrato[^.\n]{0,20}/i],
];
export function keywordFindings(text, lang) {
  const out = [];
  for (const [category, re] of RULES) {
    const m = re.exec(text || '');
    if (m && m[0].trim().length >= 12) out.push({ category, quote: m[0].trim(), why: lang === 'en' ? 'English reason.' : lang === 'es' ? 'Motivo.' : 'Motivo.', confidence: 0.9 });
  }
  return out;
}

const EMPTY_TERMS = { price: null, currency: null, billing_period: null, minimum_term_months: null, notice_days: null, exit_fee: null, extra_fees: [] };

export async function startStack({ lang = 'it', locale = 'it-IT' } = {}) {
  const results = [];
  const errors = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${name}${detail ? ` — ${detail}` : ''}`);
    return Boolean(ok);
  };

  // The demo pages, served locally (plus anything a scenario adds to `pages`).
  const pages = {};
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.pdf': 'application/pdf' };
  const site = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (pages[path]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(pages[path]); return; }
    const f = join(ROOT, 'demo', path === '/' ? 'checkout.html' : path);
    if (!f.startsWith(join(ROOT, 'demo')) || !existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'text/plain' }).end(readFileSync(f));
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${site.address().port}/`;

  const fake = {
    engine: 'keywords', fixed: null, mode: 'ok', delay: 0, notice: null,
    analyzeCalls: 0, registerCalls: 0, lastLang: null, lastText: '', feedback: [], served401: 0,
    license: { plan: 'free', active: false, quota: { month: { limit: 5, remaining: 4 } } },
    quota: { plan: 'free', remaining: 4, month: { limit: 5, remaining: 4 } },
  };
  async function api(route) {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/v1/health') return json(200, { ok: true });
    if (path === '/v1/register') { fake.registerCalls += 1; return json(200, { token: `v1.fake-${fake.registerCalls}` }); }
    if (path === '/v1/analyze') {
      fake.analyzeCalls += 1;
      const body = JSON.parse(req.postData() || '{}');
      fake.lastLang = body.uiLang;
      fake.lastText = body.text || '';
      if (fake.mode === '401-always' || (fake.mode === '401-once' && fake.served401 === 0)) { fake.served401 += 1; return json(401, { error: 'auth', message: 'token' }); }
      if (fake.mode === 'network') return route.abort('connectionrefused');
      if (fake.mode === 'timeout') { await new Promise((r) => setTimeout(r, 17_000)); return route.abort('timedout').catch(() => {}); }
      if (fake.mode === 'slow' || fake.delay) await new Promise((r) => setTimeout(r, fake.delay || 5000));
      if (fake.mode === '500') return json(500, { error: 'upstream', message: 'boom' });
      if (fake.mode === 'malformed') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"findings": [ {"category": "auto_ren' });
      if (fake.mode === 'quota') return json(429, { error: 'quota_month', message: 'server' });
      const answer = fake.fixed || { findings: keywordFindings(fake.lastText, fake.lastLang), terms: EMPTY_TERMS, summary: '' };
      return json(200, { dropped: 0, truncated: false, model: 'fake', cached: false, quota: fake.quota, ...answer, notice: fake.notice });
    }
    if (path === '/v1/feedback') { fake.feedback.push(JSON.parse(req.postData() || '{}').category); return json(200, { ok: true }); }
    if (path === '/v1/license') return json(200, fake.license);
    if (path === '/v1/pro/checkout') return json(200, { claim: 'c'.repeat(32), url: `https://antefirma.app/pro/#c=${'c'.repeat(32)}&p=pro` });
    return json(404, { error: 'not_found' });
  }

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'af-profile-')), {
    headless: false,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--headless=new', '--no-sandbox', `--lang=${locale}`],
  });
  await context.route('https://api.antefirma.app/**', api);
  await context.route('https://antefirma.app/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>AnteFirma</title>' }));
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  const extId = new URL(sw.url()).host;
  const extUrl = (p) => `chrome-extension://${extId}/${p}`;

  /** A new tab that records its errors. */
  async function open(url, name = url) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('dialog', (d) => d.dismiss());
    if (url) await page.goto(url.startsWith('http') || url.startsWith('chrome') ? url : BASE + url.replace(/^\//, ''));
    return page;
  }

  /** Settings through the real settings page, as a person would. */
  async function settings({ uiLang = lang, consent = null } = {}) {
    const opt = await open(extUrl('src/options/options.html'), 'settings');
    await opt.waitForTimeout(700);
    await opt.selectOption('#uiLang', uiLang);
    await opt.click('#save');
    await opt.waitForTimeout(800);
    if (consent) await sw.evaluate(() => chrome.storage.local.get('settings').then(({ settings }) => chrome.storage.local.set({ settings: { ...settings, remoteConsentAt: new Date().toISOString() } })));
    return opt;
  }

  /** Empties the extension's verdict cache, from the settings page, as a person would. */
  async function clearCache() {
    const opt = await open(extUrl('src/options/options.html'), 'settings');
    await opt.waitForTimeout(500);
    await opt.click('#clear-cache');
    await opt.waitForTimeout(300);
    await opt.close();
  }

  const alert = (pg) => pg.locator('antefirma-alert');
  const shadow = (pg, sel) => pg.evaluate((s) => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector(s)?.textContent?.trim() || '', sel);
  const alertOpen = async (pg) => (await alert(pg).count()) > 0;

  async function a11y(pg, name, context = 'document') {
    if (!(await pg.evaluate(() => Boolean(window.axe)))) await pg.evaluate(AXE);
    const found = await pg.evaluate(async (sel) => {
      const r = await window.axe.run(sel === 'document' ? document : sel, { resultTypes: ['violations'] });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.nodes.slice(0, 2).map((n) => n.target.flat().join(' ')).join(' | ')})`);
    }, context);
    return check(`${name}: no serious accessibility problems`, found.length === 0, found.join('; '));
  }

  async function close() {
    check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
    site.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    return failed;
  }

  return { context, sw, extId, extUrl, BASE, pages, fake, check, results, errors, open, settings, clearCache, alert, shadow, alertOpen, a11y, close };
}
