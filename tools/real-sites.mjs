/* global chrome -- used inside sw.evaluate(), which runs in the extension */
/**
 * The extension on real websites: which buttons it holds, which it lets through.
 *
 *     xvfb-run -a node tools/real-sites.mjs [--out dir] [--workers 6] [--only 1-10] [--per-site 16]
 *                                          [--depth2 2] [--sites list.json] [--ext extension-folder]
 *
 * For every page in test/real-sites/sites.json ([category, lang, url]):
 *  1. opens it in Chromium with the real extension loaded and consent given;
 *  2. lists the visible clickable elements (the detector's own selector) and
 *     picks those worth trying: every label that reads like a commitment in one
 *     of the extension's languages, the cookie banner's buttons, and a few others;
 *  3. for each, reloads the page and clicks it for real (a trusted click), then
 *     records whether the warning appeared, the action type the extension sent
 *     and the text it would have analysed.
 *
 * Nothing happens on the sites. Every request that is not a read (POST, PUT,
 * DELETE…) is aborted, and so is every navigation of the page after it loaded,
 * and new windows are closed: a button the extension lets through cannot
 * submit, buy or sign up anything. api.antefirma.app is a fake that never
 * answers an analysis, so nothing reaches the real server or the model either.
 *
 * Output (in --out, default the system temp folder): results.jsonl as it goes
 * and results.json at the end, with every attempt, and texts/<n>.txt with the text each held click would have sent.
 * Not run in CI: real sites change every day. The page list is kept in the
 * repository; the results, which hold third-party text, are not.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const OUT = arg('out', mkdtempSync(join(tmpdir(), 'af-real-sites-')));
const WORKERS = Number(arg('workers', 6));
const PER_SITE = Number(arg('per-site', 16));
const only = arg('only', '');
mkdirSync(join(OUT, 'texts'), { recursive: true });

// --sites another list (e.g. a second set kept apart, to measure on pages the rules were not tuned on);
// --ext another build of the extension (e.g. an older version, to compare on the same pages).
const SITES_FILE = arg('sites', join(ROOT, 'test', 'real-sites', 'sites.json'));
const EXT = arg('ext', ROOT);
let SITES = JSON.parse(readFileSync(SITES_FILE, 'utf8')).map(([category, lang, url], i) => ({ n: i + 1, category, lang, url, depth: 1 }));
const DEPTH2 = Number(arg('depth2', 2));
/** A link that leads towards the commitment: worth opening as a page of its own, one level down. */
const FUNNEL = /sign-?up|signup|register|registr|checkout|cart|basket|carrello|cesta|warenkorb|panier|plans?\b|plan[-/?]|pricing|subscri|abbon|abonn|abo\b|offert|offer|tarif|order|ordin|buy|acquist|compra|kauf|commerce|join|premium|choose|select|attiva|activ|bestel|bestell|prenum|assin|cadence|upsell|trial|prova|free-trial|user-flow/i;
if (only) { const [a, b] = only.split('-').map(Number); SITES = SITES.filter((s) => s.n >= a && s.n <= (b || a)); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const LOCALES = { it: 'it-IT', en: 'en-IE', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', pl: 'pl-PL', pt: 'pt-PT', sv: 'sv-SE', ro: 'ro-RO', cs: 'cs-CZ', da: 'da-DK', fi: 'fi-FI', no: 'nb-NO', sk: 'sk-SK', hu: 'hu-HU', el: 'el-GR', hr: 'hr-HR', sl: 'sl-SI', bg: 'bg-BG', lt: 'lt-LT', lv: 'lv-LV', et: 'et-EE' };

/**
 * Runs in the page: the visible clickable elements, in document order, with
 * what a person reads on them. The same function finds an element again after
 * a reload (by tag, label and occurrence), so it must stay deterministic.
 */
const LIST = () => {
  const CLICKABLE = 'button, a[href], input[type="submit"], input[type="button"], [role="button"], [type="submit"]';
  const COOKIE = /cookie|consent|gdpr|onetrust|didomi|cmp|usercentrics|iubenda|cookiebot|truste|sp_message|privacy-?banner|cookielaw|tarteaucitron|axeptio|klaro|osano|termly/i;
  const out = [];
  const seen = new Map();
  for (const el of document.querySelectorAll(CLICKABLE)) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!label) continue;
    let cookie = false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (COOKIE.test(`${n.id} ${typeof n.className === 'string' ? n.className : ''} ${n.getAttribute?.('aria-label') || ''}`)) { cookie = true; break; }
    }
    const key = `${el.tagName}|${label}`;
    const occ = seen.get(key) || 0;
    seen.set(key, occ + 1);
    out.push({ tag: el.tagName.toLowerCase(), label, occ, cookie, href: el.getAttribute('href') || null, type: el.getAttribute('type') || null });
  }
  return out;
};

