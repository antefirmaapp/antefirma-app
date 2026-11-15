/**
 * The Firefox build in a real Firefox, against the real server, locally.
 *
 *     FIREFOX=/path/to/firefox node tools/firefox-check.mjs
 *
 * 1. Starts antefirma-server (in-memory store, ALLOW_FIREFOX=1) with the
 *    stand-in model of tools/fake-model.mjs, as tools/local-stack.mjs does.
 * 2. Builds the Firefox extension (tools/firefox-build.mjs) pointing at it.
 * 3. Starts Firefox headless on a new profile and drives it with WebDriver
 *    BiDi (no driver to install: Firefox speaks it itself), loading the
 *    extension as a temporary add-on.
 * 4. Checks what differs from Chrome: the warning at the click with real
 *    clicks, the analysis through the server from a moz-extension:// origin,
 *    the panel and the settings as pages, the sidebar, notifications.
 *
 * Firefox is not downloaded here: give its path. Exit code 1 if a check fails.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { buildFirefox, GECKO_ID } from './firefox-build.mjs';
import { startFakeModel } from './fake-model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIREFOX = process.env.FIREFOX;
if (!FIREFOX || !existsSync(FIREFOX)) {
  console.error('Set FIREFOX to the path of the Firefox binary (128 or later).');
  process.exit(2);
}
const SERVER_DIR = resolve(process.env.ANTEFIRMA_SERVER_DIR || join(ROOT, '..', 'antefirma-server'));
const UUID = '0d5a1b2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c';
const EXT_URL = `moz-extension://${UUID}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const children = [];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const cleanup = () => { for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } } };
process.on('exit', cleanup);

// 1. Model stand-in and server.
const fake = await startFakeModel();
const port = 8900 + Math.floor(Math.random() * 90);
const secret = () => randomBytes(32).toString('base64url');
const server = spawn(process.execPath, ['src/node.js'], {
  cwd: SERVER_DIR, stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env, PORT: String(port), TOKEN_SECRET: secret(), LICENSE_SECRET: secret(), ADMIN_TOKEN: secret(),
    ANTHROPIC_API_KEY: 'local-stand-in', API_URL: fake.url, ALLOWED_ORIGINS: 'chrome-extension://none', ALLOW_FIREFOX: '1',
    CACHE_TTL_DAYS: '0', MONTHLY_PER_INSTALL: '0',
  },
});
children.push(server);
const API = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${API}/v1/health`)).ok) break; } catch { /* starting */ }
  await sleep(200);
}

// 2. The extension, talking to that server.
const EXT = join(mkdtempSync(join(tmpdir(), 'af-firefox-check-')), 'firefox');
buildFirefox(EXT);
const manifestFile = join(EXT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
manifest.host_permissions = [...manifest.host_permissions, `${API}/*`];
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
const cfgFile = join(EXT, 'src', 'core', 'config.js');
writeFileSync(cfgFile, readFileSync(cfgFile, 'utf8').replace(/export const API_BASE = '[^']+';/, `export const API_BASE = '${API}';`));

// The demo pages.
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const site = createServer((req, res) => {
  const f = join(ROOT, 'demo', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(join(ROOT, 'demo')) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'text/plain' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => site.once('listening', r));
const DEMO = `http://127.0.0.1:${site.address().port}/`;

// 3. Firefox, on a new profile. The add-on's internal address is fixed, to open its pages.
const profile = mkdtempSync(join(tmpdir(), 'af-firefox-profile-'));
writeFileSync(join(profile, 'user.js'), [
  ['extensions.webextensions.uuids', JSON.stringify({ [GECKO_ID]: UUID })],
  ['browser.shell.checkDefaultBrowser', false], ['browser.aboutwelcome.enabled', false], ['app.update.enabled', false],
  ['datareporting.policy.dataSubmissionEnabled', false], ['toolkit.telemetry.reportingpolicy.firstRun', false],
  ['intl.accept_languages', 'it-IT, it'], ['remote.active-protocols', 1],
].map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
const bidiPort = 9300 + Math.floor(Math.random() * 90);
// Recent Firefox versions let a remote client run scripts in an extension's own
// pages only when started with this variable; older ones ignore it.
const firefox = spawn(FIREFOX, ['--headless', '--no-remote', '--profile', profile, '--remote-debugging-port', String(bidiPort)],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } });
children.push(firefox);
let firefoxLog = '';
firefox.stderr.on('data', (d) => { firefoxLog += d; });
for (let i = 0; i < 150 && !/WebDriver BiDi listening/.test(firefoxLog); i++) await sleep(200);
if (!/WebDriver BiDi listening/.test(firefoxLog)) { console.error('Firefox did not start:\n' + firefoxLog.slice(-800)); process.exit(1); }

const ws = new WebSocket(`ws://127.0.0.1:${bidiPort}/session`);
await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('cannot connect to Firefox')); });
let seq = 0;
const waiting = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'event' && m.method === 'log.entryAdded') { logs.push(m.params); return; }
  const w = waiting.get(m.id);
  if (!w) return;
  waiting.delete(m.id);
  if (m.type === 'error') w.no(new Error(`${m.error}: ${m.message}`)); else w.ok(m.result);
};
const send = (method, params = {}) => new Promise((ok, no) => { const id = ++seq; waiting.set(id, { ok, no }); ws.send(JSON.stringify({ id, method, params })); });

