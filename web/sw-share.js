/*
 * AnteFirma web: "Share → AnteFirma" from another app on the phone.
 * Appended to sw.js by tools/web-build.mjs.
 *
 * With the app installed, the system offers AnteFirma among the apps a photo,
 * a PDF or a text can be shared with (manifest.webmanifest, share_target). The
 * shared content arrives here as a form: it is put aside in the browser's own
 * cache and the app is opened, where web/boot.js picks it up and hands it to
 * the panel. Nothing leaves the device at this point: a photo is sent to the
 * server only by the panel, after consent, as when it is chosen by hand.
 */
const AF_SHARE_CACHE = 'antefirma-share';
const AF_SHARE_TYPES = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;
// More pages than any plan reads: the panel says so, the cache is not filled.
const AF_SHARE_MAX_FILES = 12;

const afAppUrl = (query) => new URL(`/${query}`, self.location.origin).href;

async function afTakeShare(request) {
  const cache = await caches.open(AF_SHARE_CACHE);
  for (const key of await cache.keys()) await cache.delete(key);
  let form;
  try { form = await request.formData(); } catch { return Response.redirect(afAppUrl(''), 303); }
  const files = form.getAll('files').filter((f) => typeof f === 'object' && f && (AF_SHARE_TYPES.test(f.type) || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name || ''))).slice(0, AF_SHARE_MAX_FILES);
  let n = 0;
  for (const f of files) {
    await cache.put(`/shared/file-${n}`, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || `shared-${n}`) } }));
    n += 1;
  }
  // A page shared from a browser comes as title, text and address: kept together, as text to read.
  const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('\n\n');
  if (text) await cache.put('/shared/text', new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
  return Response.redirect(afAppUrl(n || text ? '?shared=1' : ''), 303);
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.origin === self.location.origin && u.pathname === '/share') e.respondWith(afTakeShare(e.request));
});
