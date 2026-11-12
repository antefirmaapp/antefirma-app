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
  for (const lang of ['it', 'en', 'es', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs', 'da', 'fi', 'no', 'sk', 'hu', 'el', 'hr', 'sl', 'bg']) {
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