/** Marks the element LIST() describes as `want`, for Playwright to click. */
const MARK = (want) => {
  const CLICKABLE = 'button, a[href], input[type="submit"], input[type="button"], [role="button"], [type="submit"]';
  document.querySelectorAll('[data-af-probe]').forEach((e) => e.removeAttribute('data-af-probe'));
  let occ = 0;
  for (const el of document.querySelectorAll(CLICKABLE)) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (el.tagName.toLowerCase() !== want.tag || label !== want.label) continue;
    if (occ++ === want.occ) { el.setAttribute('data-af-probe', '1'); return true; }
  }
  return false;
};

/** Labels that read like a commitment, in the extension's languages: the ones always tried. */
const LIKELY = new RegExp([
  'buy', 'order', 'subscri', 'sign ?up', 'join', 'get (?:started|it|premium|plan)', 'start', 'trial', 'try', 'choose', 'select', 'upgrade', 'checkout', 'check out', 'pay', 'purchase', 'accept', 'agree', 'allow', 'continue', 'register', 'add to (?:cart|basket|bag)', 'continue with', 'sign in with', 'log in with',
  'acquist', 'compra', 'abbona', 'iscriv', 'attiva', 'prova', 'scegli', 'accett', 'consenti', 'continua', 'registr', 'ordina', 'aggiungi', 'passa a', 'inizia',
  'suscr', 'contrat', 'elegir', 'elige', 'empieza', 'empezar', 'pru[eé]ba', 'acept', 'pedir', 'pide', 'comprar', 'hazte', 'únete', 'apúntate',
  'kauf', 'bestell', 'abonn', 'abo ', 'buchen', 'jetzt', 'testen', 'wählen', 'auswählen', 'akzept', 'zustimm', 'weiter', 'registrier', 'mitglied',
  'achet', 'command', 's.abonner', 'souscri', 'choisi', 'essay', 'accept', "j'accepte", 'continuer', 'inscri', 'profit', 'découvr',
  'bestel', 'abonnee', 'kies', 'probeer', 'akkoord', 'accepteer', 'aanmeld', 'word lid', 'neem',
  'kup', 'zamów', 'wybierz', 'akceptuj', 'zgadzam', 'dalej', 'subskryb', 'zarejestr', 'sprawdź ofert',
  'assin', 'aderi', 'escolh', 'aceit', 'adquir',
  'köp', 'beställ', 'prenumer', 'välj', 'godkänn', 'acceptera', 'bli medlem', 'teckna',
  'cumpăr', 'abon', 'alege', 'accept', 'comand',
  'koupit', 'objednat', 'vybrat', 'přijmout', 'souhlas', 'køb', 'bestil', 'vælg', 'accepter', 'tilmeld', 'osta', 'tilaa', 'valitse', 'hyväksy', 'kjøp', 'velg', 'godta',
  'kúpiť', 'objednať', 'vybrať', 'prijať', 'vásárl', 'megrendel', 'előfizet', 'választ', 'elfogad', 'αγορ', 'παραγγ', 'επιλ', 'αποδοχ', 'κάνε', 'kupi', 'naruči', 'odaberi', 'prihvati', 'naroči', 'izberi', 'sprejmi', 'купи', 'поръчай', 'избери', 'приемам', 'pirk', 'užsisak', 'rinkt', 'sutink', 'priimti', 'pirkt', 'pasūt', 'izvēl', 'piekrīt', 'pieņemt', 'osta', 'telli', 'vali', 'nõustu',
].join('|'), 'i');

