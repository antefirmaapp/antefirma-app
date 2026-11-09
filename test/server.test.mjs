/**
 * Il client del server: token dell'installazione, nuovo tentativo dopo un 401,
 * traduzione degli errori. `fetch` e `chrome.storage` sono sostituiti da finti.
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

/** Un server finto che risponde con le funzioni date, una per rotta. */
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

test('l’id dell’installazione si genera una volta e poi resta', async () => {
  const storage = memoryStorage();
  const a = await installId({ storage });
  const b = await installId({ storage });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test('la registrazione conserva il token e manda solo l’id', async () => {
  const storage = memoryStorage();
  const { fetchImpl, calls } = fakeServer({ '/v1/register': () => json(200, { token: 'tok-1' }) });
  const token = await register({ storage, fetchImpl, base: BASE });
  assert.equal(token, 'tok-1');
  assert.deepEqual(Object.keys(calls[0].body), ['installId']);
  assert.equal(storage.data.antefirmaAuth.token, 'tok-1');
});

test('la prima analisi si registra da sé e usa il token', async () => {
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

test('i tipi di azione e la giurisdizione diventano quelli del server', async () => {
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

test('a un token scaduto se ne chiede uno nuovo e si riprova una volta', async () => {
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

test('un 401 ostinato non diventa un ciclo infinito', async () => {
  const storage = memoryStorage();
  const { fetchImpl, calls } = fakeServer({
    '/v1/register': () => json(200, { token: 't' }),
    '/v1/analyze': () => json(401, { error: 'auth' }),
  });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e instanceof ServerError && e.code === 'auth');
  assert.equal(calls.filter((c) => c.path === '/v1/analyze').length, 2);
});

test('la quota esaurita arriva come errore con un messaggio per la persona', async () => {
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

test('finite le analisi gratuite del mese, il messaggio lo dice', async () => {
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

test('il servizio occupato riporta quando riprovare', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const { fetchImpl } = fakeServer({ '/v1/analyze': () => json(503, { error: 'busy' }, { 'retry-after': '30' }) });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'busy' && e.retryAfter === 30);
});

test('senza rete l’errore dice che il server non è raggiungibile', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'network');
});

test('il tempo scaduto si distingue dalla rete assente', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const fetchImpl = async () => { throw new DOMException('timeout', 'TimeoutError'); };
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'timeout');
});

test('una risposta senza JSON non fa esplodere il client', async () => {
  const storage = memoryStorage();
  await storage.set({ antefirmaAuth: { installId: 'i', token: 't' } });
  const fetchImpl = async () => new Response('<html>gateway</html>', { status: 502 });
  await assert.rejects(analyzeRemote({ text: 'x' }, { storage, fetchImpl, base: BASE }), (e) => e.code === 'upstream');
});

// ── piano ───────────────────────────────────────────────────────────────────

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

test('piano: lettura con GET e token, nuovo token dopo un 401', async () => {
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

test('piano: acquisto, attivazione e rimozione', async () => {
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
