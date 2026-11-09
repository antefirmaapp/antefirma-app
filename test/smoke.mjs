/**
 * Prova end-to-end: carica davvero l'estensione in Chromium, apre la pagina
 * demo e segue il flusso con il server. Il server di AnteFirma è finto (le
 * richieste ad api.antefirma.app sono intercettate), così la prova non spende
 * analisi e non dipende dalla rete.
 *
 *     node test/smoke.mjs
 *
 * Serve a vedere ciò che i test unitari non vedono: manifest malformato,
 * service worker che non parte, content script che non si aggancia, errori
 * negli script che girano solo nel browser, testi rimasti in italiano.
 *
 * Richiede Playwright con Chromium (`require('playwright')`).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
/** Con SHOTS=cartella salva anche le schermate dei passaggi principali. */
const alert = (pg) => pg.locator('antefirma-alert');
const shot = (pg, name) => (process.env.SHOTS ? pg.screenshot({ path: join(process.env.SHOTS, `${name}.png`) }) : null);
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// La pagina demo, servita in locale.
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.pdf': 'application/pdf' };
const site = createServer((req, res) => {
  const f = join(ROOT, 'demo', req.url === '/' ? 'checkout.html' : req.url.split('?')[0]);
  if (!existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'text/plain' }).end(readFileSync(f));
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${site.address().port}/`;

// Il server finto: risposte come quelle vere, con le frasi della pagina demo.
const fake = { mode: 'ok', analyzeCalls: 0, lastLang: null, feedback: [] };
const VERDICT = {
  findings: [
    { category: 'auto_renewal', quote: 'Alla scadenza il contratto si rinnova automaticamente per un uguale', why: 'x', confidence: 0.9 },
    { category: 'early_termination_penalty', quote: 'In caso di recesso anticipato è dovuta una penale di € 120,00', why: 'x', confidence: 0.9 },
  ],
  terms: {
    price: { value: 19.99, quote: '€ 19,99' }, currency: { value: 'EUR' }, billing_period: { value: 'month' },
    minimum_term_months: { value: 24, quote: 'durata minima di 24 mesi' }, notice_days: { value: 60, quote: 'preavviso di almeno 60 giorni' },
    exit_fee: { value: 120, quote: 'penale di € 120,00' }, extra_fees: [],
  },
  summary: '', dropped: 0, truncated: false, model: 'finto', cached: false,
  quota: { plan: 'free', remaining: 4, month: { limit: 5, remaining: 4 } },
};
async function api(route) {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/v1/health') return json(200, { ok: true });
  if (path === '/v1/register') return json(200, { token: 'v1.finto' });
  if (path === '/v1/analyze') {
    fake.analyzeCalls += 1;
    fake.lastLang = JSON.parse(req.postData() || '{}').uiLang;
    if (fake.mode === 'quota') return json(429, { error: 'quota_month', message: 'server' });
    return json(200, { ...VERDICT, findings: VERDICT.findings.map((f) => ({ ...f, why: fake.lastLang === 'en' ? 'English reason.' : 'Motivo.' })) });
  }
  if (path === '/v1/feedback') { fake.feedback.push(JSON.parse(req.postData() || '{}').category); return json(200, { ok: true }); }
  if (path === '/v1/license') return json(200, { plan: 'free', active: false, quota: { month: { limit: 5, remaining: 3 } } });
  if (path === '/v1/pro/checkout') return json(200, { claim: 'c'.repeat(32), url: `https://antefirma.app/pro/#c=${'c'.repeat(32)}&p=pro` });
  return json(404, { error: 'not_found' });
}

const errors = [];
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'af-profile-')), {
  headless: false,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--headless=new', '--no-sandbox', '--lang=it-IT'],
});
await context.route('https://api.antefirma.app/**', api);
await context.route('https://antefirma.app/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Pro</title>' }));