/** Runs an expression in a tab and returns its JSON-able value. */
async function evaluate(context, expression) {
  const r = await send('script.evaluate', { expression: `(async () => JSON.stringify(await (${expression})))()`, target: { context }, awaitPromise: true });
  if (r.type === 'exception') throw new Error(r.exceptionDetails?.text || 'script failed');
  return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
}
const until = async (context, expression, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    try { if (await evaluate(context, expression)) return true; } catch { /* page loading */ }
    await sleep(200);
  }
  return false;
};
/** A real click (trusted), at the centre of what `expression` finds. */
async function click(context, expression) {
  const box = await evaluate(context, `(() => { const el = ${expression}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box) throw new Error(`nothing to click: ${expression}`);
  await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', x: Math.round(box.x), y: Math.round(box.y) }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
  ] }] });
}
const tab = async (url) => {
  const { context } = await send('browsingContext.create', { type: 'tab' });
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  return context;
};
/** The tabs open now, as { context, url }. */
const tabs = async () => (await send('browsingContext.getTree', {})).contexts.map((c) => ({ context: c.context, url: c.url }));
/**
 * A page of the extension. Firefox does not let anything outside navigate to
 * moz-extension:// addresses, so the extension opens it: from the welcome page
 * it opened by itself at installation.
 */
async function extensionTab(path) {
  const url = `${EXT_URL}${path}`;
  const from = (await tabs()).find((t) => t.url.startsWith(EXT_URL));
  if (!from) throw new Error('no page of the extension is open');
  await evaluate(from.context, `browser.tabs.create({ url: ${JSON.stringify(url)} }).then(() => true)`);
  for (let i = 0; i < 50; i++) {
    const found = (await tabs()).find((t) => t.url === url);
    if (found) return found.context;
    await sleep(200);
  }
  throw new Error(`the extension page did not open: ${path}`);
}
const ALERT = "document.querySelector('antefirma-alert')?.shadowRoot";

try {
  const session = await send('session.new', { capabilities: {} });
  const version = session.capabilities.browserVersion;
  console.log(`Firefox ${version}, server ${API} (stand-in model), demo ${DEMO}\n`);
  await send('session.subscribe', { events: ['log.entryAdded'] });

  // ── installation ──
  const installed = await send('webExtension.install', { extensionData: { type: 'path', path: EXT } });
  check('the extension loads as a temporary add-on', installed.extension === GECKO_ID, installed.extension);
  let welcome = false;
  for (let i = 0; i < 50 && !welcome; i++) { welcome = (await tabs()).some((t) => t.url === `${EXT_URL}src/welcome/welcome.html`); if (!welcome) await sleep(200); }
  check('the background page starts and opens the welcome', welcome);

  // ── the warning at the click ──
  const page = await tab(`${DEMO}checkout.html`);
  await sleep(800);
  await click(page, "document.querySelector('button.cta')");
  const asked = await until(page, `Boolean(${ALERT}?.querySelector('[data-consent="accept"]'))`);
  check('a click on the button that commits is held, and consent is asked first', asked);
  check('the page did not go on by itself', await evaluate(page, 'window.__demoSubmitted !== true'));
  await click(page, `${ALERT}.querySelector('[data-consent="accept"]')`);
  const verdict = await until(page, `Boolean(${ALERT}?.querySelector('.provenance'))`, 20000);
  const text = verdict ? await evaluate(page, `${ALERT}.textContent`) : '';
  check('after the yes, the server answers (moz-extension:// origin) and the warning shows the verdict', verdict, text.replace(/\s+/g, ' ').slice(0, 110));
  check('the verdict has the clauses of the page', /rinnov|penal|durata/i.test(text));
  await click(page, `${ALERT}.querySelector('[data-act="cancel"]')`);
  check('"Go back" closes the warning and the action is not performed', await until(page, "!document.querySelector('antefirma-alert')", 5000) && await evaluate(page, 'window.__demoSubmitted !== true'));

  // ── the panel (the sidebar's page) ──
  const panel = await extensionTab('src/sidepanel/sidepanel.html');
  check('the panel opens', await until(panel, "Boolean(document.querySelector('#paste-text'))"));
  await click(panel, "document.querySelector('.source[data-source=\"paste\"]')");
  await evaluate(panel, `(() => { const t = document.querySelector('#paste-text'); t.value = ${JSON.stringify('Abbonamento Premium a € 19,99 al mese. Il contratto ha una durata minima di 24 mesi. Alla scadenza il contratto si rinnova automaticamente per un uguale periodo, salvo disdetta con preavviso di almeno 60 giorni. In caso di recesso anticipato è dovuta una penale di € 120,00.')}; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await click(panel, "document.querySelector('#run-paste')");
  const analysed = await until(panel, "(document.querySelector('#result')?.textContent.length || 0) > 80", 20000);
  check('the panel analyses a pasted text', analysed, analysed ? (await evaluate(panel, "document.querySelector('#result').textContent")).replace(/\s+/g, ' ').slice(0, 100) : await evaluate(panel, "document.querySelector('#status')?.textContent"));
  check('the report button is there', await evaluate(panel, "Boolean(document.querySelector('#report-open'))"));

  // ── the sidebar ──
  await evaluate(panel, "(() => { const b = document.createElement('button'); b.id = 'af-test-open'; b.textContent = 'open'; b.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; b.onclick = () => browser.sidebarAction.open(); document.body.append(b); return true; })()");
  await click(panel, "document.querySelector('#af-test-open')");
  await sleep(1000);
  check('the sidebar opens with the panel in it', await evaluate(panel, 'browser.sidebarAction.isOpen({})') === true && /sidepanel\.html$/.test(await evaluate(panel, 'browser.sidebarAction.getPanel({})')));

  // ── notifications ──
  const plain = await evaluate(panel, "browser.notifications.create('af-test', { type: 'basic', iconUrl: browser.runtime.getURL('src/icons/icon128.png'), title: 'AnteFirma', message: 'test', priority: 2 }).then(() => 'shown', (e) => e.message)");
  check('a notification without buttons is accepted', plain === 'shown', plain);
  const buttons = await evaluate(panel, "(async () => { try { await browser.notifications.create('af-test-2', { type: 'basic', iconUrl: browser.runtime.getURL('src/icons/icon128.png'), title: 'AnteFirma', message: 'test', buttons: [{ title: 'x' }] }); return 'shown'; } catch (e) { return 'refused'; } })()");
  check('one with buttons is refused: why the Firefox build sends them without', buttons === 'refused', buttons);

  // ── a reminder sent by the extension itself ──
  const soon = new Date(Date.now() + 3 * 86400000).toISOString();
  await evaluate(panel, `browser.storage.local.set({ commitments: [{ id: 'ff-test', provider: 'Palestra FitClub', host: 'fitclub.example', status: 'active', deadlineAt: ${JSON.stringify(soon)}, currency: 'EUR', recurringTotal: 479.76, reminders: [{ days: 3, at: new Date(Date.now() - 60000).toISOString(), fired: false }] }] }).then(() => true)`);
  await evaluate(panel, "browser.alarms.create('antefirma-sweep-test', { when: Date.now() + 200 }).then(() => true)");
  const names = await evaluate(panel, 'browser.alarms.getAll().then((a) => a.map((x) => x.name))');
  const sweepName = names.find((n) => n !== 'antefirma-sweep-test' && /sweep|daily|pass/i.test(n)) || names.find((n) => n !== 'antefirma-sweep-test');
  // The extension's own alarm, brought forward: the background wakes and sends what is due.
  await evaluate(panel, `browser.alarms.create(${JSON.stringify(sweepName)}, { when: Date.now() + 300, periodInMinutes: 720 }).then(() => true)`);
  const fired = await until(panel, "browser.storage.local.get('commitments').then((x) => x.commitments[0].reminders[0].fired === true)", 15000);
  check('the background page wakes on its alarm and sends the reminder that is due', fired, `alarm ${sweepName}`);

  // ── settings ──
  const options = await extensionTab('src/options/options.html');
  check('the settings open and show the stored values', await until(options, "Boolean(document.querySelector('#reminders')) && document.querySelector('#jurisdiction')?.value.length > 0"));
  check('push reminders are not offered in the extension', await evaluate(options, "document.querySelector('#push-row').hidden === true"));

  // ── errors ──
  const errors = logs.filter((l) => l.level === 'error' && /moz-extension|antefirma/i.test(`${l.text} ${JSON.stringify(l.source || {})} ${JSON.stringify(l.stackTrace || {})}`));
  check('no errors from the extension in the console', errors.length === 0, errors.slice(0, 3).map((l) => l.text).join(' | ').slice(0, 300));
} catch (err) {
  check('the run reaches the end', false, err.message);
} finally {
  try { await send('browser.close'); } catch { /* closing */ }
  site.close();
  await fake.close?.();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
cleanup();
process.exit(failed.length ? 1 : 0);
