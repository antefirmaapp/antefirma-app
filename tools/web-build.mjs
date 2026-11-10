/**
 * AnteFirma web: la versione da usare (e installare) dal sito, senza estensione.
 *
 *     node tools/web-build.mjs [cartella]   (predefinita: ../antefirma-site/assets/app)
 *
 * È lo stesso codice dell'estensione — pannello, impostazioni e «sfondo» —
 * con web/shim.js che imita le API di Chrome nella pagina. Il sito la pubblica
 * su antefirma.app/app/ come app installabile (PWA): manifest, icone e un
 * service worker per aprirsi anche senza rete.
 *
 * Che cosa fa: analizza testo incollato e PDF, tiene impegni, scadenze,
 * promemoria, lettere e piano. Che cosa non può fare una pagina web: fermare i
 * click sugli altri siti e leggere le altre schede. Per quello c'è l'estensione.
 *
 * Il server deve ammettere l'origine del sito (APP_ORIGINS).
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '..', 'antefirma-site', 'assets', 'app'));
const BASE = '/app/';
// Il sito (Workers Static Assets) serve le pagine senza «.html»: si usano già gli indirizzi finali.
const PANEL = `${BASE}src/sidepanel/sidepanel`, OPTIONS = `${BASE}src/options/options`;
const version = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const p of ['background', 'core', 'i18n', 'lib', 'sidepanel', 'options', 'icons']) cpSync(join(ROOT, 'src', p), join(OUT, 'src', p), { recursive: true });
for (const f of ['shim.js', 'boot.js', 'web.css']) cpSync(join(ROOT, 'web', f), join(OUT, 'web', f));

/** Le due pagine ricevono lo strato web prima dei loro script. */
const HEAD = (extra = '') => `
  <meta name="theme-color" content="#15203a">
  <link rel="manifest" href="${BASE}manifest.webmanifest">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${BASE}icons/icon-192.png">
  <link rel="stylesheet" href="${BASE}web/web.css">
  <script src="${BASE}web/shim.js"></script>
  <script type="module" src="${BASE}web/boot.js"></script>${extra}
</head>`;
for (const [page, extra] of [['sidepanel/sidepanel.html', ''], ['options/options.html', '']]) {
  const f = join(OUT, 'src', page);
  let html = readFileSync(f, 'utf8')
    .replace('<html lang="it">', `<html lang="it" data-version="${version}">`)
    .replace('</head>', HEAD(extra));
  if (page.startsWith('options')) html = html.replace('<div class="wrap">', `<div class="wrap">\n    <a class="web-back" href="${PANEL}">← AnteFirma</a>`);
  writeFileSync(f, html);
}
// /app/ porta al pannello.
writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>AnteFirma</title><meta http-equiv="refresh" content="0; url=${PANEL}"><link rel="canonical" href="${PANEL}"><a href="${PANEL}">AnteFirma</a>\n`);

writeFileSync(join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'AnteFirma', short_name: 'AnteFirma',
  description: 'Prima di accettare, sai a che cosa ti impegni: analizza contratti e condizioni, ricorda le scadenze, scrive la lettera di disdetta.',
  id: BASE, start_url: PANEL, scope: BASE, display: 'standalone',
  background_color: '#f5f6f8', theme_color: '#15203a', lang: 'it',
  icons: [
    { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${BASE}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');

// Le icone: lo scudo del marchio, disegnato dal browser a 192 e 512 pixel.
const SHIELD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><path d="M32 4 L55.5 10 C57.5 10.6 58.5 12.2 58.5 14.2 V34 C58.5 48.5 48.5 59.5 34.2 66.6 C33.3 67.1 30.7 67.1 29.8 66.6 C15.5 59.5 5.5 48.5 5.5 34 V14.2 C5.5 12.2 6.5 10.6 8.5 10 Z" fill="#ffe04a"/><path d="M32 6.6 L52.9 11.9 C54.9 12.4 55.9 13.8 55.9 15.5 V32.4 C55.9 46.4 46.6 56.4 33.9 62.7 C33.3 63.2 30.7 63.2 30.1 62.7 C17.4 56.4 8.1 46.4 8.1 32.4 V15.5 C8.1 13.8 9.1 12.4 11.1 11.9 Z" fill="#15203a"/><path d="M32 15.5V37.5M22.47 21L41.53 32M22.47 32L41.53 21" stroke="#ffe04a" stroke-width="6.4" stroke-linecap="round"/><path d="M19 49.5 C22 44 26 43.5 29 47 S34.5 52 38 47.5 S43 42.5 45 43" fill="none" stroke="#ffe04a" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
mkdirSync(join(OUT, 'icons'), { recursive: true });
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad, bg] of [['icon-192', 192, 0.1, 'transparent'], ['icon-512', 512, 0.1, 'transparent'], ['maskable-512', 512, 0.22, '#15203a']]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}"><div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${SHIELD.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body></html>`);
  await page.screenshot({ path: join(OUT, 'icons', `${name}.png`), omitBackground: bg === 'transparent' });
}
await browser.close();

// Il service worker: i file dell'app in memoria, così si apre anche senza rete.
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(BASE + relative(OUT, p).split('\\').join('/')); } };
walk(OUT);
writeFileSync(join(OUT, 'sw.js'), `/* AnteFirma web ${version}: generato da tools/web-build.mjs. */
const CACHE = 'antefirma-web-${version}-${Date.now().toString(36)}';
const FILES = ${JSON.stringify(files.filter((f) => !f.endsWith('/sw.js')).map((f) => f.replace(/\/index\.html$/, '/').replace(/\.html$/, '')))};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// Prima la rete (gli aggiornamenti arrivano subito), la copia se la rete manca. Le API non passano di qui.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('${BASE}')) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
`);
console.log(`AnteFirma web ${version}: ${files.length} file in ${OUT}`);
