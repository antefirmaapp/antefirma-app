/* global chrome -- used inside sw.evaluate(), which runs in the extension */
/**
 * The extension against the real server, locally: the check to run before a release.
 *
 *     node tools/local-stack.mjs                 opens Chromium on the demo pages, to try by hand
 *     node tools/local-stack.mjs --auto          goes through the demo scenarios and prints a report
 *     node tools/local-stack.mjs --auto --json report.json
 *
 * 1. Starts antefirma-server (`node src/node.js`, in-memory store) from the
 *    sibling folder or ANTEFIRMA_SERVER_DIR, with test secrets made up on the
 *    spot. With ANTHROPIC_API_KEY in the environment the real model answers
 *    (and costs money); without it, a local stand-in (tools/fake-model.mjs) does,
 *    and the script says so.
 * 2. Builds a copy of the extension pointing at that server (in a temp folder:
 *    the repository's files are not touched), with the developer key, so its
 *    ID is fixed and the server accepts it.
 * 3. Opens Chromium with it, and the demo pages served locally.
 * 4. With --auto, for every scenario of demo/index.html: risks found, cost,
 *    deadline, quotes dropped by the server, time, estimated cost of the call.
 *    Exit code 1 if a scenario blocks when it shouldn't, or the other way round.
 *
 * Without a key it runs in CI as a real integration check: the same contract,
 * nothing mocked on the extension's side (the server's CI runs it).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { DEV_KEY, DEV_ID } from './dev-zip-key.mjs';
import { startFakeModel } from './fake-model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const AUTO = args.includes('--auto');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const SERVER_DIR = resolve(process.env.ANTEFIRMA_SERVER_DIR || join(ROOT, '..', 'antefirma-server'));
if (!existsSync(join(SERVER_DIR, 'src', 'node.js'))) {
  console.error(`antefirma-server not found in ${SERVER_DIR}: set ANTEFIRMA_SERVER_DIR`);
  process.exit(2);
}

/** The scenarios of demo/index.html: page, button, whether it must block, the categories expected. */
const SCENARIOS = [
  ['checkout.html', 'Conferma abbonamento', true, ['auto_renewal', 'minimum_term', 'early_termination_penalty', 'no_refund']],
  ['riepilogo.html', "Attiva l'offerta", true, ['auto_renewal', 'minimum_term', 'early_termination_penalty', 'no_refund']],
  ['promo.html', 'Passa a Pro', true, ['auto_renewal', 'minimum_term', 'early_termination_penalty']],
  ['onesto.html', 'Abbonati', false, []],
  ['tastiera.html', 'Conferma la polizza', true, ['auto_renewal', 'minimum_term', 'early_termination_penalty']],
  ['generico.html', 'Continua', true, ['auto_renewal', 'minimum_term', 'early_termination_penalty']],
  ['es.html', 'Contratar ahora', true, ['auto_renewal', 'minimum_term', 'early_termination_penalty', 'no_refund']],
  ['en.html', 'Subscribe — cancel anytime', true, ['auto_renewal', 'minimum_term', 'early_termination_penalty']],
];

const children = [];
const cleanup = () => { for (const c of children) { try { c.kill('SIGINT'); } catch { /* already gone */ } } };
process.on('exit', cleanup);

// 1. The model: real with a key, the stand-in without.
const realKey = process.env.ANTHROPIC_API_KEY || '';
let fake = null;
if (!realKey) {
  fake = await startFakeModel();
  console.log(`No ANTHROPIC_API_KEY: the model is a local stand-in (${fake.url}). The verdicts test the plumbing, not the model.`);
} else {
  console.log('ANTHROPIC_API_KEY found: the real model answers, and every analysis costs money.');
}

// 1b. The server, with secrets made up for this run only.
const port = 8900 + Math.floor(Math.random() * 90);
const secret = () => randomBytes(32).toString('base64url');
const ADMIN = secret();
const serverEnv = {
  ...process.env, PORT: String(port), TOKEN_SECRET: secret(), LICENSE_SECRET: secret(), ADMIN_TOKEN: ADMIN,
  ANTHROPIC_API_KEY: realKey || 'local-stand-in', ...(fake ? { API_URL: fake.url } : {}),
  ALLOWED_ORIGINS: `chrome-extension://${DEV_ID}`, CACHE_TTL_DAYS: '0', MONTHLY_PER_INSTALL: '0',
};
const server = spawn(process.execPath, ['src/node.js'], { cwd: SERVER_DIR, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(server);
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const API = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`${API}/v1/health`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 200));
}

