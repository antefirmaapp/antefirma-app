/*
 * AnteFirma web: le API dell'estensione, imitate con quelle del browser.
 *
 * La versione web usa lo stesso codice del pannello, delle impostazioni e del
 * «service worker» dell'estensione. Qui sotto c'è soltanto ciò che serve a
 * farlo girare in una pagina normale:
 *  - chrome.storage → IndexedDB (local) e memoria (session);
 *  - chrome.runtime.sendMessage → chiamata diretta allo sfondo, che gira nella stessa pagina;
 *  - chrome.alarms → timer, finché la finestra è aperta;
 *  - chrome.notifications → notifiche del browser, se la persona le permette.
 * Quello che una pagina web non può fare (leggere le altre schede, fermare un
 * click su un altro sito) non c'è: il pannello nasconde quelle funzioni.
 *
 * Script classico, caricato prima di tutti i moduli.
 */
(() => {
  const BASE = new URL('../', document.currentScript.src).href; // la radice della versione web (/app/)
  document.documentElement.dataset.web = '1';

  // ── archivio ──────────────────────────────────────────────────────────
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
  // Le altre finestre della versione web sentono i cambi (es. pannello e impostazioni aperti insieme).
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

  // ── messaggi fra pannello e sfondo, nella stessa pagina ────────────────
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

  // ── timer al posto degli allarmi ──────────────────────────────────────
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

  // ── il resto ──────────────────────────────────────────────────────────
  const noopEvent = { addListener() {}, removeListener() {} };
  // Il pannello vive alla radice e le impostazioni su /settings/: i percorsi dell'estensione portano lì, con query e #.
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
        // Prima apertura: come l'installazione dell'estensione. Poi: come un avvio del browser.
        const first = !(await local.get('__installed'));
        if (first) await local.put('__installed', new Date().toISOString());
        for (const l of first ? onInstalled : onStartup) { try { await l({ reason: 'install' }); } catch (e) { console.error(e); } }
      },
    },
    storage: { local: area('local', local), session: area('session', session), onChanged: { addListener: (f) => changed.push(f), removeListener() {} } },
    i18n: { getUILanguage: () => navigator.language || 'it', getMessage: () => '' },
    tabs: {
      async create({ url }) {
        if (/welcome\.html/.test(url)) return {}; // la pagina di benvenuto è per l'estensione
        if (url.startsWith(BASE)) location.assign(url); else window.open(url, '_blank', 'noopener');
        return {};
      },
      async query() { return [{ id: -1, url: location.href, title: document.title }]; },
      async update() { return {}; },
    },
    scripting: { async executeScript() { throw new Error('Nella versione web non si può leggere un\'altra scheda: incolla il testo o carica il PDF.'); } },
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
