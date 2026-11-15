/*
 * AnteFirma web: the part of the service worker that shows reminders when the
 * app is closed. Appended to sw.js by tools/web-build.mjs.
 *
 * The server's wake-up has no content. What to say was written in advance by
 * the page (src/background/push.js) and is read here from the browser's own
 * storage: the "pushPlan" entry of the IndexedDB the web version uses in place
 * of chrome.storage (web/shim.js).
 */
const AF_PLAN = 'pushPlan';
// A wake-up may come a little before the minute it was planned for.
const AF_SLACK = 10 * 60000;

function afStore(mode) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('antefirma', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result.transaction('kv', mode).objectStore('kv'));
    req.onerror = () => reject(req.error);
  });
}
const afDone = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** The entries due and not shown yet, one per commitment: the most urgent (as dueFromPlan in src/core/push.js). */
function afDue(items, now) {
  const by = new Map();
  for (const p of items || []) {
    if (p.shown || p.at > now + AF_SLACK) continue;
    const cur = by.get(p.commitmentId);
    if (!cur || p.days < cur.days) by.set(p.commitmentId, p);
  }
  return [...by.values()];
}

async function afShowDue(now = Date.now()) {
  let plan = null;
  try { plan = await afDone((await afStore('readonly')).get(AF_PLAN)); } catch { /* no storage: the fallback below */ }
  const due = afDue(plan?.items, now);
  const icon = plan?.icon;
  if (!due.length) {
    // A wake-up must show something. Without a plan there is no text in the
    // person's language either: the name alone, which opens the app.
    const f = plan?.fallback || { title: 'AnteFirma', message: '', url: '/' };
    return self.registration.showNotification(f.title, { body: f.message, icon, tag: 'antefirma-reminder', data: { url: f.url } });
  }
  for (const p of due) {
    await self.registration.showNotification(p.title, { body: p.message, icon, tag: p.tag, requireInteraction: true, data: { url: p.url } });
  }
  // Everything due for those commitments counts as said, not only what was shown.
  const said = new Set(due.map((p) => p.commitmentId));
  const items = plan.items.map((p) => (said.has(p.commitmentId) && p.at <= now + AF_SLACK ? { ...p, shown: true } : p));
  try { await afDone((await afStore('readwrite')).put({ ...plan, items }, AF_PLAN)); } catch { /* shown anyway */ }
}

self.addEventListener('push', (e) => { e.waitUntil(afShowDue()); });

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    return open ? open.navigate(url).then((c) => (c || open).focus()) : self.clients.openWindow(url);
  }));
});
