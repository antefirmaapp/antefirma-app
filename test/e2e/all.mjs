/* global chrome -- used inside sw.evaluate(), which runs in the extension */
/**
 * The end-to-end scenarios beyond the main path (test/smoke.mjs), each on a
 * fresh browser profile with the fake server of harness.mjs.
 *
 *     xvfb-run -a node test/e2e/all.mjs           every scenario
 *     ONLY=failures node test/e2e/all.mjs         one scenario
 *
 *  1. demo        every demo page behaves as demo/index.html declares
 *  2. failures    slow server and "Continue without waiting"; timeout, network error,
 *                 500, malformed JSON: "the server didn't answer", never "all fine"
 *  3. tokens      401 → new token → one retry; 401 again → clear error, no loop
 *  4. plans       analyses used up and "Upgrade to Pro"; an active licence
 *     report     the analysis report, opened from the panel and from the warning
 *     compare    two contracts side by side, from the panel
 *     photos     photos and a scanned PDF: read by the server, then analysed;
 *                consent first; no text, limits, a file that is not a document
 *  5. pages       SPA buttons created late and recreated; fast double click;
 *                 checkout inside an iframe; form sent with Enter
 *  6. decisions   "Go back" does not perform the action; "Continue" performs it once
 *  7. synthetic   a page script cannot press "Yes, analyse" (isTrusted)
 *  8. a11y        axe-core on warning, panel, settings and welcome in it/en/es, light and
 *                 dark; the warning by keyboard: it takes focus, Tab stays inside, Esc = "Go back"
 * The web app has its own check (test/web.mjs).
 */
import { startStack, ROOT } from './harness.mjs';
import { join } from 'node:path';
import { LANGS } from '../../src/core/languages.js';

// .provenance exists only in a verdict: the waiting card also has .tiles.
const verdictShown = (pg) => pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.provenance'), null, { timeout: 12000 }).then(() => true, () => false);
const errorShown = (pg, timeout = 12000) => pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.error'), null, { timeout }).then(() => true, () => false);
const alertGone = (pg, timeout = 12000) => pg.waitForFunction(() => !document.querySelector('antefirma-alert'), null, { timeout }).then(() => true, () => false);
const act = (h, pg, what) => h.alert(pg).locator(`[data-act="${what}"]`).first().click();
/** Counts clicks the page itself receives on an element (after the detector, if it lets them through). */
const countClicks = (pg, sel) => pg.evaluate((s) => { window.__clicks = 0; document.querySelector(s).addEventListener('click', () => { window.__clicks += 1; }); }, sel);
const clicks = (pg) => pg.evaluate(() => window.__clicks);
const armed = (pg) => pg.waitForTimeout(3300); // "Continue" arms after a moment