function pick(list, max = PER_SITE) {
  const chosen = [];
  const add = (c, why) => { if (chosen.length < max && !chosen.includes(c)) { c.why = why; chosen.push(c); } };
  // The same label repeated (a plan grid of ten "Choose") is tried once.
  const uniq = [];
  const labels = new Set();
  for (const c of list) { const k = `${c.tag}|${c.label.toLowerCase()}`; if (!labels.has(k)) { labels.add(k); uniq.push(c); } }
  for (const c of uniq) if (c.cookie) add(c, 'cookie');
  for (const c of uniq) if (!c.cookie && LIKELY.test(c.label)) add(c, 'likely');
  // A few others, as a control: what should never be held.
  const rest = uniq.filter((c) => !chosen.includes(c) && c.label.length > 2);
  for (let i = 0; i < rest.length && chosen.length < max; i += Math.max(1, Math.floor(rest.length / 4))) add(rest[i], 'control');
  return chosen;
}

/** Hides whatever covers the marked element at its centre (a sticky bar, a chat bubble, an overlay). */
const UNCOVER = () => {
  const el = document.querySelector('[data-af-probe="1"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!top || el.contains(top) || top.contains(el)) return false;
  let n = top;
  while (n.parentElement && n.parentElement !== document.body && !['fixed', 'sticky'].includes(getComputedStyle(n).position)) n = n.parentElement;
  n.style.setProperty('display', 'none', 'important');
  return true;
};
/** The cookie banner's "no": it lets the page through and, the profile keeping its cookies, the banner stays away. */
const REJECT = /rifiut|solo (?:i )?(?:cookie )?(?:essenzial|necessar|tecnic)|essential|necessary only|only necessary|reject|decline|deny|refuse|continua senza|continue without|rechazar|solo necesari|ablehnen|nur (?:notwendig|erforderlich|essenziell)|refuser|tout refuser|continuer sans|weiger|alleen noodzakelijk|odrzuć|rejeitar|recusar|avvisa|neka|endast nödvändiga|respinge|odmítnout|afvis|hylkää|avslå|odmietnuť|elutasít|απόρριψη|odbij|zavrni|отхвърл|atmesti|noraidīt|keeldu/i;
const CMP_HIDE = `#onetrust-consent-sdk,#didomi-host,#usercentrics-root,#usercentrics-cmp-ui,#CybotCookiebotDialog,.qc-cmp2-container,[id^="sp_message_container"],#iubenda-cs-banner,.cc-window,#tarteaucitronRoot,.axeptio_overlay,#cmpbox,#cmpwrapper,.cookie-banner,#cookie-banner,#cookiebanner,[class*="CookieBanner"],[id*="cookie-consent"],[class*="cookie-consent"],#truste-consent-track,.osano-cm-window{display:none!important}`;

async function worker(id, queue, results, texts) {
  const perSite = (site) => (site.depth === 2 ? Math.min(PER_SITE, 12) : PER_SITE);
  const profile = mkdtempSync(join(tmpdir(), `af-real-${id}-`));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false, userAgent: UA, viewport: { width: 1366, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', '--no-sandbox', '--lang=it-IT'],
  });
  // The fake AnteFirma server: a token, a free plan, and analyses that never come back.
  let captured = null;
  await context.route('https://api.antefirma.app/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/v1/register') return json(200, { token: 'v1.real-sites' });
    if (path === '/v1/license') return json(200, { plan: 'free', active: false, quota: { month: { limit: 5, remaining: 5 } } });
    if (path === '/v1/analyze') { try { captured = JSON.parse(req.postData() || '{}'); } catch { captured = {}; } return; /* never answered */ }
    if (path === '/v1/health') return json(200, { ok: true });
    return json(404, { error: 'not_found' });
  });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
  await sw.evaluate(() => chrome.storage.local.get('settings').then(({ settings }) => chrome.storage.local.set({ settings: { ...(settings || {}), remoteConsentAt: new Date().toISOString() } })));
  // A tab opened by the extension at installation (the welcome page) is closed.
  for (const p of context.pages()) if (p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});

  while (queue.length) {
    const site = queue.shift();
    const rec = { ...site, status: 'ok', attempts: [], errors: [], blockedRequests: 0 };
    let loaded = false;
    let navAttempts = [];
    const page = await context.newPage();
    const watchdog = setTimeout(() => { rec.status = 'stuck: closed after 4 minutes'; page.close().catch(() => {}); }, 4 * 60_000);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('console', (m) => { if (m.type() === 'error' && /chrome-extension:\/\//.test(m.location()?.url || '')) rec.errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => { if (/chrome-extension:\/\//.test(e.stack || '')) rec.errors.push(e.message.slice(0, 300)); });
    page.on('popup', (p) => { navAttempts.push(`popup ${p.url()}`); p.close().catch(() => {}); });
    // The guard: nothing but reads, and the page stays where it is once loaded.
    await page.route('**/*', (route) => {
      const req = route.request();
      if (req.url().startsWith('https://api.antefirma.app/')) return route.fallback();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { rec.blockedRequests++; navAttempts.push(`${req.method()} ${req.url().slice(0, 120)}`); return route.abort('blockedbyclient'); }
      if (loaded && req.isNavigationRequest() && req.frame() === page.mainFrame()) { navAttempts.push(`nav ${req.url().slice(0, 120)}`); return route.abort('blockedbyclient'); }
      return route.fallback();
    });
    const open = async () => {
      loaded = false;
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      loaded = true;
    };
    // The visit runs on its own: a page so frozen that even closing it never returns is left
    // behind after five minutes, and the worker goes on with the next site.
    const visit = (async () => { try {
      await page.setExtraHTTPHeaders({ 'accept-language': `${LOCALES[site.lang] || 'en-IE'},en;q=0.5` });
      const res = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      rec.httpStatus = res?.status() ?? null;
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
      loaded = true;
      rec.finalUrl = page.url();
      rec.title = (await page.title()).slice(0, 120);
      const list = await page.evaluate(LIST);
      rec.clickable = list.length;
      if (!list.length || (rec.httpStatus && rec.httpStatus >= 400)) rec.status = rec.httpStatus >= 400 ? `http ${rec.httpStatus}` : 'empty';
      const chosen = rec.status === 'ok' ? pick(list, perSite(site)) : [];
      let dismissed = false;
      for (const c of chosen) {
        if (page.isClosed()) break;
        if (!c.cookie && !dismissed) {
          dismissed = true;
          // Cookie buttons tried: the banner is now answered "no", once, for the rest of the visit.
          const no = list.find((x) => x.cookie && REJECT.test(x.label));
          if (no) {
            try {
              await open();
              if (await page.evaluate(MARK, no)) { await page.locator('[data-af-probe="1"]').click({ timeout: 3000, noWaitAfter: true }); await page.waitForTimeout(800); rec.cookieDismissed = no.label; }
            } catch { /* the CSS below hides it anyway */ }
          }
        }
        const a = { tag: c.tag, label: c.label, cookie: c.cookie, why: c.why, href: c.href };
        try {
          await open();
          if (!c.cookie) await page.addStyleTag({ content: CMP_HIDE }).catch(() => {});
          if (!(await page.evaluate(MARK, c))) { a.result = 'gone'; rec.attempts.push(a); continue; }
          captured = null;
          navAttempts = [];
          const target = page.locator('[data-af-probe="1"]');
          await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
          let clicked = false;
          for (let round = 0; round < 3 && !clicked; round++) {
            try {
              await target.click({ timeout: 2500, noWaitAfter: true, trial: true });
              await target.click({ timeout: 2500, noWaitAfter: true });
              clicked = true;
            } catch (err) {
              a.detail = err.message.split('\n').find((l) => /intercepts|not visible|outside|Timeout/.test(l))?.trim().slice(0, 160) || err.message.split('\n')[0].slice(0, 160);
              // Something covers it: hidden, then tried again.
              if (!(await page.evaluate(UNCOVER).catch(() => false))) break;
            }
          }
          if (!clicked) { a.result = 'unclickable'; rec.attempts.push(a); continue; }
          delete a.detail;
          await page.waitForTimeout(900);
          const alert = await page.evaluate(() => Boolean(document.querySelector('antefirma-alert')));
          a.held = alert || Boolean(captured);
          a.result = a.held ? 'held' : 'passed';
          if (captured) {
            a.actionType = captured.action?.type || captured.actionType || captured.action || null;
            a.textChars = (captured.text || '').length;
            const k = `${site.n}-${rec.attempts.length + 1}`;
            texts[k] = { url: captured.url, button: captured.button || c.label, text: captured.text || '' };
            a.textFile = `${k}.txt`;
          }
          a.wouldHave = navAttempts.slice(0, 3);
        } catch (err) {
          a.result = 'error';
          a.detail = err.message.split('\n')[0].slice(0, 160);
        }
        rec.attempts.push(a);
      }
    } catch (err) {
      rec.status = `unreachable: ${err.message.split('\n')[0].slice(0, 120)}`;
    } })();
    let giveUp;
    const abandoned = await Promise.race([
      visit.then(() => false),
      new Promise((resolve) => { giveUp = setTimeout(() => resolve(true), 5 * 60_000); }),
    ]);
    clearTimeout(giveUp);
    if (abandoned) rec.status = 'stuck: abandoned after 5 minutes';
    // A site that never lets the browser go is closed by the watchdog; the record says so.
    clearTimeout(watchdog);
    if (!abandoned) await page.close().catch(() => {});
    // One level down: the pages the commitment links lead to, opened as pages of their own.
    if (site.depth === 1 && rec.status === 'ok') {
      const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'); } catch { return ''; } };
      const deeper = [];
      for (const a of rec.attempts) {
        if (!a.href || deeper.length >= DEPTH2) continue;
        let u; try { u = new URL(a.href, rec.finalUrl || site.url).href.split('#')[0]; } catch { continue; }
        if (!/^https:/.test(u) || host(u) !== host(site.url) || u === rec.finalUrl || u === site.url) continue;
        if (!(FUNNEL.test(u) || (a.why === 'likely' && LIKELY.test(a.label))) || deeper.some((d) => d.url === u)) continue;
        if (/legal|terms|privacy|cookie|condizioni|help|support|faq|login|signin|sign-in|accedi|gift/i.test(u)) continue;
        deeper.push({ n: `${site.n}.${deeper.length + 1}`, category: site.category, lang: site.lang, url: u, depth: 2, from: a.label });
      }
      queue.unshift(...deeper);
    }
    results.push(rec);
    // Written as it goes: a run stopped half-way keeps what it did.
    appendFileSync(join(OUT, 'results.jsonl'), JSON.stringify(rec) + '\n');
    for (const a of rec.attempts) if (a.textFile && texts[a.textFile.replace(/\.txt$/, '')]) {
      const v = texts[a.textFile.replace(/\.txt$/, '')];
      writeFileSync(join(OUT, 'texts', a.textFile), `URL: ${v.url}\nBUTTON: ${v.button}\n\n${v.text}`);
    }
    const held = rec.attempts.filter((x) => x.result === 'held').length;
    console.log(`[w${id}] #${site.n} ${site.url} — ${rec.status}, ${rec.attempts.length} tried, ${held} held${rec.errors.length ? `, ${rec.errors.length} extension errors` : ''}`);
  }
  await context.close();
}

const queue = [...SITES];
const results = [];
const texts = {};
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, (_, i) => worker(i + 1, queue, results, texts)));
results.sort((a, b) => String(a.n).localeCompare(String(b.n), undefined, { numeric: true }));
for (const [k, v] of Object.entries(texts)) writeFileSync(join(OUT, 'texts', `${k}.txt`), `URL: ${v.url}\nBUTTON: ${v.button}\n\n${v.text}`);
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.status === 'ok');
console.log(`\n${ok.filter((r) => r.depth === 1).length} sites and ${ok.filter((r) => r.depth === 2).length} deeper pages usable of ${results.length} · ${ok.reduce((n, r) => n + r.attempts.length, 0)} buttons tried · results in ${OUT}`);
