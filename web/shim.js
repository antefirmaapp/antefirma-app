/*
 * AnteFirma web: the extension's APIs, imitated with the browser's.
 *
 * The web version uses the same code as the extension's panel, settings and
 * "service worker". Below is only what is needed to run it in a normal
 * page:
 *  - chrome.storage → IndexedDB (local) and memory (session);
 *  - chrome.runtime.sendMessage → a direct call to the background, running in the same page;
 *  - chrome.alarms → timers, while the window is open;
 *  - chrome.notifications → browser notifications, if the person allows them.
 * What a web page cannot do (read other tabs, stop a click on another site)
 * is missing: the panel hides those features.
 *
 * A classic script, loaded before every module.
 */
(() => {
  const BASE = new URL('../', document.currentScript.src).href; // the web version's root
  document.documentElement.dataset.web = '1';

  // ── storage ───────────────────────────────────────────────────────────
  const DB = new Promise((resolve, reject) => {
    const req = indexedDB.open('antefirma', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const idb = async (mode, fn) => {
    const db = await DB;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const out = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  };
  const local = {
    async getAll() {
      const db = await DB;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv'), out = {};
        const cur = st.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
      });
    },
    get: (k) => idb('readonly', (st) => st.get(k)),
    put: (k, v) => idb('readwrite', (st) => { st.put(v, k); }),
    del: (k) => idb('readwrite', (st) => { st.delete(k); }),
    clear: () => idb('readwrite', (st) => { st.clear(); }),
  };
  const mem = new Map();
  const session = {
    async getAll() { return Object.fromEntries(mem); },
    async get(k) { return mem.get(k); },
    async put(k, v) { mem.set(k, v); },
    async del(k) { mem.delete(k); },
    async clear() { mem.clear(); },
  };
  const changed = [];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // The web version's other windows hear changes (e.g. panel and settings open together).
  const bc = 'BroadcastChannel' in self ? new BroadcastChannel('antefirma-storage') : null;
  const emit = (changes, areaName, remote = false) => {
    if (!Object.keys(changes).length) return;
    for (const l of changed) { try { l(changes, areaName); } catch (e) { console.error(e); } }
    if (!remote && bc && areaName === 'local') bc.postMessage({ changes, areaName });
  };
  if (bc) bc.onmessage = (e) => emit(e.data.changes, e.data.areaName, true);

  const withCb = (p, args) => { const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null; if (cb) p.then(cb, () => cb()); return p; };
  function area(name, be) {
    return {
      get(keys, ...rest) {
        return withCb((async () => {
          if (keys == null) return clone(await be.getAll());
          const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
          const defs = typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
          const out = {};
          for (const k of list) { const v = await be.get(k); if (v !== undefined) out[k] = clone(v); else if (k in defs) out[k] = defs[k]; }
          return out;
        })(), [keys, ...rest]);
      },
      set(items, ...rest) {
        return withCb((async () => {
          const ch = {};
          for (const [k, v] of Object.entries(items || {})) { const old = await be.get(k); await be.put(k, clone(v)); ch[k] = { oldValue: old, newValue: clone(v) }; }
          emit(ch, name);
        })(), [items, ...rest]);
      },
      remove(keys, ...rest) {
        return withCb((async () => {
          const ch = {};
          for (const k of typeof keys === 'string' ? [keys] : keys) { const old = await be.get(k); if (old !== undefined) { await be.del(k); ch[k] = { oldValue: old }; } }
          emit(ch, name);
        })(), [keys, ...rest]);
      },
      clear(...rest) { return withCb(be.clear(), rest); },
    };
  }

  // ── messages between panel and background, in the same page ────────────
  const onMessage = [];
  let markReady; const ready = new Promise((r) => { markReady = r; });
  function sendMessage(msg, cb) {
    const p = ready.then(() => new Promise((resolve) => {
      let done = false, pending = 0;
      const respond = (v) => { if (!done) { done = true; resolve(v); } };
      for (const l of [...onMessage]) {
        try { const keep = l(clone(msg), { id: 'web', url: location.href }, respond); if (keep === true) pending++; } catch (e) { console.error(e); }
      }
      if (!pending) setTimeout(() => respond(undefined), 0);
    }));
    if (typeof cb === 'function') p.then(cb);
    return p;
  }

  // ── timers instead of alarms ──────────────────────────────────────────
  const timers = new Map(), onAlarm = [];
  const fire = (name) => { for (const l of onAlarm) { try { l({ name }); } catch (e) { console.error(e); } } };
  const alarms = {
    async create(name, info = {}) {
      alarms.clear(name);
      const first = info.when ? Math.max(0, info.when - Date.now()) : (info.delayInMinutes ?? info.periodInMinutes ?? 0) * 60e3;
      const t = { timeout: setTimeout(() => { fire(name); if (info.periodInMinutes) t.interval = setInterval(() => fire(name), info.periodInMinutes * 60e3); }, Math.min(first, 2 ** 31 - 1)) };
      timers.set(name, t);
    },
    async clear(name) { const t = timers.get(name); if (t) { clearTimeout(t.timeout); clearInterval(t.interval); timers.delete(name); } return !!t; },
    async get(name) { return timers.has(name) ? { name } : undefined; },
    onAlarm: { addListener: (f) => onAlarm.push(f) },
  };

  // ── the rest ──────────────────────────────────────────────────────────
  const noopEvent = { addListener() {}, removeListener() {} };
  // The panel lives at the root and settings at /settings/: extension paths lead there, with query and #.
  const appUrl = (p) => new URL(p.replace(/^\//, '').replace(/^src\/sidepanel\/sidepanel(\.html)?/, '').replace(/^src\/options\/options(\.html)?/, 'settings/'), BASE).href;
  const onInstalled = [], onStartup = [];
  self.chrome = {
    runtime: {
      id: 'web',
      lastError: undefined,
      getURL: appUrl,
      getManifest: () => ({ version: document.documentElement.dataset.version || '' }),
      sendMessage,
      openOptionsPage: () => { location.assign(appUrl('src/options/options')); },
      onMessage: { addListener: (f) => onMessage.push(f), removeListener: (f) => { const i = onMessage.indexOf(f); if (i >= 0) onMessage.splice(i, 1); } },
      onInstalled: { addListener: (f) => onInstalled.push(f) },
      onStartup: { addListener: (f) => onStartup.push(f) },
      __ready: async () => {
        markReady();
        // First opening: like installing the extension. Afterwards: like a browser start.
        const first = !(await local.get('__installed'));
        if (first) await local.put('__installed', new Date().toISOString());
        for (const l of first ? onInstalled : onStartup) { try { await l({ reason: 'install' }); } catch (e) { console.error(e); } }
      },
    },
    storage: { local: area('local', local), session: area('session', session), onChanged: { addListener: (f) => changed.push(f), removeListener() {} } },
    i18n: { getUILanguage: () => navigator.language || 'it', getMessage: () => '' },
    tabs: {
      async create({ url }) {
        if (/welcome\.html/.test(url)) return {}; // the welcome page is for the extension
        if (url.startsWith(BASE)) location.assign(url); else window.open(url, '_blank', 'noopener');
        return {};
      },
      async query() { return [{ id: -1, url: location.href, title: document.title }]; },
      async update() { return {}; },
    },
    scripting: { async executeScript() { throw new Error(globalThis.AF_I18N.t('webCannotReadOtherTab')); } },
    alarms,
    notifications: {
      async create(id, o) {
        if (!('Notification' in self) || Notification.permission !== 'granted') return id;
        const n = new Notification(o.title, { body: o.message, icon: o.iconUrl, tag: id, requireInteraction: !!o.requireInteraction });
        n.onclick = () => { window.focus(); n.close(); };
        return id;
      },
      async clear() { return true; },
      onClicked: noopEvent, onButtonClicked: noopEvent,
    },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, removeAll(cb) { if (cb) cb(); }, onClicked: noopEvent },
    permissions: { async contains() { return true; }, async request() { return true; } },
  };
})();
