/**
 * "Share → AnteFirma" (web version): what the service worker keeps of a shared
 * form, and the manifest entry that makes the system offer the app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const store = new Map();
  const cache = {
    keys: async () => [...store.keys()].map((k) => ({ url: `https://web.antefirma.app${k}` })),
    delete: async (k) => store.delete(typeof k === 'string' ? k : new URL(k.url).pathname),
    put: async (k, res) => { store.set(k, res); },
  };
  const listeners = {};
  const self = { location: { origin: 'https://web.antefirma.app' }, addEventListener: (n, f) => { listeners[n] = f; } };
  vm.runInNewContext(readFileSync(new URL('../web/sw-share.js', import.meta.url), 'utf8'), { self, caches: { open: async () => cache }, Response, URL, encodeURIComponent });
  const post = async (form, path = '/share', method = 'POST') => {
    let answer;
    listeners.fetch({ request: { url: `https://web.antefirma.app${path}`, method, formData: async () => { if (!form) throw new Error('bad form'); return form; } }, respondWith: (p) => { answer = p; } });
    return answer ? await answer : null;
  };
  return { store, post };
}
const file = (name, type, text = 'x') => new File([text], name, { type });
const form = (entries) => { const f = new FormData(); for (const [k, v] of entries) f.append(k, v); return f; };

test('shared photos are put aside in order, with their names, and the app is opened', async () => {
  const w = worker();
  const res = await w.post(form([['files', file('pagina 1.jpg', 'image/jpeg', 'one')], ['files', file('pagina 2.jpg', 'image/jpeg', 'two')]]));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), 'https://web.antefirma.app/?shared=1');
  assert.deepEqual([...w.store.keys()], ['/shared/file-0', '/shared/file-1']);
  assert.equal(decodeURIComponent(w.store.get('/shared/file-0').headers.get('x-name')), 'pagina 1.jpg');
  assert.equal(await w.store.get('/shared/file-1').text(), 'two');
});

test('a PDF is accepted; other kinds of file are left out', async () => {
  const w = worker();
  await w.post(form([['files', file('contratto.pdf', 'application/pdf')], ['files', file('video.mp4', 'video/mp4')], ['files', file('IMG.HEIC', '')], ['files', 'not a file']]));
  assert.deepEqual([...w.store.keys()], ['/shared/file-0', '/shared/file-1']);
  assert.equal(w.store.get('/shared/file-0').headers.get('content-type'), 'application/pdf');
});

test('a page shared from a browser arrives as text: title, text and address together', async () => {
  const w = worker();
  const res = await w.post(form([['title', 'Condizioni'], ['text', 'Il contratto si rinnova.'], ['url', 'https://example.com/termini']]));
  assert.equal(res.status, 303);
  assert.equal(await w.store.get('/shared/text').text(), 'Condizioni\n\nIl contratto si rinnova.\n\nhttps://example.com/termini');
});

test('a new share replaces the previous one; an empty or broken one opens the app with nothing', async () => {
  const w = worker();
  await w.post(form([['files', file('a.jpg', 'image/jpeg')], ['files', file('b.jpg', 'image/jpeg')]]));
  await w.post(form([['text', 'solo testo']]));
  assert.deepEqual([...w.store.keys()], ['/shared/text']);
  const empty = await w.post(form([['files', file('video.mp4', 'video/mp4')]]));
  assert.ok(!String(empty.headers.get('location')).includes('shared'));
  assert.equal(w.store.size, 0);
  assert.equal((await w.post(null)).status, 303);
});

test('no more files than a plan could ever read are kept', async () => {
  const w = worker();
  await w.post(form(Array.from({ length: 30 }, (_, i) => ['files', file(`p${i}.jpg`, 'image/jpeg')])));
  assert.equal(w.store.size, 12);
});

test('only a POST to /share is taken: the rest goes on as before', async () => {
  const w = worker();
  assert.equal(await w.post(form([['text', 'x']]), '/share', 'GET'), null);
  assert.equal(await w.post(form([['text', 'x']]), '/other'), null);
});

test('the web build declares the share target and appends the handler', () => {
  const build = readFileSync(new URL('../tools/web-build.mjs', import.meta.url), 'utf8');
  assert.match(build, /share_target: \{\s*action: '\/share', method: 'POST', enctype: 'multipart\/form-data'/);
  assert.match(build, /files: \[\{ name: 'files', accept: \[[^\]]*'application\/pdf'[^\]]*'image\/jpeg'/);
  assert.match(build, /sw-share\.js/);
});
