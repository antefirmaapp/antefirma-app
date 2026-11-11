/**
 * End-to-end check: really loads the extension in Chromium, opens the demo page
 * and follows the main path with the server. The AnteFirma server is fake
 * (test/e2e/harness.mjs), so the check spends no analyses and doesn't depend on
 * the network. The other paths (every demo page, server failures, tokens, SPA,
 * iframes, synthetic clicks, the web app) are in test/e2e/.
 *
 *     node test/smoke.mjs
 *
 * It catches what unit tests can't see: a malformed manifest, a service worker
 * that doesn't start, a content script that doesn't attach, errors in scripts
 * that only run in the browser, texts left untranslated.
 *
 * Requires Playwright with Chromium (`require('playwright')`).
 */
import { join } from 'node:path';
import { startStack } from './e2e/harness.mjs';

/** With SHOTS=folder it also saves screenshots of the main steps. */
const shot = (pg, name) => (process.env.SHOTS ? pg.screenshot({ path: join(process.env.SHOTS, `${name}.png`) }) : null);

const h = await startStack();
const { context, extId, fake, check, a11y, alert, errors } = h;
const BASE = h.BASE;
// A fixed answer with the demo page's sentences, so the cost is known: €19.99 × 24 + €120.
fake.fixed = {
  findings: [
    { category: 'auto_renewal', quote: 'Alla scadenza il contratto si rinnova automaticamente per un uguale', why: 'Motivo.', confidence: 0.9 },
    { category: 'early_termination_penalty', quote: 'In caso di recesso anticipato è dovuta una penale di € 120,00', why: 'Motivo.', confidence: 0.9 },
  ],
  terms: {
    price: { value: 19.99, quote: '€ 19,99' }, currency: { value: 'EUR' }, billing_period: { value: 'month' },
    minimum_term_months: { value: 24, quote: 'durata minima di 24 mesi' }, notice_days: { value: 60, quote: 'preavviso di almeno 60 giorni' },
    exit_fee: { value: 120, quote: 'penale di € 120,00' }, extra_fees: [],
  },
  summary: '',
};

