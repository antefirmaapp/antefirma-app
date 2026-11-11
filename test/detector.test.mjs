/**
 * Which buttons are held, on realistic pages, in a real Chromium.
 *
 *   node --test test/detector.test.mjs        (needs Playwright; skipped without it)
 *
 * Every page in test/fixtures/pages/*.html has a .json next to it with the
 * expected outcome:
 *
 *   { "intercept": [{ "selector": "#buy", "type": "purchase", "how": "click" | "enter" }],
 *     "pass": ["#add-to-cart", …] }
 *
 * The real content scripts are loaded (as in the manifest) with a fake
 * `chrome.runtime` that answers the settings and records ANALYZE_ACTION without
 * ever answering it. Clicks are real (Playwright), so `isTrusted` holds. A click
 * counts as held when the page never received it and an analysis was asked with
 * that action type; as let through when the page received it and nothing was asked.
 * The page is reloaded before every element: after a hold the detector is busy.
 *
 * At the end it prints precision and recall on commitments (false positives:
 * harmless buttons held; false negatives: binding buttons let through) and the
 * share of content-script code the run executed (Chromium coverage).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'test', 'fixtures', 'pages');
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require('playwright')); } catch { /* not installed: skipped below */ }

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const SCRIPTS = manifest.content_scripts[0].js;
const CSS = manifest.content_scripts[0].css || [];

/** The fake extension: settings on request, analyses recorded and left pending. */
const FAKE_CHROME = `(() => {
  window.__af = { messages: [], reached: [] };
  const settings = { enabled: true, allowlist: [], uiLang: 'it', blockFrom: 'commitment' };
  window.chrome = {
    runtime: {
      id: 'test', getURL: (p) => '/' + p,
      sendMessage(msg) {
        window.__af.messages.push(JSON.parse(JSON.stringify({ type: msg.type, actionType: msg.payload?.actionType ?? null })));
        if (msg.type === 'GET_CONTENT_SETTINGS') return Promise.resolve({ ok: true, result: settings });
        if (msg.type === 'ANALYZE_ACTION') return new Promise(() => {});
        return Promise.resolve({ ok: true, result: null });
      },
      onMessage: { addListener() {} },
    },
    storage: { onChanged: { addListener() {} }, local: { get: async () => ({}) } },
  };
  // What the page itself would see. Bubbling on window comes after the
  // detector's capture on document: a held click never gets here.
  const note = (kind) => (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    window.__af.reached.push({ kind, id: t && t.id || null });
    e.preventDefault(); // keep the page where it is: no navigation, no real submit
  };
  window.addEventListener('click', note('click'));
  window.addEventListener('submit', note('submit'));
})();`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.startsWith('/pages/') ? join(PAGES, path.slice(7)) : join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    let body = readFileSync(file);
    if (file.endsWith('.html') && path.startsWith('/pages/')) {
      // The content scripts, as the manifest injects them: at document start, in order.
      const inject = `<script>${FAKE_CHROME}</script>${CSS.map((c) => `<link rel="stylesheet" href="/${c}">`).join('')}${SCRIPTS.map((s) => `<script src="/${s}"></script>`).join('')}`;
      body = Buffer.from(String(body).replace(/<head>/i, `<head>${inject}`));
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  }).listen(0);
  return server;
}

const pages = readdirSync(PAGES).filter((f) => f.endsWith('.html')).sort();

test('every fixture page has its expected outcome', () => {
  assert.ok(pages.length >= 25, `${pages.length} pages`);
  for (const p of pages) {
    const exp = JSON.parse(readFileSync(join(PAGES, p.replace(/\.html$/, '.json')), 'utf8'));
    assert.ok(Array.isArray(exp.intercept) && Array.isArray(exp.pass), p);
    assert.ok(exp.intercept.length + exp.pass.length > 0, `${p}: nothing to check`);
  }
});

test('the detector on realistic pages', { skip: !chromium && 'Playwright is not installed' }, async (t) => {
  const server = serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'it-IT' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.coverage.startJSCoverage({ resetOnNavigation: false });

  const tally = { tp: 0, fp: 0, fn: 0, tn: 0, wrongType: 0 };

  async function attempt(file, selector, how) {
    await page.goto(`${base}/pages/${file}`);
    await page.waitForFunction(() => window.__CF?.detector);
    await page.waitForTimeout(30); // the settings promise resolves
    const loc = page.locator(selector).first();
    if (how === 'enter') {
      await loc.focus();
      await page.keyboard.press('Enter');
    } else {
      await loc.click();
    }
    await page.waitForTimeout(60);
    return page.evaluate(() => ({
      analysis: window.__af.messages.find((m) => m.type === 'ANALYZE_ACTION') || null,
      reached: window.__af.reached.length > 0,
    }));
  }

  for (const file of pages) {
    const exp = JSON.parse(readFileSync(join(PAGES, file.replace(/\.html$/, '.json')), 'utf8'));
    await t.test(file, async () => {
      const problems = [];
      for (const { selector, type, how = 'click' } of exp.intercept) {
        const r = await attempt(file, selector, how);
        const held = r.analysis && !r.reached;
        if (!held) { tally.fn++; problems.push(`${selector} (${how}) should be held as ${type}, it went through`); continue; }
        if (r.analysis.actionType !== type) { tally.wrongType++; problems.push(`${selector}: held as ${r.analysis.actionType}, expected ${type}`); }
        tally.tp++;
      }
      for (const selector of exp.pass) {
        const r = await attempt(file, selector, 'click');
        if (r.analysis || !r.reached) { tally.fp++; problems.push(`${selector} should go through, it was held as ${r.analysis?.actionType}`); } else tally.tn++;
      }
      assert.deepEqual(problems, []);
    });
  }

  const cov = await page.coverage.stopJSCoverage();
  await browser.close();
  server.close();

  const precision = tally.tp / ((tally.tp + tally.fp) || 1);
  const recall = tally.tp / ((tally.tp + tally.fn) || 1);
  console.log(`\ndetector on ${pages.length} pages: precision ${(precision * 100).toFixed(1)}% · recall ${(recall * 100).toFixed(1)}%` +
    ` · held ${tally.tp}, wrongly held ${tally.fp}, let through ${tally.fn}, rightly let through ${tally.tn}, wrong type ${tally.wrongType}`);
  // Coverage of the content scripts: bytes of each file inside executed ranges.
  const lines = [];
  for (const s of SCRIPTS.filter((x) => x.startsWith('src/content/'))) {
    const entries = cov.filter((e) => e.url.endsWith(`/${s}`));
    if (!entries.length) continue;
    const src = entries[0].source || '';
    const covered = new Uint8Array(src.length);
    for (const e of entries) {
      for (const fn of e.functions) {
        for (const r of fn.ranges) covered.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
      }
    }
    const share = covered.reduce((a, b) => a + b, 0) / (src.length || 1);
    lines.push(`${s.replace('src/content/', '')} ${(share * 100).toFixed(0)}%`);
  }
  console.log(`content scripts executed (bytes): ${lines.join(' · ')}`);
  assert.deepEqual(errors, [], 'JavaScript errors on the pages');
});