// 2. A copy of the extension that talks to it.
const EXT = mkdtempSync(join(tmpdir(), 'af-local-ext-'));
for (const p of ['src', '_locales']) cpSync(join(ROOT, p), join(EXT, p), { recursive: true });
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
manifest.key = DEV_KEY;
manifest.host_permissions = [...(manifest.host_permissions || []), `${API}/*`];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const cfgFile = join(EXT, 'src', 'core', 'config.js');
writeFileSync(cfgFile, readFileSync(cfgFile, 'utf8').replace(/export const API_BASE = '[^']+';/, `export const API_BASE = '${API}';`));

// 3. The demo pages, and Chromium.
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.pdf': 'application/pdf' };
const site = createServer((req, res) => {
  const f = join(ROOT, 'demo', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!f.startsWith(join(ROOT, 'demo')) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'text/plain' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => site.once('listening', r));
const DEMO = `http://127.0.0.1:${site.address().port}/`;

const { chromium } = createRequire(import.meta.url)('playwright');
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'af-local-profile-')), {
  headless: false, // extensions need a real browser; --headless=new keeps it invisible with --auto
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, ...(AUTO ? ['--headless=new'] : []), '--no-sandbox', '--lang=it-IT'],
});
// Nothing goes to production: the real api.antefirma.app is blocked outright.
await context.route('https://api.antefirma.app/**', (r) => r.abort());
// The analyses go from the service worker to the local server: read each answer on the way.
let answer = null;
await context.route(`${API}/v1/analyze`, async (route) => {
  const res = await route.fetch();
  answer = await res.json().catch(() => null);
  await route.fulfill({ response: res });
});
const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
console.log(`Server ${API} · extension ${new URL(sw.url()).host} · demo ${DEMO}`);

if (!AUTO) {
  const page = await context.newPage();
  await page.goto(DEMO);
  console.log('Try it by hand. Close the browser (or Ctrl+C) to stop.');
  await new Promise((r) => context.on('close', r));
  site.close(); fake?.close(); cleanup();
  process.exit(0);
}

// 4. The scenarios.
await sw.evaluate(() => chrome.storage.local.get('settings').then(({ settings }) => chrome.storage.local.set({ settings: { ...settings, remoteConsentAt: new Date().toISOString(), uiLang: 'it' } })));
const admin = async (path) => (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${ADMIN}` } })).json();
const today = async () => (await admin('/v1/admin/overview?days=1')).days.at(-1);
const shadow = (pg, sel) => pg.evaluate((s) => document.querySelector('antefirma-alert')?.shadowRoot?.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() || '', sel);
const report = [];
let failures = 0;

for (const [file, label, mustBlock, expected] of SCENARIOS) {
  const page = await context.newPage();
  page.on('dialog', (d) => d.dismiss());
  await page.goto(DEMO + file);
  await page.waitForTimeout(700);
  const before = await today();
  answer = null;
  const t0 = Date.now();
  await page.getByRole('button', { name: label }).first().click();
  const state = await page.waitForFunction(() => {
    const root = document.querySelector('antefirma-alert')?.shadowRoot;
    if (root?.querySelector('.provenance')) return 'blocked'; // only a verdict has it: the waiting card has .tiles too
    if (root?.querySelector('.error')) return 'error';
    return document.querySelector('.outcome')?.textContent || window.__demoSubmitted ? 'through' : null;
  }, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => 'stuck');
  const ms = Date.now() - t0;
  const after = await today();
  const found = [...new Set((answer?.findings || []).map((f) => f.category))].sort();
  const row = {
    page: file, outcome: state, mustBlock, ms,
    risks: found, missing: expected.filter((c) => !found.includes(c)),
    cost: state === 'blocked' ? await shadow(page, '.tile.strong .tvalue') : null,
    deadline: state === 'blocked' ? (await shadow(page, '.tiles')).match(/\d{1,2} \w+ \d{4}/)?.[0] || null : null,
    dropped: answer?.dropped ?? null,
    callCostUsd: Number(((after?.cost || 0) - (before?.cost || 0)).toFixed(5)),
  };
  const ok = (state === 'blocked') === mustBlock && state !== 'error' && state !== 'stuck';
  if (!ok) failures++;
  report.push({ ...row, ok });
  console.log(`${ok ? '  ok  ' : 'NOT OK'}  ${file.padEnd(16)} ${state.padEnd(8)} ${String(ms).padStart(5)} ms · risks ${found.join(', ') || '—'}` +
    `${row.missing.length ? ` · missing ${row.missing.join(', ')}` : ''}${row.cost ? ` · ${row.cost}` : ''}${row.deadline ? ` · by ${row.deadline}` : ''}` +
    ` · dropped ${row.dropped ?? '-'} · $${row.callCostUsd}`);
  await page.close();
}

const total = report.reduce((a, r) => a + r.callCostUsd, 0);
console.log(`\n${report.length - failures}/${report.length} scenarios as declared · model ${realKey ? 'real' : 'stand-in'} · estimated cost $${total.toFixed(4)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), model: realKey ? 'real' : 'stand-in', scenarios: report }, null, 2));
if (failures && serverLog) console.log(`\nserver log (last lines):\n${serverLog.split('\n').slice(-15).join('\n')}`);
await context.close();
site.close(); fake?.close(); cleanup();
process.exit(failures ? 1 : 0);