try {
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  check('il service worker si avvia', Boolean(sw));
  const extId = new URL(sw.url()).host;

  // Si parte dall'italiano, qualunque sia la lingua del browser di prova.
  const opt = await context.newPage();
  opt.on('pageerror', (e) => errors.push(`impostazioni: ${e.message}`));
  await opt.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opt.waitForTimeout(800);
  await opt.selectOption('#uiLang', 'it');
  await opt.click('#save');
  await opt.waitForTimeout(1200);

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pagina: ${e.message}`));
  page.on('dialog', (d) => d.dismiss());
  await page.goto(BASE);
  await page.waitForTimeout(1000);

  // Il pulsante innocuo non si ferma.
  await page.click('text=Iscriviti alla newsletter');
  await page.waitForTimeout(400);
  check('il pulsante innocuo non viene intercettato', (await alert(page).count()) === 0);

  // Il click che impegna: consenso, poi il verdetto.
  await page.click('button.cta');
  await page.waitForSelector('antefirma-alert', { state: 'attached', timeout: 10000 });
  check('il click su «Conferma abbonamento» viene intercettato', true);
  const shadow = (sel) => page.evaluate((s) => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector(s)?.textContent || '', sel);
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-consent="accept"]'), null, { timeout: 8000 });
  check('alla prima analisi chiede il consenso', (await shadow('h1')).includes('Posso leggere'));
  // Il consenso accetta solo click veri: si clicca come la persona.
  await alert(page).locator('[data-consent="accept"]').click();
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.cost .amount'), null, { timeout: 10000 });
  const cost = await shadow('.cost .amount');
  check('il costo potenziale è calcolato', /599,76|599.76/.test(cost.replace(/\s/g, '')), cost);
  check('l’avviso dice quante analisi gratuite restano', (await shadow('.provenance')).includes('ti restano 4 analisi gratuite'));
  const box = await page.evaluate(() => { const r = document.querySelector('antefirma-alert').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('l’avviso copre la pagina', box.w > 300 && box.h > 300);
  await alert(page).locator('[data-feedback]').first().click();
  await page.waitForTimeout(500);
  check('«Avviso sbagliato?» manda solo la categoria', fake.feedback.length === 1 && /^[a-z_]+$/.test(fake.feedback[0]) && (await shadow('[data-feedback]')).includes('Grazie'), fake.feedback.join(','));
  await page.waitForTimeout(3200); // «Continua comunque» si arma dopo un attimo
  await alert(page).locator('[data-act="proceed"]').click();
  await page.waitForTimeout(500);
  check('«Continua comunque» esegue l’azione sospesa', await page.evaluate(() => window.__demoSubmitted === true));
  check('l’avviso si chiude dopo la decisione', (await alert(page).count()) === 0);

  // Analisi del mese finite: il pulsante per passare a Pro apre il pagamento.
  // La cache locale ricorderebbe il verdetto di prima: si svuota.
  fake.mode = 'quota';
  await opt.click('#clear-cache');
  await page.bringToFront();
  await page.reload();
  await page.waitForTimeout(800);
  await page.click('button.cta');
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-upgrade]'), null, { timeout: 10000 });
  check('a analisi finite compare «Passa a Pro»', true);
  await shot(page, 'passa-a-pro');
  const [tab] = await Promise.all([
    context.waitForEvent('page', { timeout: 8000 }),
    alert(page).locator('[data-upgrade]').click(),
  ]);
  await tab.waitForLoadState().catch(() => {});
  check('«Passa a Pro» apre il pagamento legato a questo browser', /antefirma\.app\/pro\/#c=c{32}&p=pro/.test(tab.url()), tab.url());
  await tab.close();
  await alert(page).locator('[data-act="cancel"]').click();

  // Le impostazioni, in spagnolo.
  await opt.bringToFront();
  await opt.selectOption('#uiLang', 'es');
  await opt.click('#save');
  await opt.waitForTimeout(1500);
  await shot(opt, 'impostazioni-es');
  check('le impostazioni passano allo spagnolo', (await opt.textContent('#piano h2')) === 'Plan' && (await opt.textContent('#save')) === 'Guardar');
  check('il piano si legge in spagnolo', (await opt.textContent('#plan-summary')).includes('Plan gratuito'));

  // L'avviso in inglese.
  await opt.selectOption('#uiLang', 'en');
  await opt.click('#save');
  await opt.waitForTimeout(1500);
  fake.mode = 'ok';
  await opt.click('#clear-cache');
  await page.bringToFront();
  await page.reload();
  await page.waitForTimeout(1000);
  await page.click('button.cta');
  await page.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.cost'), null, { timeout: 10000 });
  await page.waitForTimeout(600);
  await shot(page, 'avviso-en');
  check('l’avviso è in inglese', (await shadow('.cancel')) === 'Go back' && (await shadow('.cost .caption')).includes('estimated potential'));
  check('al server si chiede l’analisi in inglese', fake.lastLang === 'en');
  check('la cronologia del verdetto è in inglese', (await shadow('.timeline')).includes('Now'));
  await alert(page).locator('[data-act="cancel"]').click();

  // Il pannello laterale, aperto come pagina.
  const panel = await context.newPage();
  panel.on('pageerror', (e) => errors.push(`pannello: ${e.message}`));
  await panel.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`);
  await panel.waitForTimeout(800);
  check('il pannello laterale è in inglese', (await panel.textContent('#tab-btn-commitments')).trim() === 'Commitments');
} catch (err) {
  check('la prova arriva in fondo', false, err.message);
} finally {
  check('nessun errore JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
  site.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} controlli superati`);
process.exit(failed ? 1 : 0);