const SCENARIOS = {
  async demo(h) {
    await h.settings({ consent: true });
    const PAGES = [
      ['checkout.html', 'button.cta', true, ['text=Iscriviti alla newsletter']],
      ['riepilogo.html', 'button.cta', true, []],
      ['promo.html', 'button.cta', true, []],
      ['onesto.html', 'button.cta', false, []],
      ['tastiera.html', 'button.cta', true, []],
      ['generico.html', 'button.cta >> nth=0', true, ['button.plain']],
      ['es.html', 'button.cta', true, ['text=Rechazar todas las cookies']],
      ['en.html', 'button.cta', true, []],
    ];
    for (const [file, button, blocks, inert] of PAGES) {
      const pg = await h.open(file, file);
      await pg.waitForTimeout(600);
      for (const sel of inert) {
        await pg.click(sel);
        await pg.waitForTimeout(400);
        h.check(`${file}: "${sel}" is not intercepted`, !(await h.alertOpen(pg)));
      }
      await pg.click(button);
      if (blocks) {
        h.check(`${file}: blocks with a verdict`, await verdictShown(pg), `found ${JSON.stringify(h.fake.lastText.length)} characters`);
        await act(h, pg, 'cancel');
      } else {
        const gone = await alertGone(pg);
        await pg.waitForTimeout(400);
        const outcome = await pg.evaluate(() => document.querySelector('.outcome')?.textContent || '');
        h.check(`${file}: does not block, and the action goes through`, gone && outcome.length > 0, outcome);
      }
      await pg.close();
    }
    // The terms behind the checkout's link are read too: arbitration is written only there.
    h.fake.lastText = '';
    const co = await h.open('checkout.html', 'checkout');
    await h.clearCache();
    await co.bringToFront();
    await co.waitForTimeout(500);
    await co.click('button.cta');
    await verdictShown(co);
    h.check('termini.html: the linked terms document is read and sent with the page', /arbitrato rituale/.test(h.fake.lastText), h.fake.lastText.slice(-120));
    await act(h, co, 'cancel');
    // The PDF contract, dropped in the side panel.
    const panel = await h.open(h.extUrl('src/sidepanel/sidepanel.html'), 'panel');
    await panel.waitForTimeout(700);
    await panel.setInputFiles('#pdf-file', join(ROOT, 'demo', 'contratto.pdf'));
    const read = await panel.waitForFunction(() => document.querySelector('#result')?.textContent.length > 50, null, { timeout: 12000 }).then(() => true, () => false);
    h.check('contratto.pdf: the side panel reads it and shows the result', read && /ventiquattro/i.test(h.fake.lastText), h.fake.lastText.slice(0, 80));
  },

  async failures(h) {
    await h.settings({ consent: true });
    const pg = await h.open('checkout.html', 'checkout');
    await pg.waitForTimeout(600);
    // Slow server: the waiting card, and "Continue without waiting" lets the action through.
    h.fake.mode = 'slow'; h.fake.delay = 5000;
    await pg.click('button.cta');
    await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.skel'), null, { timeout: 4000 });
    h.check('slow server: the waiting card appears', true);
    await h.alert(pg).locator('[data-act="proceed"]').click();
    await pg.waitForTimeout(800);
    h.check('"Continue without waiting" performs the action', await pg.evaluate(() => window.__demoSubmitted === true));
    h.fake.delay = 0;
    // The slow analysis is still on its way: when it lands, the extension caches
    // its verdict. Let it land now, or it would land after one of the cache
    // clean-ups below and the next failure would be answered from the cache.
    for (let i = 0; i < 80 && h.fake.pending > 0; i++) await pg.waitForTimeout(100);
    await pg.waitForTimeout(300);
    h.check('the slow analysis has finished before the failures start', h.fake.pending === 0);
    for (const mode of ['500', 'malformed', 'network', 'timeout']) {
      h.fake.mode = mode;
      await h.clearCache();
      await pg.bringToFront();
      await pg.goto(h.BASE + 'checkout.html');
      await pg.waitForTimeout(500);
      await pg.click('button.cta');
      const err = await errorShown(pg, mode === 'timeout' ? 25000 : 12000);
      const tiles = await pg.evaluate(() => Boolean(document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('.provenance')));
      const toast = await pg.evaluate(() => Boolean(document.querySelector('vincolo-nota, antefirma-note')));
      h.check(`server ${mode}: says the check failed, never "all fine"`, err && !tiles && !toast, `error card ${err}, verdict ${tiles}, toast ${toast}`);
      await act(h, pg, 'cancel');
      h.check(`server ${mode}: "Go back" leaves the action undone`, await pg.evaluate(() => window.__demoSubmitted !== true));
    }
  },

  async tokens(h) {
    await h.settings({ consent: true });
    const pg = await h.open('checkout.html', 'checkout');
    await pg.waitForTimeout(600);
    h.fake.mode = '401-once';
    const reg0 = h.fake.registerCalls, an0 = h.fake.analyzeCalls;
    await pg.click('button.cta');
    const ok = await verdictShown(pg);
    h.check('401 → a new token and one retry → the verdict', ok && h.fake.registerCalls === reg0 + 1 && h.fake.analyzeCalls === an0 + 2,
      `register +${h.fake.registerCalls - reg0}, analyze +${h.fake.analyzeCalls - an0}`);
    await act(h, pg, 'cancel');
    h.fake.mode = '401-always';
    await h.clearCache();
    await pg.bringToFront();
    await pg.goto(h.BASE + 'checkout.html?again');
    await pg.waitForTimeout(500);
    const an1 = h.fake.analyzeCalls;
    await pg.click('button.cta');
    const err = await errorShown(pg);
    await pg.waitForTimeout(3000);
    h.check('401 twice → a clear error, and no loop of requests', err && h.fake.analyzeCalls - an1 === 2, `analyze +${h.fake.analyzeCalls - an1}`);
    await act(h, pg, 'cancel');
  },

  async plans(h) {
    const opt = await h.settings({ consent: true });
    const pg = await h.open('checkout.html', 'checkout');
    await pg.waitForTimeout(600);
    h.fake.mode = 'quota';
    await pg.click('button.cta');
    const up = await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-upgrade]'), null, { timeout: 10000 }).then(() => true, () => false);
    h.check('analyses used up: "Upgrade to Pro" in the warning', up);
    await act(h, pg, 'cancel');
    h.fake.mode = 'ok';
    h.fake.license = { plan: 'pro', active: true, status: 'active', periodEnd: '2027-12-01T00:00:00Z', quota: { month: { limit: 50, remaining: 48 }, day: { limit: 15, remaining: 14 } } };
    await opt.reload();
    await opt.waitForTimeout(1200);
    const summary = await opt.textContent('#plan-summary');
    h.check('an active licence shows as Pro in settings', /Pro/.test(summary) && !/gratuito/i.test(summary), summary.trim().slice(0, 80));
  },

  // Before Pro is on sale: "Pro coming soon" and the waiting list in place of the payment,
  // then, once sales open, one notification and the plans back.
  async sales(h) {
    h.fake.sales = false;
    h.fake.license = { plan: 'free', active: false, sales: false, quota: { month: { limit: 5, remaining: 4 } } };
    const opt = await h.settings({ consent: true });
    await opt.reload();
    await opt.waitForTimeout(1200);
    const soon = await opt.isVisible('#plan-soon');
    const buy = await opt.isVisible('#plan-buy');
    h.check('sales closed: settings offer "tell me when Pro arrives", no payment', soon && !buy);
    await opt.locator('#wait-pro + span').click();
    await opt.waitForTimeout(800);
    h.check('the switch joins the waiting list, with no address', h.fake.waitlist.at(-1) === true && (await opt.textContent('#plan-status')).length > 0, JSON.stringify(h.fake.waitlist));

    const pg = await h.open('checkout.html', 'checkout');
    await pg.waitForTimeout(600);
    h.fake.mode = 'quota';
    await pg.click('button.cta');
    await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-upgrade][data-wait="1"]'), null, { timeout: 10000 }).catch(() => {});
    const label = await h.shadow(pg, '[data-upgrade]');
    h.check('analyses used up with sales closed: the warning offers the waiting list, not the payment', label && !/Pro ·/.test(label) && Boolean(await pg.evaluate(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-wait="1"]'))), label);
    const before = h.fake.waitlist.length;
    await h.alert(pg).locator('[data-upgrade]').click();
    await pg.waitForTimeout(800);
    h.check('…and its button joins the list too', h.fake.waitlist.length === before + 1 && (await h.shadow(pg, '.upsell-note')).length > 0);
    await act(h, pg, 'cancel');
    h.fake.mode = 'ok';

    // Sales open: the next answer says so, the person is told once, the plans come back.
    h.fake.sales = true;
    h.fake.license = { ...h.fake.license, sales: true };
    await opt.reload();
    await opt.waitForTimeout(1500);
    const waiting = await h.sw.evaluate(() => chrome.storage.local.get('waitPro').then((g) => g.waitPro));
    h.check('sales open: waiting cleared after the notice, plans visible again', waiting === false && await opt.isVisible('#plan-buy') && !(await opt.isVisible('#plan-soon')));
    h.fake.license = { plan: 'free', active: false, sales: true, quota: { month: { limit: 5, remaining: 4 } } };
  },

  // A "Subscribe" button in an iframe no bigger than itself, from another origin (a
  // newspaper's paywall widget): the warning opens on the top page, full size, and
  // the decision goes back to the frame.
  async smallFrame(h) {
    await h.settings({ consent: true });
    const other = h.BASE.replace('127.0.0.1', 'localhost');
    h.pages['/widget.html'] = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Widget</title>
      <style>body{margin:0;overflow:hidden} p{position:absolute;left:-9999px}</style></head><body>
      <p>Abbonamento digitale a 9,99 € al mese. L'abbonamento si rinnova automaticamente ogni mese. Penale di recesso anticipato di 50 euro. Disdetta con preavviso di 30 giorni.</p>
      <button id="sub" style="width:300px;height:60px">Abbonati ora</button>
      <script>window.__subs = 0; document.getElementById('sub').addEventListener('click', () => { window.__subs += 1; });</script></body></html>`;
    h.pages['/news.html'] = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Giornale</title></head><body>
      <h1>Il giornale</h1><nav>Politica · Esteri · Cronache</nav>
      <iframe id="w" src="${other}widget.html" style="width:320px;height:70px;border:0"></iframe></body></html>`;
    const pg = await h.open('news.html', 'small frame');
    await pg.waitForTimeout(1500);
    const widget = () => pg.frames().find((f) => f.url().endsWith('/widget.html'));
    await pg.frameLocator('#w').locator('#sub').click();
    const onTop = await verdictShown(pg);
    const inFrame = await widget()?.evaluate(() => Boolean(document.querySelector('antefirma-alert')));
    h.check('a button in a frame as small as itself: the warning opens on the top page, not in the frame', onTop && inFrame === false, `top ${onTop}, frame ${inFrame}`);
    const size = await pg.evaluate(() => { const c = document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('dialog, .card'); const r = c?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null; });
    h.check('…at full size', size && size[0] > 320 && size[1] > 200, JSON.stringify(size));
    await act(h, pg, 'cancel');
    await pg.waitForTimeout(700);
    h.check('"Go back" on the top page: the click in the frame does not happen', (await widget().evaluate(() => window.__subs)) === 0 && !(await pg.evaluate(() => Boolean(document.querySelector('antefirma-alert')))));

    await pg.frameLocator('#w').locator('#sub').click();
    await verdictShown(pg);
    await pg.waitForTimeout(3300); // the button arms after a moment
    await act(h, pg, 'proceed');
    await pg.waitForTimeout(900);
    h.check('"Continue" on the top page: the click happens in the frame, once', (await widget().evaluate(() => window.__subs)) === 1);
  },

  async pages(h) {
    await h.settings({ consent: true });
    // A single-page app: the button appears after loading, and again after a route change.
    h.pages['/spa.html'] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SPA</title></head><body><div id="app">Loading…</div>
      <script>
        const render = (route) => { document.getElementById('app').innerHTML = route === 'plans'
          ? '<p>Premium £9.99/month. The subscription renews automatically for an equal period unless cancelled.</p><button id="sub">Subscribe now</button>'
          : '<p>Home</p><a id="go" href="/plans">See plans</a>'; };
        setTimeout(() => render('home'), 400);
        document.addEventListener('click', (e) => { if (e.target.id === 'go') { e.preventDefault(); history.pushState({}, '', '/plans'); setTimeout(() => render('plans'), 200); } });
      </script></body></html>`;
    const spa = await h.open('spa.html', 'spa');
    await spa.waitForSelector('#go');
    await spa.click('#go');
    await spa.waitForSelector('#sub');
    await spa.click('#sub');
    h.check('SPA: a button created after a route change is held', await h.alertOpen(spa));
    await spa.waitForTimeout(500);
    await act(h, spa, 'cancel');

    // A fast double click: one analysis, and the action runs once.
    const gen = await h.open('generico.html', 'double');
    await gen.waitForTimeout(600);
    await countClicks(gen, 'button.cta');
    const before = h.fake.analyzeCalls;
    await gen.dblclick('button.cta');
    await verdictShown(gen);
    await armed(gen);
    await act(h, gen, 'proceed');
    await gen.waitForTimeout(600);
    h.check('double click: a single analysis', h.fake.analyzeCalls - before === 1, `${h.fake.analyzeCalls - before} analyses`);
    h.check('double click: the action runs once', (await clicks(gen)) === 1, `${await clicks(gen)} runs`);

    // A checkout inside an iframe (content scripts run in every frame).
    h.pages['/frame.html'] = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Frame</title></head><body><iframe id="f" src="/checkout.html" style="width:900px;height:900px"></iframe></body></html>';
    const fr = await h.open('frame.html', 'iframe');
    await fr.waitForTimeout(1200);
    const frame = fr.frameLocator('#f');
    await frame.locator('button.cta').click();
    await fr.waitForTimeout(800);
    const inFrame = await fr.frames().find((f) => f.url().endsWith('/checkout.html'))?.evaluate(() => Boolean(document.querySelector('antefirma-alert')));
    h.check('a checkout inside an iframe is held', inFrame === true);

    // The form sent with Enter.
    const kb = await h.open('tastiera.html', 'enter');
    await kb.waitForTimeout(600);
    await kb.fill('input[name="nome"]', 'Prova');
    await kb.press('input[name="nome"]', 'Enter');
    h.check('a form sent with Enter is held', await verdictShown(kb));
    await act(h, kb, 'cancel');
  },

  async report(h) {
    await h.settings({ consent: true });
    /** Waits for the report tab a click opens and says what it shows. */
    const reportFrom = async (click) => {
      const [tab] = await Promise.all([h.context.waitForEvent('page', { timeout: 8000 }), click()]);
      await tab.waitForSelector('#report:not([hidden])', { timeout: 8000 });
      const seen = await tab.evaluate(() => ({
        title: document.title,
        url: location.pathname,
        findings: document.querySelectorAll('#body .finding, #body blockquote, #body q').length,
        text: document.querySelector('#report').innerText,
        closed: [...document.querySelectorAll('#body details')].filter((d) => !d.open).length,
        toolsVisible: getComputedStyle(document.querySelector('#tools')).display !== 'none',
      }));
      await tab.emulateMedia({ media: 'print' });
      seen.toolsOnPaper = await tab.evaluate(() => getComputedStyle(document.querySelector('#tools')).display !== 'none');
      await tab.emulateMedia({ media: 'screen' });
      return { tab, seen };
    };

    // From the side panel, after analysing a contract.
    const panel = await h.open(h.extUrl('src/sidepanel/sidepanel.html'), 'panel');
    await panel.waitForTimeout(700);
    await panel.setInputFiles('#pdf-file', join(ROOT, 'demo', 'contratto.pdf'));
    await panel.waitForSelector('#report-open', { timeout: 12000 });
    const a = await reportFrom(() => panel.click('#report-open'));
    h.check('report from the panel: its own page, with the title', a.seen.url.endsWith('/src/report/report.html') && a.seen.title.length > 5, `${a.seen.url} · ${a.seen.title}`);
    h.check('report from the panel: the clauses and their sentences are there, every detail open', a.seen.text.length > 300 && a.seen.closed === 0, `${a.seen.text.length} characters, ${a.seen.closed} closed`);
    h.check('report: says when it was made and who made it', /antefirma\.app/.test(a.seen.text) && /\d{4}/.test(a.seen.text));
    h.check('report: buttons on screen, not on paper', a.seen.toolsVisible && !a.seen.toolsOnPaper);
    await h.a11y(a.tab, 'report page');
    await a.tab.screenshot({ path: process.env.REPORT_SHOT || '/dev/null', fullPage: true }).catch(() => {});
    await a.tab.close();

    // From the warning on a page.
    const pg = await h.open('checkout.html', 'checkout');
    await pg.waitForTimeout(600);
    await pg.click('button.cta');
    await verdictShown(pg);
    await h.alert(pg).locator('details.why > summary').click();
    const b = await reportFrom(() => h.alert(pg).locator('[data-report]').click());
    h.check('report from the warning: the same verdict on its own page', b.seen.text.length > 300 && b.seen.closed === 0, `${b.seen.text.length} characters`);
    h.check('report from the warning: the page behind is still held', await h.alertOpen(pg));
    await b.tab.close();
    await act(h, pg, 'cancel');

    // Opened with nothing to show: it says so instead of an empty sheet.
    await h.sw.evaluate(() => globalThis.chrome.storage.local.remove('report'));
    const empty = await h.open(h.extUrl('src/report/report.html'), 'report-empty');
    await empty.waitForSelector('#empty:not([hidden])', { timeout: 5000 });
    h.check('report with nothing stored: a plain message, no buttons', await empty.evaluate(() => document.querySelector('#report').hidden && document.querySelector('#tools').hidden));
  },

  async compare(h) {
    const terms = (price, months, fee) => ({
      price: { value: price, quote: `€ ${String(price).replace('.', ',')}` }, currency: { value: 'EUR' }, billing_period: { value: 'month' },
      minimum_term_months: { value: months, quote: `durata minima di ${months} mesi` }, notice_days: null,
      exit_fee: fee ? { value: fee, quote: `penale di € ${fee},00` } : null, extra_fees: [],
    });
    const A = 'OFFERTA UNO. Abbonamento a € 19,99 al mese, durata minima di 24 mesi. In caso di recesso anticipato è dovuta una penale di € 120,00.';
    const B = 'OFFERTA DUE. Abbonamento a € 24,99 al mese, durata minima di 12 mesi. Nessuna penale.';
    h.fake.byText = [
      [/OFFERTA UNO/, { findings: [{ category: 'early_termination_penalty', quote: 'è dovuta una penale di € 120,00', why: 'Motivo.', confidence: 0.9 }, { category: 'minimum_term', quote: 'durata minima di 24 mesi', why: 'Motivo.', confidence: 0.9 }], terms: terms(19.99, 24, 120), summary: '' }],
      [/OFFERTA DUE/, { findings: [{ category: 'minimum_term', quote: 'durata minima di 12 mesi', why: 'Motivo.', confidence: 0.9 }], terms: terms(24.99, 12, null), summary: '' }],
    ];
    await h.settings({ consent: true });
    const panel = await h.open(h.extUrl('src/sidepanel/sidepanel.html'), 'panel');
    await panel.waitForTimeout(700);
    await panel.click('.source[data-source="paste"]');
    const analyse = async (text, then) => { await panel.fill('#paste-text', text); await panel.click('#run-paste'); await panel.waitForSelector(then, { timeout: 12000 }); };

    await analyse(A, '#compare-start');
    await panel.click('#compare-start');
    await panel.waitForSelector('#compare-clear', { timeout: 5000 });
    h.check('compare: the first contract is put aside', (await panel.locator('#compare-box .status').count()) === 1);
    await analyse(B, '#compare-open');
    const [tab] = await Promise.all([h.context.waitForEvent('page', { timeout: 10000 }), panel.click('#compare-open')]);
    await tab.waitForSelector('#report:not([hidden]) table', { timeout: 8000 });
    const seen = await tab.evaluate(() => ({
      url: location.href, summary: document.querySelector('#summary').textContent,
      rows: Object.fromEntries([...document.querySelectorAll('#table tbody tr')].map((tr) => [tr.dataset.row, [...tr.querySelectorAll('td')].map((td) => `${td.textContent}${td.classList.contains('better') ? ' *' : ''}`)])),
    }));
    h.check('compare: the page opens in a tab with the two contracts in columns', seen.url.endsWith('/src/compare/compare.html') && Object.keys(seen.rows).length === 9, seen.url);
    h.check('compare: 599,76 € against 299,88 €, the lighter one marked, and the sentence says by how much', /599[.,]76/.test(seen.rows.total[0]) && /299[.,]88.* \*$/.test(seen.rows.total[1]) && /299[.,]88/.test(seen.summary), `${seen.rows.total.join(' | ')} — ${seen.summary}`);
    h.check('compare: 24 months against 12, a fee against none', / \*$/.test(seen.rows.term[1]) && /120/.test(seen.rows.fee[0]) && / \*$/.test(seen.rows.fee[1]), `${seen.rows.term.join(' | ')} — ${seen.rows.fee.join(' | ')}`);
    h.check('compare: nothing new was asked of the server', h.fake.analyzeCalls === 2, `${h.fake.analyzeCalls} analyses`);
    await h.a11y(tab, 'comparison page');
    // The contract put aside is not compared with itself; "stop comparing" starts again.
    await analyse(A, '#compare-clear');
    h.check('compare: the contract put aside is recognised', (await panel.locator('#compare-open').count()) === 0);
    await panel.click('#compare-clear');
    h.check('compare: "stop comparing" forgets it', await panel.waitForSelector('#compare-start', { timeout: 5000 }).then(() => true, () => false));
    h.fake.byText = null;
  },

  async photos(h) {
    const SCAN = join(ROOT, 'test', 'fixtures', 'scan');
    const TEXT = 'Art. 1 Durata. Il contratto ha durata minima di ventiquattro mesi e si rinnova automaticamente salvo disdetta con preavviso di 60 giorni.\n\nArt. 2 Recesso. In caso di recesso anticipato è dovuta una penale di € 120,00.';
    h.fake.readText = TEXT;
    await h.settings(); // no consent yet
    const panel = await h.open(h.extUrl('src/sidepanel/sidepanel.html'), 'panel');
    await panel.waitForTimeout(700);
    const statusText = () => panel.evaluate(() => document.querySelector('#status')?.textContent || '');
    const settled = (re) => panel.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('#status')?.textContent || ''), re.source, { timeout: 12000 }).then(() => true, () => false);

    const until = async (fn, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end && !fn();) await panel.waitForTimeout(100); };
    // Consent comes before anything leaves the browser.
    await panel.setInputFiles('#pdf-file', [join(SCAN, 'page1.jpg'), join(SCAN, 'page2.jpg')]);
    await panel.waitForSelector('#modal-foot button', { timeout: 8000 });
    h.check('photos: consent is asked before the photos are sent, and says a photo is sent', h.fake.readCalls === 0 && /foto/i.test(await panel.textContent('#modal-body')), `${h.fake.readCalls} reads`);
    await panel.locator('#modal-foot button').nth(1).click();
    const shown = await panel.waitForSelector('#report-open', { timeout: 15000 }).then(() => true, () => false);
    h.check('photos: after the yes they are read and the text is analysed', shown && h.fake.readCalls === 1 && h.fake.analyzeCalls === 1 && /ventiquattro/.test(h.fake.lastText), `${h.fake.readCalls} reads, ${h.fake.analyzeCalls} analyses`);
    h.check('photos: two pages go as JPEG, in order', h.fake.lastFiles.length === 2 && h.fake.lastFiles.every((f) => f.type === 'image/jpeg' && f.head === '/9j/'), JSON.stringify(h.fake.lastFiles));
    h.check('photos: the text that was read is in the text box, to check and correct', (await panel.inputValue('#paste-text')) === TEXT);
    h.check('photos: the verdict says the text comes from a photo', /foto|photo/i.test(await panel.textContent('#result')));
    await h.a11y(panel, 'panel after a photo');

    // A PDF made of scanned pages has no text inside: the server reads it.
    await h.clearCache();
    await panel.setInputFiles('#pdf-file', join(SCAN, 'scan.pdf'));
    await until(() => h.fake.analyzeCalls === 2);
    h.check('scanned PDF: sent as a PDF and read by the server', h.fake.readCalls === 2 && h.fake.lastFiles.length === 1 && h.fake.lastFiles[0].type === 'application/pdf', JSON.stringify(h.fake.lastFiles));
    // A PDF with text never leaves as a file.
    await h.clearCache();
    await panel.setInputFiles('#pdf-file', join(ROOT, 'demo', 'contratto.pdf'));
    await until(() => h.fake.analyzeCalls === 3);
    await panel.waitForSelector('#report-open', { timeout: 12000 }).catch(() => {});
    h.check('a PDF with text is read in the browser: no file is sent', h.fake.analyzeCalls === 3 && h.fake.readCalls === 2, `${h.fake.readCalls} reads, ${h.fake.analyzeCalls} analyses`);

    // What can go wrong, said plainly; nothing is analysed.
    const before = h.fake.analyzeCalls;
    for (const [mode, re] of [['no_text', /luce|light/], ['quota', /domani|tomorrow/], ['size', /MB/]]) {
      h.fake.readMode = mode;
      await panel.setInputFiles('#pdf-file', join(SCAN, 'page1.jpg'));
      const said = await settled(re);
      h.check(`photos, ${mode}: a clear message and no analysis`, said && h.fake.analyzeCalls === before, await statusText());
    }
    h.fake.readMode = 'ok';
    const reads = h.fake.readCalls;
    await panel.setInputFiles('#pdf-file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    h.check('a file that is neither a PDF nor an image is refused here, nothing sent', (await settled(/JPEG/)) && h.fake.readCalls === reads, await statusText());
  },

  async decisions(h) {
    await h.settings({ consent: true });
    const pg = await h.open('generico.html', 'decisions');
    await pg.waitForTimeout(600);
    await countClicks(pg, 'button.cta');
    await pg.click('button.cta');
    await verdictShown(pg);
    await act(h, pg, 'cancel');
    await pg.waitForTimeout(500);
    h.check('"Go back": the action is not performed', (await clicks(pg)) === 0 && !(await h.alertOpen(pg)));
    await pg.click('button.cta');
    await verdictShown(pg);
    await armed(pg);
    await act(h, pg, 'proceed');
    await pg.waitForTimeout(600);
    h.check('"Continue": the action is performed exactly once', (await clicks(pg)) === 1, `${await clicks(pg)} runs`);
  },

  async synthetic(h) {
    await h.settings(); // no consent yet
    const pg = await h.open('checkout.html', 'synthetic');
    await pg.waitForTimeout(600);
    await pg.click('button.cta');
    await pg.waitForFunction(() => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-consent="accept"]'), null, { timeout: 8000 });
    // The page tries to answer for the person.
    await pg.evaluate(() => document.querySelector('antefirma-alert').shadowRoot.querySelector('[data-consent="accept"]').click());
    await pg.waitForTimeout(1200);
    const still = await pg.evaluate(() => Boolean(document.querySelector('antefirma-alert')?.shadowRoot?.querySelector('[data-consent="accept"]')));
    h.check('a page script cannot press "Yes, analyse": consent is still asked and nothing is sent', still && h.fake.analyzeCalls === 0, `consent still asked ${still}, analyses ${h.fake.analyzeCalls}`);
    await pg.evaluate(() => document.querySelector('antefirma-alert').shadowRoot.querySelector('[data-act="proceed"], [data-consent="skip"]')?.click());
    await pg.waitForTimeout(800);
    h.check('…nor "Continue": the action stays held', await pg.evaluate(() => window.__demoSubmitted !== true));
    await h.alert(pg).locator('[data-consent="accept"]').click();
    h.check('a real click on "Yes, analyse" does work', await verdictShown(pg));
  },
};

SCENARIOS.a11y = async (h) => {
  for (const lang of LANGS) {
    await h.settings({ uiLang: lang, consent: true });
    for (const scheme of ['light', 'dark']) {
      const tag = `${lang} ${scheme}`;
      const pg = await h.open('checkout.html', `a11y ${tag}`);
      await pg.emulateMedia({ colorScheme: scheme });
      await pg.waitForTimeout(500);
      await countClicks(pg, 'button.cta');
      await h.clearCache();
      await pg.bringToFront();
      await pg.click('button.cta');
      await verdictShown(pg);
      await h.a11y(pg, `${tag} · the warning`, 'antefirma-alert');
      if (scheme === 'light') {
        // By keyboard: focus moves into the warning and stays there; Esc means "Go back".
        const inside = () => pg.evaluate(() => document.activeElement?.tagName === 'ANTEFIRMA-ALERT' && Boolean(document.querySelector('antefirma-alert').shadowRoot.activeElement));
        // A modal dialog lets Tab pass through the browser's own interface (focus
        // on <body> for a moment) before coming back: what must never happen is
        // focus on an element of the page underneath.
        const onPage = () => pg.evaluate(() => { const a = document.activeElement; return Boolean(a) && a !== document.body && a.tagName !== 'ANTEFIRMA-ALERT'; });
        h.check(`${tag} · the warning takes the focus`, await inside());
        let leaked = 0, back = 0;
        for (const key of [...Array(14).fill('Tab'), ...Array(6).fill('Shift+Tab')]) {
          await pg.keyboard.press(key);
          if (await onPage()) leaked++;
          if (await inside()) back++;
        }
        h.check(`${tag} · Tab and Shift+Tab never reach the page underneath`, leaked === 0 && back >= 16, `${leaked} times on the page, ${back}/20 inside`);
        const names = await pg.evaluate(() => [...document.querySelector('antefirma-alert').shadowRoot.querySelectorAll('button, a[href], summary')]
          .filter((b) => b.getClientRects().length).filter((b) => !(b.getAttribute('aria-label') || b.textContent).trim()).length);
        h.check(`${tag} · every control has a name`, names === 0, `${names} without a name`);
        await pg.keyboard.press('Escape');
        await pg.waitForTimeout(500);
        h.check(`${tag} · Esc closes the warning as "Go back": the action is not performed`, !(await h.alertOpen(pg)) && (await clicks(pg)) === 0);
      }
      await pg.close();
      for (const [page, name] of [['src/sidepanel/sidepanel.html', 'side panel'], ['src/options/options.html', 'settings'], ['src/welcome/welcome.html', 'welcome page']]) {
        const ext = await h.open(h.extUrl(page), name);
        await ext.emulateMedia({ colorScheme: scheme });
        await ext.waitForTimeout(700);
        await h.a11y(ext, `${tag} · the ${name}`);
        await ext.close();
      }
    }
  }
};

const only = process.env.ONLY;
const failures = [];
const started = Date.now();
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (only && only !== name) continue;
  console.log(`\n── ${name} ──`);
  const h = await startStack();
  try { await run(h); } catch (err) { h.check(`${name}: the scenario reaches the end`, false, err.message.split('\n')[0]); }
  failures.push(...(await h.close()).map((f) => `${name}: ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
}
console.log(`\n${failures.length ? `${failures.length} failed:\n  ${failures.join('\n  ')}` : 'all scenarios passed'} · ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(failures.length ? 1 : 0);
