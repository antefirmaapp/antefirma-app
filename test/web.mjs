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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { server, BASE, TEXT, READ_TEXT, calls, pushPlans, api } from './web-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

// The full Chromium, not the headless shell: the shell refuses notifications whatever the test grants.
const browser = await chromium.launch({ channel: 'chromium' });
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

  // The report: the same result on a page to print, save as a PDF or copy.
  await page.click('#report-open');
  await page.waitForSelector('#report:not([hidden])', { timeout: 8000 });
  const report = await page.evaluate(() => ({ path: location.pathname, text: document.querySelector('#report').innerText, closed: [...document.querySelectorAll('#body details')].filter((d) => !d.open).length }));
  check('the report opens in the web app with the same figures, every detail open', /report/.test(report.path) && /599[.,]76/.test(report.text) && report.closed === 0, `${report.path}, ${report.closed} closed`);
  await a11y(page, 'the report');
  await page.goBack();
  await page.waitForSelector('#paste-text', { timeout: 8000 });
  // Coming back, the panel is fresh: the same text is analysed again (from the cache).
  await page.fill('#paste-text', TEXT);
  await page.click('#run-paste');
  await page.waitForFunction(() => /599[.,]76/.test(document.getElementById('result')?.textContent || ''), null, { timeout: 10000 });

  // A photo of the contract: the server reads it, the text lands in the box and is analysed.
  await page.setInputFiles('#pdf-file', join(ROOT, 'test', 'fixtures', 'scan', 'page1.jpg'));
  await page.waitForFunction((text) => document.getElementById('paste-text').value === text, READ_TEXT, { timeout: 12000 }).catch(() => {});
  await page.waitForFunction(() => /599[.,]76/.test(document.getElementById('result')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  check('a photo is read by the server and analysed, in the web app too', calls.includes('/v1/read') && (await page.inputValue('#paste-text')) === READ_TEXT && /foto|photo/i.test(await page.textContent('#result')), `${calls.filter((c) => c === '/v1/read').length} reads · ${await page.textContent('#status')} · ${(await page.inputValue('#paste-text')).slice(0, 40)}`);

  // Recorded as a commitment: it appears in the Commitments tab with its deadline.
  await page.click('#track');
  await page.waitForTimeout(600);
  await page.click('#tab-btn-commitments');
  await page.waitForTimeout(600);
  const items = await page.locator('.c-item:not(.example)').count();
  check('the commitment is recorded and listed in the Commitments tab', items === 1, `${items} commitments`);
  check('…with its cancellation deadline', /2028/.test(await page.locator('.c-item:not(.example)').first().textContent()));
  await a11y(page, 'the Commitments tab');
  // The same screens in the dark theme.
  await page.emulateMedia({ colorScheme: 'dark' });
  await a11y(page, 'dark theme: the Commitments tab');
  await page.click('#tab-btn-analyze');
  await page.waitForTimeout(300);
  await a11y(page, 'dark theme: the verdict');
  await page.emulateMedia({ colorScheme: 'light' });

  await page.reload();
  check('the welcome does not come back', (await page.locator('.web-welcome').count()) === 0);
  await page.goto(`${BASE}settings/`);
  await page.waitForTimeout(600);
  check('settings open in the web app', (await page.locator('#save, form, section').count()) > 0);
  await a11y(page, 'settings');

  // ── reminders with the app closed (push) ──
  // The browser's push service is not reachable from a test: the subscription is
  // imitated, the rest is real — the settings, the server call, the service
  // worker woken by a push with no content.
  await ctx.grantPermissions(['notifications']);
  await ctx.addInitScript(() => {
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-address', unsubscribe: async () => { globalThis.__unsubscribed = true; return true; } };
    PushManager.prototype.getSubscription = async () => null;
    PushManager.prototype.subscribe = async function (o) { globalThis.__subscribeOptions = { visible: o.userVisibleOnly, key: o.applicationServerKey.length }; return sub; };
  });
  await page.reload();
  await page.waitForSelector('#push-row:not([hidden])', { timeout: 8000 });
  check('push: off until asked for, and nothing is sent', !(await page.isChecked('#pushReminders')) && pushPlans.length === 0);
  await page.check('#pushReminders');
  for (let i = 0; i < 60 && !pushPlans.length; i++) await page.waitForTimeout(100);
  const sentPlan = pushPlans[0] || {};
  check('push: switched on, the server gets a push address and the hours of the reminders',
    sentPlan.endpoint === 'https://fcm.googleapis.com/fcm/send/test-address' && sentPlan.times?.length === 3 && sentPlan.times.every((x) => /^20\d\d-/.test(x)), JSON.stringify(sentPlan).slice(0, 200));
  check('push: and nothing else — no seller, no amount, no keys', JSON.stringify(Object.keys(sentPlan).sort()) === '["endpoint","times"]' && !/Premium|19|120/.test(JSON.stringify(sentPlan.times)));
  check('push: the subscription is a visible one, with the server key', await page.evaluate(() => globalThis.__subscribeOptions?.visible === true && globalThis.__subscribeOptions.key === 65));
  const stored = await page.evaluate(() => globalThis.chrome.storage.local.get('pushPlan').then((x) => x.pushPlan));
  check('push: the text of each reminder stays in the browser', stored?.items?.length === 3 && stored.items.every((x) => x.title && x.message && x.url) && Boolean(stored.fallback?.title), JSON.stringify(stored?.items?.[0] || null).slice(0, 160));
  await a11y(page, 'settings with push reminders');

  // A wake-up from the server, with no content, delivered to the service worker.
  const cdp = await ctx.newCDPSession(page);
  const registrations = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => registrations.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  for (let i = 0; i < 40 && !registrations.length; i++) await page.waitForTimeout(100);
  const registrationId = registrations.find((r) => r.scopeURL.startsWith(BASE))?.registrationId;
  const wake = async () => { await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(BASE).origin, registrationId, data: '' }); await page.waitForTimeout(700); };
  const notifications = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag })));
  await wake();
  let seen = await notifications();
  check('push: woken with nothing due, it still says something, in the person\'s language', seen.length === 1 && seen[0].title === stored.fallback.title, JSON.stringify(seen));
  // The first reminder's day has come.
  await page.evaluate(async () => { const { pushPlan } = await globalThis.chrome.storage.local.get('pushPlan'); pushPlan.items[0].at = Date.now() - 1000; await globalThis.chrome.storage.local.set({ pushPlan }); });
  await wake();
  seen = await notifications();
  check('push: when a reminder is due, the notification is that reminder', seen.some((n) => n.tag === stored.items[0].tag && n.title === stored.items[0].title), JSON.stringify(seen));
  check('push: and it is marked as said', await page.evaluate(() => globalThis.chrome.storage.local.get('pushPlan').then((x) => x.pushPlan.items[0].shown === true)));

  // The app is opened after the service worker has already shown a reminder: it is not said twice.
  await ctx.addInitScript(() => {
    const Real = Notification;
    globalThis.Notification = class extends Real { constructor(title, o) { super(title, o); sessionStorage.setItem('pageNotifications', `${sessionStorage.getItem('pageNotifications') || ''}|${o?.tag}`); } };
  });
  await page.evaluate(async () => {
    const { commitments } = await globalThis.chrome.storage.local.get('commitments');
    const first = commitments[0].reminders.findIndex((r) => !r.fired);
    commitments[0].reminders[first].at = new Date(Date.now() - 60000).toISOString();
    await globalThis.chrome.storage.local.set({ commitments });
  });
  await page.goto(BASE);
  const firedNow = await page.waitForFunction(() => globalThis.chrome.storage.local.get('commitments').then((x) => x.commitments[0].reminders.some((r) => r.fired && Date.parse(r.at) > Date.now() - 3600000)), null, { timeout: 15000 }).then(() => true, () => false);
  check('push: opening the app afterwards counts the reminder as sent, without a second notification', firedNow && !(await page.evaluate(() => sessionStorage.getItem('pageNotifications') || '')).includes(stored.items[0].tag), await page.evaluate(() => sessionStorage.getItem('pageNotifications') || 'none'));
  await page.goto(`${BASE}settings/`);

  await ctx.addInitScript(() => { PushManager.prototype.getSubscription = async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test-address', unsubscribe: async () => { sessionStorage.setItem('unsubscribed', '1'); return true; } }); });
  await page.reload();
  await page.waitForSelector('#push-row:not([hidden])', { timeout: 8000 });
  const before = pushPlans.length;
  await page.uncheck('#pushReminders');
  for (let i = 0; i < 60 && pushPlans.length === before; i++) await page.waitForTimeout(100);
  const last = pushPlans[pushPlans.length - 1];
  check('push: switched off, the server is told to forget and the browser unsubscribes', pushPlans.length > before && last.endpoint === null && last.times.length === 0 && await page.evaluate(() => sessionStorage.getItem('unsubscribed') === '1'), JSON.stringify(last));
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
