/**
 * The server client: installation token, retry after a 401, error translation.
 * `fetch` and `chrome.storage` are replaced by fakes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeRemote, register, installId, ServerError } from '../src/core/server.js';

const BASE = 'https://api.test';

function memoryStorage() {
  const data = {};
  return {
    data,
    async get(key) { return key in data ? { [key]: structuredClone(data[key]) } : {}; },
    async set(obj) { Object.assign(data, structuredClone(obj)); },
  };
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A fake server answering with the given functions, one per route. */
function fakeServer(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    calls.push({ path, body, auth: init.headers.authorization || null });
    return routes[path](body, init, calls);
  };
  return { fetchImpl, calls };
}

const OK = { findings: [], terms: {}, summary: 'nulla', dropped: 0, truncated: false, model: 'm', cached: false, quota: { remaining: 9 } };

test('the installation id is generated once and then stays', async () => {
  const storage = memoryStorage();
  const a = await installId({ storage });
  const b = await installId({ storage });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test('registration keeps the token and sends only the id', async () => {
  const storage = memoryStorage();
  const { fetchImpl, calls } = fakeServer({ '/v1/register': () => json(200, { token: 'tok-1' }) });
  const token = await register({ storage, fetchImpl, base: BASE });
  assert.equal(token, 'tok-1');
  assert.deepEqual(Object.keys(calls[0].body), ['installId']);
  assert.equal(storage.data.antefirmaAuth.token, 'tok-1');
});

test('the first analysis registers by itself and uses the token', async () => {
  const storage = memoryStorage();
  const { fetchImpl, calls } = fakeServer({
    '/v1/register': () => json(200, { token: 'tok-1' }),
    '/v1/analyze': () => json(200, OK),
  });
  const res = await analyzeRemote({ text: 'testo', actionType: 'subscribe', url: 'https://x.test' }, { storage, fetchImpl, base: BASE });
  assert.equal(res.summary, 'nulla');
  assert.deepEqual(calls.map((c) => c.path), ['/v1/register', '/v1/analyze']);
  assert.equal(calls[1].auth, 'Bearer tok-1');
  assert.equal(calls[1].body.action, 'subscribe');
});

test('action types and jurisdiction become the server\'s', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const { fetchImpl, calls } = fakeServer({ '/v1/analyze': () => json(200, OK) });
  const run = (actionType, jurisdiction) => analyzeRemote({ text: 'x', actionType, jurisdiction }, { storage, fetchImpl, base: BASE });
  await run('accept_terms', 'IT');
  await run('signup', 'UK');
  await run('oauth', 'OTHER');
  await run('qualcosa', 'EU');
  assert.deepEqual(calls.map((c) => c.body.action), ['accept', 'register', 'consent', 'other']);
  assert.deepEqual(calls.map((c) => c.body.userCountry), ['IT', 'GB', 'IT', 'IT']);
});

test('an expired token is replaced and the call retried once', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 'vecchio' } });
  const { fetchImpl, calls } = fakeServer({
    '/v1/register': () => json(200, { token: 'nuovo' }),
    '/v1/analyze': (_b, init) => (init.headers.authorization === 'Bearer nuovo' ? json(200, OK) : json(401, { error: 'auth' })),
  });
  const res = await analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE });
  assert.equal(res.summary, 'nulla');
  assert.deepEqual(calls.map((c) => c.path), ['/v1/analyze', '/v1/register', '/v1/analyze']);
});

test('a stubborn 401 doesn\'t become an endless loop', async () => {
  const storage = memoryStorage();
  const { fetchImpl, calls } = fakeServer({
    '/v1/register': () => json(200, { token: 't' }),
    '/v1/analyze': () => json(401, { error: 'auth' }),
  });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e instanceof ServerError && e.code === 'auth');
  assert.equal(calls.filter((c) => c.path === '/v1/analyze').length, 2);
});

test('quota exhausted arrives as an error with a message for the person', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const { fetchImpl } = fakeServer({ '/v1/analyze': () => json(429, { error: 'quota', message: 'daily limit' }) });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => {
    assert.equal(e.code, 'quota');
    assert.match(e.message, /analisi di oggi/);
    assert.equal(e.detail, 'daily limit');
    return true;
  });
});

test('with this month\'s free analyses used up, the message says so', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const { fetchImpl } = fakeServer({ '/v1/analyze': () => json(429, { error: 'quota_month' }, { 'retry-after': '1950000' }) });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => {
    assert.equal(e.code, 'quota_month');
    assert.match(e.message, /analisi di questo mese.*Piano/);
    assert.equal(e.retryAfter, 1950000);
    return true;
  });
});