try {
  check('the service worker starts', Boolean(h.sw));

  // Start from Italian, whatever the test browser's language.
  const opt = await context.newPage();
  opt.on('pageerror', (e) => errors.push(`settings: ${e.message}`));
  await opt.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opt.waitForTimeout(800);
  await opt.selectOption('#uiLang', 'it');
  await opt.click('#save');
  await opt.waitForTimeout(1200);

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('dialog', (d) => d.dismiss());
  await page.goto(BASE);
  await page.waitForTimeout(1000);

  // The harmless button doesn't stop.
  await page.click('text=Iscriviti alla newsletter');
  await page.waitForTimeout(400);
  check('the harmless button is not intercepted', (await alert(page).count()) === 0);

  // The binding click: consent, then the verdict.
  await page.click('button.cta');
  await page.waitForSelector('antefirma-alert', { state: 'attached', timeout: 10000 });
  check('the click on "Conferma abbonamento" is intercepted', true);
  const shadow = (sel) => page.evaluate((s) => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector(s)?.textContent || '', sel);
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-consent="accept"]'), null, { timeout: 8000 });
  check('the first analysis asks for consent', (await shadow('h1')).includes('Posso leggere'));
  // Consent only accepts real clicks: click like the person.
  await alert(page).locator('[data-consent="accept"]').click();
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.tile.strong .tvalue'), null, { timeout: 10000 });
  const cost = await shadow('.tile.strong .tvalue');
  check('the potential cost is computed', /599,76|599.76/.test(cost.replace(/\s/g, '')), cost);
  check('the warning says how many free analyses are left', (await shadow('.provenance')).includes('ti restano 4 analisi gratuite'));
  const box = await page.evaluate(() => { const r = document.querySelector('antefirma-alert').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('the warning covers the page', box.w > 300 && box.h > 300);
  await a11y(page, 'the warning', 'antefirma-alert');
  await a11y(opt, 'settings');
  check('settings show the installation code', /^[0-9a-f-]{36}$/.test(await opt.textContent('#install-id')));
  await alert(page).locator('details.why > summary').click(); // "Why?": clauses and exact sentences
  await alert(page).locator('[data-feedback]').first().click();
  await page.waitForTimeout(500);
  check('"Wrong warning?" sends only the category', fake.feedback.length === 1 && /^[a-z_]+$/.test(fake.feedback[0]) && (await shadow('[data-feedback]')).includes('Grazie'), fake.feedback.join(','));
  check('the three answers: cost, deadline, way out', (await shadow('.tiles')).includes('2028') && (await shadow('.tiles')).includes('120'));
  check('no technical scores in the warning', !/\/100|Verdetto da/.test(await shadow('.card')));
  await page.waitForTimeout(3200); // the button arms after a moment
  await alert(page).locator('[data-act="track"]').click();
  await page.waitForTimeout(500);
  check('"Continue and remind me to cancel" performs the held action', await page.evaluate(() => window.__demoSubmitted === true));
  check('the warning closes after the decision', (await alert(page).count()) === 0);

  // This month's analyses are used up: the Pro button opens the payment.
  // The local cache would remember the earlier verdict: clear it.
  fake.mode = 'quota';
  await opt.click('#clear-cache');
  await page.bringToFront();
  await page.reload();
  await page.waitForTimeout(800);
  await page.click('button.cta');
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-upgrade]'), null, { timeout: 10000 });
  check('with analyses used up "Upgrade to Pro" appears', true);
  await shot(page, 'passa-a-pro');
  const [tab] = await Promise.all([
    context.waitForEvent('page', { timeout: 8000 }),
    alert(page).locator('[data-upgrade]').click(),
  ]);
  await tab.waitForLoadState().catch(() => {});
  check('"Upgrade to Pro" opens the payment linked to this browser', /antefirma\.app\/pro\/#c=c{32}&p=pro/.test(tab.url()), tab.url());
  await tab.close();
  await alert(page).locator('[data-act="cancel"]').click();

  // Settings, in Spanish.
  await opt.bringToFront();
  await opt.selectOption('#uiLang', 'es');
  await opt.click('#save');
  await opt.waitForTimeout(1500);
  await shot(opt, 'impostazioni-es');
  check('settings switch to Spanish', (await opt.textContent('#piano h2')).replace(/\s*\?$/, '') === 'Plan' && /ayuda\/planes-y-clave/.test(await opt.getAttribute('#piano .help-q', 'href')) && (await opt.textContent('#save')) === 'Guardar');
  check('the plan reads in Spanish', (await opt.textContent('#plan-summary')).includes('Plan gratuito'));

  // The warning in English.
  await opt.selectOption('#uiLang', 'en');
  await opt.click('#save');
  await opt.waitForTimeout(1500);
  fake.mode = 'ok';
  fake.delay = 2500;
  fake.notice = { it: 'Manutenzione stasera', en: 'Maintenance tonight', es: 'Mantenimiento esta noche', level: 'warn' };
  await opt.click('#clear-cache');
  await page.bringToFront();
  await page.reload();
  await page.waitForTimeout(1000);
  await page.click('button.cta');
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.skel'), null, { timeout: 5000 });
  check('while waiting: page price and "Continue without waiting"', (await shadow('.body')).includes('€') && (await shadow('footer')).includes('Continue without waiting'));
  await shot(page, 'attesa-en');
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.tiles .tvalue'), null, { timeout: 10000 });
  await page.waitForTimeout(600);
  await shot(page, 'avviso-en');
  check('the warning is in English', (await shadow('.cancel')) === 'Go back' && (await shadow('.tlabel')).includes('What you really pay'));
  check('the server is asked for the analysis in English', fake.lastLang === 'en');
  check('the message to users appears in the right language', (await shadow('.notice')) === 'Maintenance tonight');
  check('the verdict timeline is in English', (await shadow('.timeline')).includes('Now'));
  await alert(page).locator('[data-act="cancel"]').click();

  // The side panel, opened as a page.
  const panel = await context.newPage();
  panel.on('pageerror', (e) => errors.push(`panel: ${e.message}`));
  await panel.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`);
  await panel.waitForTimeout(800);
  check('the side panel is in English', (await panel.textContent('#tab-btn-commitments')).trim() === 'Commitments');
  await panel.click('#tab-btn-commitments');
  await panel.waitForTimeout(800);
  check('the commitment is recorded with its deadline', (await panel.locator('.c-item:not(.example)').count()) === 1);
  await a11y(panel, 'the side panel with a commitment');
  // The welcome page
  const wel = await context.newPage();
  wel.on('pageerror', (e) => errors.push(`welcome: ${e.message}`));
  await wel.goto(`chrome-extension://${extId}/src/welcome/welcome.html`);
  await wel.waitForTimeout(800);
  check('the welcome page opens translated and with consent already given', (await wel.textContent('h1')) === 'Welcome to AnteFirma' && await wel.isVisible('#granted'));
  await shot(wel, 'benvenuto-en');
  await a11y(wel, 'the welcome page');
} catch (err) {
  check('the run reaches the end', false, err.message);
}

const failed = await h.close();
process.exit(failed.length ? 1 : 0);