test('a busy service reports when to retry', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const { fetchImpl } = fakeServer({ '/v1/analyze': () => json(503, { error: 'busy' }, { 'retry-after': '30' }) });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'busy' && e.retryAfter === 30);
});

test('without network the error says the server is unreachable', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'network');
});

test('a timeout is told apart from a missing network', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const fetchImpl = async () => { throw new DOMException('timeout', 'TimeoutError'); };
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'timeout');
});

test('a response without JSON doesn\'t blow up the client', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const fetchImpl = async () => new Response('<html>gateway</html>', { status: 502 });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'upstream');
});

// ── plan ────────────────────────────────────────────────────────────────────

import { getLicense, startCheckout, activateLicense, deactivateLicense } from '../src/core/server.js';

function planServer(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization || null });
    return routes[path](calls);
  };
  return { fetchImpl, calls };
}

test('plan: read with GET and token, new token after a 401', async () => {
  const storage = memoryStorage();
  let n = 0;
  const { fetchImpl, calls } = planServer({
    '/v1/register': () => json(200, { token: `v1.tok${++n}` }),
    '/v1/license': (c) => (c.filter((x) => x.path === '/v1/license').length === 1 ? json(401, { error: 'auth' }) : json(200, { plan: 'pro', active: true })),
  });
  const r = await getLicense({ storage, fetchImpl, base: BASE });
  assert.equal(r.plan, 'pro');
  const lic = calls.filter((x) => x.path === '/v1/license');
  assert.equal(lic[0].method, 'GET');
  assert.equal(lic[0].body, null);
  assert.equal(lic[1].auth, 'Bearer v1.tok2');
});

test('plan: purchase, activation and removal', async () => {
  const storage = memoryStorage();
  const { fetchImpl, calls } = planServer({
    '/v1/register': () => json(200, { token: 'v1.t' }),
    '/v1/pro/checkout': () => json(200, { claim: 'c', url: 'https://antefirma.app/pro/#c=c&p=max' }),
    '/v1/license/activate': () => json(409, { error: 'activations', message: 'server' }),
    '/v1/license/deactivate': () => json(200, { removed: true }),
  });
  const o = { storage, fetchImpl, base: BASE };
  assert.match((await startCheckout('max', o)).url, /p=max/);
  assert.deepEqual(calls.find((c) => c.path === '/v1/pro/checkout').body, { plan: 'max' });
  await assert.rejects(activateLicense(' AF-AAAA-BBBB-CCCC-DDDD ', o), (e) => e instanceof ServerError && e.code === 'activations' && /massimo di browser/.test(e.message));
  assert.equal(calls.find((c) => c.path === '/v1/license/activate').body.key, 'AF-AAAA-BBBB-CCCC-DDDD');
  assert.equal((await deactivateLicense(o)).removed, true);
});

test('a 200 with an unreadable body is a failure, never an empty verdict', async () => {
  // Read as "no findings" it would become "all fine", and be cached as such.
  for (const body of ['{"findings": [ {"cat', '', 'null', '{"summary": "ok"}', '[]']) {
    const { fetchImpl } = fakeServer({
      '/v1/register': () => json(200, { token: 'tok' }),
      '/v1/analyze': () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    await assert.rejects(analyzeRemote({ text: 'x' }, { storage: memoryStorage(), fetchImpl, base: BASE }),
      (e) => e instanceof ServerError && e.code === 'upstream', JSON.stringify(body));
  }
});

test('the starting protections come from the browser language', async () => {
  const { jurisdictionFor } = await import('../src/core/jurisdiction.js');
  const cases = { 'de-AT': 'AT', 'de-DE': 'DE', de: 'DE', 'de-CH': 'DE', 'fr-BE': 'BE', 'nl-BE': 'BE', nl: 'NL', 'fr-FR': 'FR', 'fr-CA': 'FR',
    'en-US': 'US', 'en-GB': 'UK', en: 'UK', 'es-MX': 'ES', 'it-CH': 'IT', 'pt-BR': 'OTHER', 'pt-PT': 'PT', pt: 'PT', 'pl-PL': 'PL', 'sv-SE': 'SE', 'ro-RO': 'RO', cs: 'CZ', 'da-DK': 'DK', 'fi-FI': 'FI', 'nb-NO': 'NO', nn: 'NO', 'sk-SK': 'SK', hu: 'HU', 'el-GR': 'GR', 'el-CY': 'CY', 'lt-LT': 'LT', lv: 'LV', 'et-EE': 'EE', 'en-IE': 'IE', 'mt-MT': 'MT', 'fr-LU': 'LU', 'de-LU': 'LU', 'is-IS': 'EU', '': 'EU', es_ES: 'ES' };
  for (const [ui, want] of Object.entries(cases)) assert.equal(jurisdictionFor(ui), want, ui);
});
